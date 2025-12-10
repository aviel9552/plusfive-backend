const cron = require('node-cron');
const CustomerStatusService = require('./CustomerStatusService');
const WhatsAppService = require('./WhatsAppService');
// Note: reportUsageForMonth removed - now using real-time reporting when WhatsApp messages are sent

class CronJobService {
  constructor() {
    this.jobs = new Map();
    this.customerStatusService = new CustomerStatusService();
    this.whatsappService = new WhatsAppService();
    // Test mode vs Production schedules
    this.isTestMode = process.env.CRON_TEST_MODE === 'true';
    
    console.log('isTestMode', this.isTestMode);
    
    this.schedules = {
      production: {
        // job1: '0 */6 * * *',  // DISABLED - Redundant! Job 2 & 3 already update all statuses (Every 6 hours)
        job2: '0 9 * * *',    // Daily 9:00 AM - At Risk check (also updates all statuses)
        job3: '0 10 * * *',   // Daily 10:00 AM - Lost check (also updates all statuses)
        job4: '0 11 * * *'    // Daily 11:00 AM - Heartbeat
        // Note: Monthly usage reporting removed - now using real-time reporting
      },
      test: {
        // job1: '*/60 * * * * *', // DISABLED - Redundant! Job 2 & 3 already update all statuses (Every 60 seconds - Status Sync)
        job2: '*/120 * * * * *', // Every 120 seconds (2 minutes) - At Risk Check (also updates all statuses)
        job3: '*/300 * * * * *', // Every 300 seconds (5 minutes) - Lost Check (also updates all statuses)
        job4: '*/60 * * * * *' // Every 60 seconds (1 minute) - Heartbeat
        // Note: Monthly usage reporting removed - now using real-time reporting
      }
    };
  }

  // Start all cron jobs - Only scheduling, no actual processing
  startAllJobs() {
    const currentSchedules = this.isTestMode ? this.schedules.test : this.schedules.production;
    const mode = this.isTestMode ? 'TEST MODE' : 'PRODUCTION MODE';
    
    if (this.isTestMode) {
      console.log(`🕒 Starting cron jobs in ${mode}`);
      console.log(`   - Status Sync: DISABLED (redundant - Job 2 & 3 already update statuses)`);
      console.log(`   - At Risk Check: Every 2 minutes`);
      console.log(`   - Lost Check: Every 5 minutes`);
    } else {
      console.log(`🕒 Starting cron jobs in ${mode} - Production schedule`);
      console.log(`   - Status Sync: DISABLED (redundant - Job 2 & 3 already update statuses)`);
    }

    // Cron job 1 - COMMENTED OUT: Redundant! Job 2 & 3 already call processAllCustomerStatuses()
    // Status updates happen automatically in Job 2 (At Risk) and Job 3 (Lost)
    // if (currentSchedules.job1) {
    //   this.scheduleJob('cron-job-1', currentSchedules.job1, async () => {
    //     const startTime = new Date();
    //     console.log(`⏱️ [cron-job-1] Status sync started at ${startTime.toISOString()}`);
    //     try {
    //       const results = await this.customerStatusService.processAllCustomerStatuses();
    //       const endTime = new Date();
    //       const duration = ((endTime - startTime) / 1000).toFixed(2);
    //       console.log(`✅ [cron-job-1] Status sync completed in ${duration}s at ${endTime.toISOString()}`, {
    //         processed: results.processed,
    //         updated: results.updated,
    //         counts: {
    //           new: results.new,
    //           active: results.active,
    //           at_risk: results.at_risk,
    //           lost: results.lost,
    //           recovered: results.recovered
    //         },
    //         errors: results.errors
    //       });
    //     } catch (error) {
    //       console.error('❌ [cron-job-1] Status sync failed:', error.message);
    //     }
    //   });
    // }

    // Cron job 2 - At Risk
    this.scheduleJob('cron-job-2', currentSchedules.job2, async () => {
      const startTime = new Date();
      try {
        // Get current at_risk customers before status update
        const currentAtRiskCustomers = await this.customerStatusService.getCustomersByStatus('at_risk');
        const beforeCount = currentAtRiskCustomers.length;

        console.log(`⏱️ [cron-job-2] At-risk status update started at ${startTime.toISOString()}`);
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

        const endTime = new Date();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`✅ [cron-job-2] At-risk status update completed in ${duration}s at ${endTime.toISOString()}`, {
          processed: results.processed,
          updated: results.updated,
          counts: {
            new: results.new,
            active: results.active,
            at_risk: results.at_risk,
            lost: results.lost,
            recovered: results.recovered
          },
          errors: results.errors
        });

      } catch (error) {
        console.error('❌ At Risk Status Update Error:', error.message);
      }
    });

