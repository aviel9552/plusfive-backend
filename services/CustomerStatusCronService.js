const cron = require('node-cron');
const prisma = require('../lib/prisma');

class CustomerStatusCronService {
    constructor() {
        this.jobs = new Map();
        this.isTestMode = process.env.CRON_TEST_MODE === 'true';

        const parseNumber = (value, fallback) => {
            const parsed = parseInt(value, 10);
            return Number.isNaN(parsed) ? fallback : parsed;
        };

        if (this.isTestMode) {
            this.statusThresholds = {
                risk: parseNumber(process.env.AT_RISK_TEST_MINUTES, 1),
                lost: parseNumber(process.env.LOST_TEST_MINUTES, 2)
            };

            this.schedules = {
                statusUpdate: '*/30 * * * * *', // Every 30 seconds in test mode
            };
        } else {
            this.statusThresholds = {
                risk: parseNumber(process.env.AT_RISK_DEFAULT_DAYS, 30),
                lost: parseNumber(process.env.LOST_DEFAULT_DAYS, 60)
            };

            this.schedules = {
                statusUpdate: '0 */6 * * *',    // Every 6 hours for production
            };
        }

        const unit = this.isTestMode ? 'minute(s)' : 'day(s)';
        console.log(`CustomerStatusCronService running in ${this.isTestMode ? 'TEST' : 'PRODUCTION'} mode (risk: ${this.statusThresholds.risk} ${unit}, lost: ${this.statusThresholds.lost} ${unit})`);
    }

    // Get last activity (appointment or payment) for a customer with a specific user
    async getLastActivityDate(customerId, userId) {
        try {
            // Get last appointment for this customer-user combination
            const lastAppointment = await prisma.appointment.findFirst({
                where: { 
                    customerId: customerId,
                    userId: userId
                },
                orderBy: { updatedAt: 'desc' },
                select: { updatedAt: true }
            });

            // Get last successful payment for this customer-user combination
            const lastPayment = await prisma.paymentWebhook.findFirst({
                where: { 
                    customerId: customerId,
                    userId: userId,
                    status: 'success'
                },
                orderBy: { paymentDate: 'desc' },
                select: { paymentDate: true }
            });

            let lastActivityDate = null;
            let activityType = null;

            // Compare and get the most recent activity
            if (lastAppointment && lastPayment) {
                const appointmentDate = new Date(lastAppointment.updatedAt);
                const paymentDate = new Date(lastPayment.paymentDate);
                
                if (appointmentDate > paymentDate) {
                    lastActivityDate = appointmentDate;
                    activityType = 'appointment';
                } else {
                    lastActivityDate = paymentDate;
                    activityType = 'payment';
                }
            } else if (lastAppointment) {
                lastActivityDate = new Date(lastAppointment.updatedAt);
                activityType = 'appointment';
            } else if (lastPayment) {
                lastActivityDate = new Date(lastPayment.paymentDate);
                activityType = 'payment';
            }

            return { lastActivityDate, activityType };
        } catch (error) {
            console.error(`❌ Error getting last activity for customer ${customerId}:`, error);
            return { lastActivityDate: null, activityType: null };
        }
    }

