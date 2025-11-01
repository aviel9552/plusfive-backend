const cron = require('node-cron');
const CustomerStatusService = require('./CustomerStatusService');
const WhatsAppService = require('./WhatsAppService');
const { reportUsageForMonth } = require('../lib/stripe');

class CronJobService {
  constructor() {
    this.jobs = new Map();
    this.customerStatusService = new CustomerStatusService();
    this.whatsappService = new WhatsAppService();
    // Test mode vs Production schedules
    this.isTestMode = process.env.CRON_TEST_MODE === 'true';
    this.schedules = {
      production: {
        job1: '0 */6 * * *',  // Every 6 hours
        job2: '0 9 * * *',    // Daily 9:00 AM
        job3: '0 10 * * *',   // Daily 10:00 AM
        job4: '0 11 * * *',   // Daily 11:00 AM
        monthlyUsage: '0 0 1 * *'  // Monthly on 1st at midnight (00:00)
      },
      test: {
        job1: '*/70 * * * * *', // Every 70 seconds (1 minute 10 seconds)
        job2: '*/70 * * * * *', // Every 70 seconds (1 minute 10 seconds)
        job3: '*/70 * * * * *', // Every 70 seconds (1 minute 10 seconds)
        job4: '*/70 * * * * *', // Every 70 seconds (1 minute 10 seconds)
        monthlyUsage: '*/120 * * * * *'  // Every 2 minutes for testing
      }
    };
  }

  // Start all cron jobs - Only scheduling, no actual processing
  startAllJobs() {
    const currentSchedules = this.isTestMode ? this.schedules.test : this.schedules.production;
    const mode = this.isTestMode ? 'TEST MODE (10 seconds)' : 'PRODUCTION MODE';

    // Cron job 1
    this.scheduleJob('cron-job-1', currentSchedules.job1, async () => {
      // Cron Job 1 executed
    });

    // Cron job 2 - At Risk
    this.scheduleJob('cron-job-2', currentSchedules.job2, async () => {
      try {
        // Get current at_risk customers before status update
        const currentAtRiskCustomers = await this.customerStatusService.getCustomersByStatus('at_risk');
        const beforeCount = currentAtRiskCustomers.length;

        // Call status update API for At Risk processing
        const results = await this.customerStatusService.processAllCustomerStatuses();

        // Get at_risk customers after status update
        const afterAtRiskCustomers = await this.customerStatusService.getCustomersByStatus('at_risk');
        const afterCount = afterAtRiskCustomers.length;

        // Send templates only to newly updated at_risk customers
        if (results.at_risk > 0) {
          // Get customers who just became at_risk (recently updated)
          const newlyAtRiskCustomers = await this.customerStatusService.getRecentlyUpdatedCustomers('at_risk');
          
          // Note: WhatsApp messaging now handled by N8N only
          let messagesSent = 0;
          for (const customer of newlyAtRiskCustomers) {
            try {
              // Messages will be sent via N8N webhook
              console.log(`📧 At-risk message queued for ${customer.customerFullName} via N8N`);
              messagesSent++;
            } catch (error) {
              console.error(`❌ Failed to queue message for ${customer.customerFullName}:`, error.message);
            }
          }
        }

      } catch (error) {
        console.error('❌ At Risk Status Update Error:', error.message);
      }
    });

    // Cron job 3 - Lost customers
    this.scheduleJob('cron-job-3', currentSchedules.job3, async () => {
      try {
        // Get current lost customers before status update
        const currentLostCustomers = await this.customerStatusService.getCustomersByStatus('lost');
        const beforeCount = currentLostCustomers.length;

        // Call status update API for Lost processing
        const results = await this.customerStatusService.processAllCustomerStatuses();

        // Get lost customers after status update
        const afterLostCustomers = await this.customerStatusService.getCustomersByStatus('lost');
        const afterCount = afterLostCustomers.length;

        // Send templates only to newly updated lost customers
        if (results.lost > 0) {
          // Get customers who just became lost (recently updated)
          const newlyLostCustomers = await this.customerStatusService.getRecentlyUpdatedCustomers('lost');
          
          // Note: WhatsApp messaging now handled by N8N only
          let messagesSent = 0;
          for (const customer of newlyLostCustomers) {
            try {
              // Messages will be sent via N8N webhook
              console.log(`📧 Lost customer message queued for ${customer.customerFullName} via N8N`);
              messagesSent++;
            } catch (error) {
              console.error(`❌ Failed to queue message for ${customer.customerFullName}:`, error.message);
            }
          }
        }

      } catch (error) {
        console.error('❌ Lost Status Update Error:', error.message);
      }
    });

    // Cron job 4
    this.scheduleJob('cron-job-4', currentSchedules.job4, async () => {
      // Cron Job 4 executed
    });

    // Monthly usage reporting job
    this.scheduleJob('monthly-usage', currentSchedules.monthlyUsage, async () => {
      try {
        await reportUsageForMonth();
      } catch (error) {
        console.error('❌ Monthly usage reporting error:', error.message);
      }
    });
  }

  // Schedule individual job
  scheduleJob(name, schedule, task) {
    if (this.jobs.has(name)) {
      this.jobs.get(name).destroy();
    }

    const job = cron.schedule(schedule, task, {
      scheduled: true,
      timezone: "Asia/Kolkata" // Set your timezone
    });

    this.jobs.set(name, job);
    return job;
  }

  // Stop specific job
  stopJob(name) {
    if (this.jobs.has(name)) {
      this.jobs.get(name).destroy();
      this.jobs.delete(name);
      return true;
    }
    return false;
  }

  // Stop all jobs
  stopAllJobs() {
    for (const [name, job] of this.jobs) {
      job.destroy();
    }
    this.jobs.clear();
  }

  // Get job status
  getJobStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        scheduled: job.scheduled,
        running: job.running || false
      };
    }
    return status;
  }

  // Manual trigger for testing - Direct service calls
  async triggerJob(jobName) {
    const triggers = {
      'update-statuses': async () => {
        return await this.customerStatusService.processAllCustomerStatuses();
      },
      'send-at-risk': async () => {
        const customers = await this.customerStatusService.getCustomersByStatus('at_risk');
        return { customersFound: customers.length, messagesSent: 0 };
      },
      'send-lost': async () => {
        const customers = await this.customerStatusService.getCustomersByStatus('lost');
        return { customersFound: customers.length, messagesSent: 0 };
      },
      'send-recovered': async () => {
        const customers = await this.customerStatusService.getCustomersByStatus('recovered');
        return { customersFound: customers.length, notificationsSent: 0 };
      },
      'report-usage': async () => {
        await reportUsageForMonth();
        return { message: 'Monthly usage reporting completed manually' };
      }
    };

    if (!triggers[jobName]) {
      throw new Error(`Invalid job name: ${jobName}`);
    }

    try {
      const result = await triggers[jobName]();
      return result;
    } catch (error) {
      console.error(`❌ Manual trigger error:`, error.message);
      throw error;
    }
  }
}

module.exports = CronJobService;