    // Cron job 3 - Lost customers
    this.scheduleJob('cron-job-3', currentSchedules.job3, async () => {
      const startTime = new Date();
      try {
        // Get current lost customers before status update
        const currentLostCustomers = await this.customerStatusService.getCustomersByStatus('lost');
        const beforeCount = currentLostCustomers.length;

        console.log(`⏱️ [cron-job-3] Lost status update started at ${startTime.toISOString()}`);
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

        const endTime = new Date();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`✅ [cron-job-3] Lost status update completed in ${duration}s at ${endTime.toISOString()}`, {
          processed: results.processed,
          updated: results.updated,
          counts: {
            new: results.new,
            active: results.active,
            at_risk: results.at_risk,
            lost: results.lost,
            recovered: results.recovered
          },
          errors: results.errors
        });

      } catch (error) {
        console.error('❌ Lost Status Update Error:', error.message);
      }
    });

    // Cron job 4
    this.scheduleJob('cron-job-4', currentSchedules.job4, async () => {
      console.log('⏱️ [cron-job-4] Heartbeat triggered');
    });

    // Note: Monthly usage reporting job removed
    // Usage is now reported in real-time when WhatsApp messages are sent:
    // - createWhatsappMessageWithValidation (webhookController.js)
    // - handlePaymentCheckoutWebhook (webhookController.js)
    // - updateCustomerStatus (CustomerStatusService.js) - when status changes to at_risk/lost/recovered

    // Summary log
    console.log(`\n✅ All cron jobs scheduled successfully in ${mode}`);
    if (this.isTestMode) {
      console.log(`📊 Test Mode Configuration (Schedule Only):`);
      console.log(`   - Job 1 (Status Sync): DISABLED (redundant - Job 2 & 3 already update statuses)`);
      console.log(`   - Job 2 (At Risk Check): Every 120 seconds (2 minutes) - Also updates all statuses`);
      console.log(`   - Job 3 (Lost Check): Every 300 seconds (5 minutes) - Also updates all statuses`);
      console.log(`   - Job 4 (Heartbeat): Every 60 seconds (1 minute)`);
      console.log(`   - Monthly Usage: REMOVED (now using real-time reporting)`);
      console.log(`\n⚠️ IMPORTANT: Test mode only affects cron schedule frequency.`);
      console.log(`   Thresholds are ALWAYS production-based (days), not test minutes.`);
      console.log(`   - Risk Threshold: ${process.env.AT_RISK_DEFAULT_DAYS || 30} days (production)`);
      console.log(`   - Lost Threshold: ${process.env.LOST_DEFAULT_DAYS || 60} days (production)`);
      console.log(`\n⏰ Test Mode Schedule:`);
      console.log(`   - Status Sync: DISABLED (redundant)`);
      console.log(`   - At Risk check runs every 2 minutes (updates all statuses)`);
      console.log(`   - Lost check runs every 5 minutes (updates all statuses)\n`);
    } else {
      console.log(`📊 Production Mode Configuration:`);
      console.log(`   - Risk Threshold: ${process.env.AT_RISK_DEFAULT_DAYS || 30} days`);
      console.log(`   - Lost Threshold: ${process.env.LOST_DEFAULT_DAYS || 60} days`);
    }
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
    
    // Log schedule info for verification
    if (this.isTestMode) {
      let scheduleDesc = '';
      if (name === 'cron-job-1') {
        scheduleDesc = 'DISABLED';
      } else if (name === 'cron-job-2') {
        scheduleDesc = 'Every 120 seconds (2 minutes) - Also updates all statuses';
      } else if (name === 'cron-job-3') {
        scheduleDesc = 'Every 300 seconds (5 minutes) - Also updates all statuses';
      } else if (name === 'cron-job-4') {
        scheduleDesc = 'Every 60 seconds (1 minute)';
      } else {
        scheduleDesc = 'Test Mode';
      }
      console.log(`📅 Scheduled ${name} with schedule: ${schedule} (${scheduleDesc})`);
    } else {
      console.log(`📅 Scheduled ${name} with schedule: ${schedule} (Production Mode)`);
    }
    
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
        // Note: This job is disabled - usage is now reported in real-time
        return { message: 'Usage reporting is now done in real-time when WhatsApp messages are sent. This manual trigger is disabled.' };
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