    // Calculate days between two dates
    calculateDaysBetween(date1, date2) {
        const diffTime = Math.abs(date2 - date1);
        if (this.isTestMode) {
            return Math.ceil(diffTime / (1000 * 60)); // minutes
        }
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Determine new status based on activity
    determineNewStatus(currentStatus, daysSinceLastActivity) {
        // If no activity data, keep current status
        if (daysSinceLastActivity === null) {
            return currentStatus;
        }

        // Determine status based on days since last activity
        if (daysSinceLastActivity >= this.statusThresholds.lost) {
            return 'lost';
        } else if (daysSinceLastActivity >= this.statusThresholds.risk) {
            return 'at_risk';
        } else {
            // Customer has recent activity
            if (currentStatus === 'lost' || currentStatus === 'at_risk') {
                return 'recovered'; // Customer returned after being lost/at risk
            } else if (currentStatus === 'new') {
                return 'active'; // New customer with multiple activities becomes active
            } else if (currentStatus === 'recovered') {
                return 'recovered'; // Recovered customers stay recovered
            } else {
                return 'active'; // Active customers stay active
            }
        }
    }

    // Generate reason for status change
    generateStatusChangeReason(oldStatus, newStatus, daysSinceLastActivity, activityType) {
        const oldStatusCap = this.capitalizeStatus(oldStatus);
        const newStatusCap = this.capitalizeStatus(newStatus);

        const unit = this.isTestMode ? 'minutes' : 'days';

        if (newStatus === 'at_risk') {
            return `No ${activityType || 'activity'} for ${daysSinceLastActivity} ${unit} (threshold: ${this.statusThresholds.risk} ${unit})`;
        } else if (newStatus === 'lost') {
            return `No ${activityType || 'activity'} for ${daysSinceLastActivity} ${unit} (threshold: ${this.statusThresholds.lost} ${unit})`;
        } else if (newStatus === 'recovered') {
            if (oldStatus === 'lost') {
                return `Customer returned with ${activityType || 'activity'} after being lost`;
            } else if (oldStatus === 'at_risk') {
                return `Customer returned with ${activityType || 'activity'} after being at risk`;
            }
            return `Customer recovered and maintaining recovered status`;
        } else if (newStatus === 'active') {
            if (oldStatus === 'new') {
                return `Customer became active with regular ${activityType || 'activity'}`;
            }
            return `Customer maintaining active status with ${activityType || 'activity'}`;
        }

        return `Status changed from ${oldStatusCap} to ${newStatusCap} based on ${activityType || 'activity'}`;
    }

    // Helper method to capitalize status
    capitalizeStatus(status) {
        if (!status) return null;
        
        const statusMap = {
            'new': 'New',
            'active': 'Active',
            'at_risk': 'Risk',
            'risk': 'Risk',
            'lost': 'Lost',
            'recovered': 'Recovered'
        };
        
        return statusMap[status.toLowerCase()] || status;
    }

    // Create CustomerStatusLog entry
    async createStatusLogEntry(customerId, userId, oldStatus, newStatus, reason) {
        try {
            const statusLog = await prisma.customerStatusLog.create({
                data: {
                    customerId: customerId,
                    userId: userId,
                    oldStatus: this.capitalizeStatus(oldStatus),
                    newStatus: this.capitalizeStatus(newStatus),
                    reason: reason,
                    changedAt: new Date()
                }
            });

            return statusLog;
        } catch (error) {
            console.error('❌ Error creating status log entry:', error);
            return null;
        }
    }

    // Process a single customer's status
    async processCustomerStatus(customerUser) {
        try {
            const { customerId, userId, status: currentStatus } = customerUser;

            // Get customer details
            const customer = await prisma.customers.findUnique({
                where: { id: customerId },
                select: { 
                    id: true, 
                    customerFullName: true, 
                    customerPhone: true 
                }
            });

            if (!customer) {
                return null;
            }

            // Get last activity (appointment or payment)
            const { lastActivityDate, activityType } = await this.getLastActivityDate(customerId, userId);

            let daysSinceLastActivity = null;
            if (lastActivityDate) {
                daysSinceLastActivity = this.calculateDaysBetween(lastActivityDate, new Date());
            }

            // Determine new status
            const newStatus = this.determineNewStatus(currentStatus, daysSinceLastActivity);

            // Only update if status is changing
            if (currentStatus === newStatus) {
                return {
                    customerId,
                    customerName: customer.customerFullName,
                    currentStatus,
                    newStatus,
                    changed: false,
                    daysSinceLastActivity,
                    activityType
                };
            }

            // Update status in CustomerUser table
            const updateResult = await prisma.customerUser.updateMany({
                where: {
                    customerId: customerId,
                    userId: userId
                },
                data: {
                    status: newStatus,
                    updatedAt: new Date()
                }
            });

            if (updateResult.count > 0) {
                // Generate reason for status change
                const reason = this.generateStatusChangeReason(
                    currentStatus, 
                    newStatus, 
                    daysSinceLastActivity, 
                    activityType
                );

                // Create status log entry
                await this.createStatusLogEntry(
                    customerId,
                    userId,
                    currentStatus,
                    newStatus,
                    reason
                );


                return {
                    customerId,
                    customerName: customer.customerFullName,
                    currentStatus,
                    newStatus,
                    changed: true,
                    daysSinceLastActivity,
                    activityType,
                    reason
                };
            }

            return null;
        } catch (error) {
            console.error(`❌ Error processing customer ${customerUser.customerId}:`, error);
            return null;
        }
    }

    // Process all customer statuses
    async processAllCustomerStatuses(userId = null) {
        try {
            const userScope = userId ? `for user ${userId}` : 'for ALL USERS';
            
            const whereClause = userId ? { userId } : {};
            
            // Get all customer-user relationships
            const customerUsers = await prisma.customerUser.findMany({
                where: {
                    ...whereClause,
                    isDeleted: false
                },
                select: {
                    customerId: true,
                    userId: true,
                    status: true,
                    updatedAt: true
                },
                orderBy: { updatedAt: 'asc' }
            });


            const results = {
                processed: 0,
                updated: 0,
                new: 0,
                active: 0,
                at_risk: 0,
                lost: 0,
                recovered: 0,
                errors: 0,
                details: []
            };

            // Process each customer-user relationship
            for (const customerUser of customerUsers) {
                try {
                    results.processed++;
                    
                    const result = await this.processCustomerStatus(customerUser);
                    
                    if (result) {
                        results.details.push(result);
                        
                        if (result.changed) {
                            results.updated++;
                            // Count status changes
                            if (results[result.newStatus] !== undefined) {
                                results[result.newStatus]++;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error processing customer-user ${customerUser.customerId}-${customerUser.userId}:`, error);
                    results.errors++;
                }
            }


            return results;
        } catch (error) {
            console.error('❌ Error in processAllCustomerStatuses:', error);
            throw error;
        }
    }

    // Start the cron job
    startStatusUpdateJob() {
        const jobName = 'customer-status-update';
        
        if (this.jobs.has(jobName)) {
            this.jobs.get(jobName).destroy();
        }

        const job = cron.schedule(this.schedules.statusUpdate, async () => {
            try {
                await this.processAllCustomerStatuses(null); // Process all users
            } catch (error) {
                console.error('❌ Scheduled status update error:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Kolkata"
        });

        this.jobs.set(jobName, job);
        
        
        return job;
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

    // Manual trigger for immediate execution
    async triggerStatusUpdate() {
        try {
            const result = await this.processAllCustomerStatuses(); // Always process all users
            return result;
        } catch (error) {
            console.error('❌ Manual trigger error:', error);
            throw error;
        }
    }

    // Get recent status changes
    async getRecentStatusChanges(userId = null, limitHours = 24) {
        try {
            const hoursAgo = new Date(Date.now() - limitHours * 60 * 60 * 1000);
            const whereClause = userId ? { userId } : {};

            const recentChanges = await prisma.customerStatusLog.findMany({
                where: {
                    ...whereClause,
                    changedAt: {
                        gte: hoursAgo
                    }
                },
                include: {
                    customer: {
                        select: {
                            customerFullName: true,
                            customerPhone: true
                        }
                    },
                    user: {
                        select: {
                            businessName: true
                        }
                    }
                },
                orderBy: { changedAt: 'desc' }
            });

            return recentChanges.map(change => ({
                id: change.id,
                customerId: change.customerId,
                customerName: change.customer.customerFullName,
                customerPhone: change.customer.customerPhone,
                userId: change.userId,
                businessName: change.user.businessName,
                oldStatus: change.oldStatus,
                newStatus: change.newStatus,
                reason: change.reason,
                changedAt: change.changedAt
            }));
        } catch (error) {
            console.error('Error getting recent status changes:', error);
            return [];
        }
    }
}

module.exports = CustomerStatusCronService;
