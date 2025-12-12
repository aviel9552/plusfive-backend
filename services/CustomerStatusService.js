const prisma = require('../lib/prisma');
const N8nMessageService = require('./N8nMessageService');
const { createWhatsappMessageRecord } = require('../controllers/whatsappMessageController');

class CustomerStatusService {
    constructor() {
        // Test mode is only used for cron schedule frequency, not for thresholds
        // Always use production day-based thresholds regardless of test mode
        this.isTestMode = process.env.CRON_TEST_MODE === 'true';

        console.log('isTestMode', this.isTestMode, '(only affects cron schedule frequency, not thresholds)');

        const parseNumber = (value, fallback) => {
            const parsed = parseInt(value, 10);
            return Number.isNaN(parsed) ? fallback : parsed;
        };

        // Always use days as time unit (production logic)
        this.timeUnitLabel = 'days';

        // Always use production thresholds (day-based) regardless of test mode
        // Test mode only affects cron schedule frequency in CronJobService
        this.statusThresholds = {
            // Production thresholds - from environment variables
            atRisk: {
                defaultDays: parseNumber(process.env.AT_RISK_DEFAULT_DAYS, 30),
                bufferDays: parseNumber(process.env.AT_RISK_BUFFER_DAYS, 5)
            },
            lost: {
                defaultDays: parseNumber(process.env.LOST_DEFAULT_DAYS, 60),
                bufferDays: parseNumber(process.env.LOST_BUFFER_DAYS, 15)
            }
        };

        // Log the thresholds being used (always production, regardless of test mode)
        console.log('📊 Customer Status Thresholds (ALWAYS PRODUCTION):');
        console.log(`   - At Risk: ${this.statusThresholds.atRisk.defaultDays} days (default) + ${this.statusThresholds.atRisk.bufferDays} days (buffer)`);
        console.log(`   - Lost: ${this.statusThresholds.lost.defaultDays} days (default) + ${this.statusThresholds.lost.bufferDays} days (buffer)`);
        console.log(`   - Time Unit: ${this.timeUnitLabel}`);

        this.n8nService = new N8nMessageService();
    }

    // Calculate days between two dates
    // Always use days calculation (production logic) regardless of test mode
    calculateDaysBetween(date1, date2) {
        const diffTime = Math.abs(date2 - date1);
        // Always calculate in days (production logic)
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Create CustomerStatusLog entry for status changes
    async createStatusLogEntry(customerId, userId, oldStatus, newStatus, reason) {
        try {
            const statusLog = await prisma.customerStatusLog.create({
                data: {
                    customerId: customerId,
                    userId: userId,
                    oldStatus: oldStatus,
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

    // Helper method to capitalize status for consistency
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

    // Generate appropriate reason message for status changes
    generateStatusChangeReason(oldStatus, newStatus, daysSinceLastVisit, threshold) {
        const oldStatusCap = this.capitalizeStatus(oldStatus);
        const newStatusCap = this.capitalizeStatus(newStatus);

        if (!oldStatus && newStatus === 'new') {
            return 'Initial customer status assignment';
        }

        switch (newStatus) {
            case 'active':
                if (oldStatus === 'new') {
                    return 'Customer became active after first appointment';
                } else if (oldStatus === 'recovered') {
                    return 'Customer maintaining active status';
                }
                return 'Customer is actively booking appointments';

            case 'at_risk':
                return `No activity for ${daysSinceLastVisit} ${this.timeUnitLabel} (threshold: ${threshold} ${this.timeUnitLabel})`;

            case 'lost':
                return `No activity for ${daysSinceLastVisit} ${this.timeUnitLabel} (threshold: ${threshold} ${this.timeUnitLabel})`;

            case 'recovered':
                if (oldStatus === 'lost') {
                    return 'Customer returned after being lost';
                } else if (oldStatus === 'at_risk') {
                    return 'Customer returned after being at risk';
                }
                return 'Customer recovered and maintaining recovered status';

            default:
                return `Status changed from ${oldStatusCap || 'Unknown'} to ${newStatusCap}`;
        }
    }

    // Calculate running average of payment intervals
    // Logic: First payment = no data (use default), Second = interval itself, 
    //        Third+ = running average: (previous_average + new_interval) / 2
    async calculateRunningAveragePaymentInterval(customerId, userId = null) {
        try {
            // Get all successful payments for this customer, ordered by date
            const paymentWhere = {
                customerId: customerId,
                status: 'success'
            };
            if (userId) {
                paymentWhere.userId = userId;
            }

            const payments = await prisma.paymentWebhook.findMany({
                where: paymentWhere,
                orderBy: { paymentDate: 'asc' },
                select: { paymentDate: true }
            });

            // First payment: no data, return null (will use default)
            if (payments.length < 2) {
                return null;
            }

            // Second payment: return the interval itself
            if (payments.length === 2) {
                const firstDate = new Date(payments[0].paymentDate);
                const secondDate = new Date(payments[1].paymentDate);
                const interval = this.calculateDaysBetween(firstDate, secondDate);
                return interval;
            }

            // Third payment onwards: calculate running average
            // Start with the first interval (between payment 1 and 2)
            let runningAverage = this.calculateDaysBetween(
                new Date(payments[0].paymentDate),
                new Date(payments[1].paymentDate)
            );

            // For each subsequent payment, update running average: (old_average + new_interval) / 2
            for (let i = 2; i < payments.length; i++) {
                const prevDate = new Date(payments[i - 1].paymentDate);
                const currentDate = new Date(payments[i].paymentDate);
                const newInterval = this.calculateDaysBetween(prevDate, currentDate);
                
                // Running average formula: (previous_average + new_interval) / 2
                runningAverage = (runningAverage + newInterval) / 2;
            }

            return runningAverage;
        } catch (error) {
            console.error('Error calculating running average payment interval:', error);
            return null;
        }
    }

    // Legacy function - kept for backward compatibility but now uses payment intervals
    async calculateAverageDaysBetweenVisits(customerId, userId = null) {
        return await this.calculateRunningAveragePaymentInterval(customerId, userId);
    }

    // Get last visit date (payment date priority over appointment date)
    async getLastVisitDate(customerId, userId = null) {
        try {
            // Priority: Payment date over appointment date
            // Get last successful payment for this customer
            const paymentWhere = {
                customerId: customerId,
                status: 'success'
            };
            if (userId) {
                paymentWhere.userId = userId;
            }

            const lastPayment = await prisma.paymentWebhook.findFirst({
                where: paymentWhere,
                orderBy: { paymentDate: 'desc' },
                select: { paymentDate: true }
            });

            // Get last appointment for this customer (fallback if no payment)
            const appointmentWhere = {
                customerId: customerId
            };
            if (userId) {
                appointmentWhere.userId = userId;
            }

            const lastAppointment = await prisma.appointment.findFirst({
                where: appointmentWhere,
                orderBy: { updatedAt: 'desc' },
                select: { updatedAt: true }
            });

            // Priority: Payment date over appointment date
            if (lastPayment) {
                return new Date(lastPayment.paymentDate);
            } else if (lastAppointment) {
                return new Date(lastAppointment.updatedAt);
            }

            return null;
        } catch (error) {
            console.error('Error getting last visit date:', error);
            return null;
        }
    }

    // Determine customer status based on visit history using existing CustomerUser.status
    async determineCustomerStatus(customerId, userId = null) {
        try {
            const customer = await prisma.customers.findUnique({
                where: { id: customerId },
                select: {
                    id: true,
                    customerFullName: true,
                    userId: true
                }
            });

            if (!customer) return null;

            // Get current status from CustomerUser table
            const customerUser = await prisma.customerUser.findFirst({
                where: {
                    customerId: customerId,
                    userId: userId || customer.userId
                },
                select: { status: true }
            });

            const currentStatus = customerUser?.status || 'new';

            // Skip "new" status customers - don't process them at all
            // "new" status customers should remain "new" until payment is made
            // Payment webhook will update them to "active" after first payment
            if (currentStatus === 'new') {
                return 'new'; // Keep as new, don't update
            }

            const lastVisitDate = await this.getLastVisitDate(customerId, userId);
            if (!lastVisitDate) {
                return 'new'; // No payment or appointments yet
            }

            const daysSinceLastVisit = this.calculateDaysBetween(lastVisitDate, new Date());
            
            // Calculate running average of payment intervals
            // Logic: First payment = no data (use default), Second = interval itself,
            //        Third+ = running average: (previous_average + new_interval) / 2
            const runningAverage = await this.calculateRunningAveragePaymentInterval(customerId, userId);

            // Calculate thresholds based on running average
            let atRiskThreshold, lostThreshold;

            if (runningAverage === null) {
                // First payment or only one payment - use default thresholds
                atRiskThreshold = this.statusThresholds.atRisk.defaultDays; // 30
                lostThreshold = this.statusThresholds.lost.defaultDays;     // 60
            } else {
                // Use running average as the threshold
                // At Risk threshold = running average itself
                atRiskThreshold = runningAverage;
                // Lost threshold = 2x the running average (or use default if too small)
                lostThreshold = Math.max(runningAverage * 2, this.statusThresholds.lost.defaultDays);
            }


            // Determine status based on days since last visit
            // Important: Active/Recovered customers must go through "at_risk" first before "lost"
            // Status progression: active/recovered → at_risk → lost
            
            // Customer has recent activity (less than risk threshold)
            if (daysSinceLastVisit < atRiskThreshold) {
                // Recent activity - customer is active or recovered
                if (currentStatus === 'lost' || currentStatus === 'at_risk') {
                    return 'recovered'; // Customer returned after being lost/at risk
                } else if (currentStatus === 'recovered') {
                    return 'recovered'; // Recovered customers stay recovered
                } else {
                    return 'active'; // Active customers stay active
                }
            }
            // Customer crossed risk threshold but not lost threshold
            else if (daysSinceLastVisit >= atRiskThreshold && daysSinceLastVisit < lostThreshold) {
                // Active/Recovered customers must transition to at_risk first
                if (currentStatus === 'active' || currentStatus === 'recovered') {
                    return 'at_risk'; // Transition to at_risk
                } else if (currentStatus === 'at_risk') {
                    return 'at_risk'; // Stay at_risk until lost threshold
                } else {
                    return currentStatus; // lost stays lost
                }
            }
            // Customer crossed lost threshold
            else {
                // Active/Recovered customers must go through at_risk first
                // Only transition to lost if already at_risk
                if (currentStatus === 'active' || currentStatus === 'recovered') {
                    // Should have been at_risk first, but if somehow missed, go to at_risk now
                    return 'at_risk';
                } else if (currentStatus === 'at_risk') {
                    return 'lost'; // Transition from at_risk to lost
                } else {
                    return 'lost'; // Already lost, stay lost
                }
            }

        } catch (error) {
            console.error('Error determining customer status:', error);
            return null;
        }
    }

    // Update customer status in existing CustomerUser table (only if status actually changed)
    async updateCustomerStatus(customerId, newStatus, userId = null, additionalContext = {}) {
        try {
            const customer = await prisma.customers.findUnique({
                where: { id: customerId },
                include: {
                    user: {
                        select: {
                            businessName: true,
                            businessType: true,
                            phoneNumber: true,
                            whatsappNumber: true
                        }
                    }
                }
            });

            if (!customer) return null;

            // First check current status
            const currentCustomerUser = await prisma.customerUser.findFirst({
                where: {
                    customerId: customerId,
                    userId: userId || customer.userId
                },
                select: { status: true }
            });

            const currentStatus = currentCustomerUser?.status || 'new';

            // Skip "new" status customers - don't update them at all
            // "new" status customers should remain "new" until payment is made
            // Payment webhook will update them to "active" after first payment
            if (currentStatus === 'new') {
                return { ...customer, currentStatus: 'new', statusChanged: false };
            }

            // Only update if status is actually changing
            if (currentStatus === newStatus) {
                return { ...customer, currentStatus: newStatus, statusChanged: false };
            }

            // Generate appropriate reason for status change
            const { daysSinceLastVisit = 0, threshold = 0 } = additionalContext;
            const reason = this.generateStatusChangeReason(
                currentStatus, 
                newStatus, 
                daysSinceLastVisit, 
                threshold
            );

            // Update status in CustomerUser table only if different
            const updatedCustomerUser = await prisma.customerUser.updateMany({
                where: {
                    customerId: customerId,
                    userId: userId || customer.userId
                },
                data: {
                    status: newStatus,
                    updatedAt: new Date() // Manually update timestamp
                }
            });

            if (updatedCustomerUser.count > 0) {
                // Create CustomerStatusLog entry for the status change
                await this.createStatusLogEntry(
                    customerId,
                    userId || customer.userId,
                    this.capitalizeStatus(currentStatus),
                    newStatus,
                    reason
                );

                // Trigger n8n webhook for status changes (at_risk, lost, recovered)
                if (newStatus === 'at_risk' || newStatus === 'lost' || newStatus === 'recovered') {
                    try {
                        const businessUserId = userId || customer.userId;
                        
                        // Check if user has active subscription before sending WhatsApp messages
                        if (businessUserId) {
                            const prisma = require('../lib/prisma');
                            const user = await prisma.user.findUnique({
                                where: { id: businessUserId },
                                select: {
                                    id: true,
                                    subscriptionStatus: true,
                                    subscriptionExpirationDate: true,
                                    role: true
                                }
                            });

                            if (user && user.role !== 'admin') {
                                const subscriptionStatus = user.subscriptionStatus?.toLowerCase();
                                
                                // Block if subscription is not active
                                if (!subscriptionStatus || 
                                    subscriptionStatus === 'pending' || 
                                    subscriptionStatus === 'canceled' || 
                                    subscriptionStatus === 'inactive' ||
                                    subscriptionStatus === 'expired') {
                                    console.error(`❌ Subscription check failed for user ${businessUserId} - Status: ${subscriptionStatus} - WhatsApp message NOT sent`);
                                    return { 
                                        ...customer, 
                                        currentStatus: newStatus, 
                                        statusChanged: true,
                                        previousStatus: currentStatus,
                                        messageBlocked: true,
                                        reason: 'Subscription not active'
                                    };
                                }

                                // Check expiration date
                                if (user.subscriptionExpirationDate) {
                                    const now = new Date();
                                    const expirationDate = new Date(user.subscriptionExpirationDate);
                                    if (expirationDate < now) {
                                        console.error(`❌ Subscription expired for user ${businessUserId} - WhatsApp message NOT sent`);
                                        return { 
                                            ...customer, 
                                            currentStatus: newStatus, 
                                            statusChanged: true,
                                            previousStatus: currentStatus,
                                            messageBlocked: true,
                                            reason: 'Subscription expired'
                                        };
                                    }
                                }
                            }
                        }

                        // Always calculate offset in days (production logic)
                        const offsetMs = daysSinceLastVisit * 24 * 60 * 60 * 1000;

                        const webhookParams = {
                            customer_id: customerId,
                            user_id: userId || customer.userId,
                            customer_name: customer.customerFullName,
                            customer_phone: customer.customerPhone,
                            business_name: customer.user?.businessName || 'Business',
                            business_type: customer.user?.businessType || 'general',
                            customer_service: customer.selectedServices || '',
                            business_owner_phone: customer.user?.phoneNumber || customer.user?.whatsappNumber,
                            last_visit_date: daysSinceLastVisit ? new Date(Date.now() - offsetMs).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                            whatsapp_phone: customer.customerPhone
                        };

                        // Store WhatsApp message record BEFORE triggering N8N
                        // If subscription check fails, createWhatsappMessageRecord will return null
                        const whatsappMessageRecord = await createWhatsappMessageRecord(
                            customer.customerFullName, 
                            customer.customerPhone, 
                            newStatus, 
                            userId || customer.userId
                        );

                        // Only trigger N8N webhooks if WhatsApp message record was created successfully
                        // (which means subscription check passed)
                        if (whatsappMessageRecord) {
                            if (newStatus === 'at_risk') {
                                await this.n8nService.triggerAtRiskMessage(webhookParams);
                            } else if (newStatus === 'lost') {
                                await this.n8nService.triggerLostMessage(webhookParams);
                            } else if (newStatus === 'recovered') {
                                // Add additional parameters for recovered notification
                                webhookParams.previous_status = currentStatus;
                                webhookParams.future_appointment = 'Recent activity detected';
                                await this.n8nService.triggerRecoveredCustomerNotification(webhookParams);
                            }

                            console.log(`✅ WhatsApp message record created and N8n webhook triggered for ${newStatus} - Customer: ${customer.customerFullName}`);
                        } else {
                            console.log(`⚠️ WhatsApp message not sent for ${newStatus} - Customer: ${customer.customerFullName} - Subscription check failed or user not found`);
                        }
                    } catch (webhookError) {
                        console.error('❌ Error triggering n8n webhook for status change:', webhookError);
                        // Don't fail the status update if webhook fails
                    }
                }

                return { 
                    ...customer, 
                    currentStatus: newStatus, 
                    statusChanged: true,
                    previousStatus: currentStatus // Track previous status for recovered notifications
                };
            }

            return null;
        } catch (error) {
            console.error('Error updating customer status:', error);
            return null;
        }
    }

    // Process all customers and update their statuses
    async processAllCustomerStatuses(userId = null) {
        try {
            const whereClause = userId ? { userId } : {};

            const customers = await prisma.customers.findMany({
                where: whereClause,
                select: {
                    id: true,
                    customerFullName: true,
                    userId: true
                }
            });

            const results = {
                processed: 0,
                updated: 0,
                new: 0,
                active: 0,
                at_risk: 0,
                lost: 0,
                recovered: 0,
                errors: 0
            };

      

            for (const customer of customers) {
                try {
                    const newStatus = await this.determineCustomerStatus(customer.id, customer.userId);
                    results.processed++;

                    if (newStatus) {
                        // Get additional context for better logging
                        const lastVisitDate = await this.getLastVisitDate(customer.id, customer.userId);
                        const daysSinceLastVisit = lastVisitDate ? 
                            this.calculateDaysBetween(lastVisitDate, new Date()) : 0;
                        
                        // Calculate threshold used for this customer (for logging only)
                        // Use same logic as determineCustomerStatus - running average or default
                        const runningAverage = await this.calculateRunningAveragePaymentInterval(customer.id, customer.userId);
                        let threshold = 0;
                        
                        if (newStatus === 'at_risk') {
                            threshold = runningAverage === null ? 
                                this.statusThresholds.atRisk.defaultDays : 
                                runningAverage;
                        } else if (newStatus === 'lost') {
                            threshold = runningAverage === null ? 
                                this.statusThresholds.lost.defaultDays : 
                                Math.max(runningAverage * 2, this.statusThresholds.lost.defaultDays);
                        }

                        const updateResult = await this.updateCustomerStatus(
                            customer.id, 
                            newStatus, 
                            customer.userId,
                            { daysSinceLastVisit, threshold }
                        );
                        
                        // Only count as updated if status actually changed
                        if (updateResult?.statusChanged) {
                            results.updated++;
                            // Only count status changes for newly updated customers
                            results[newStatus]++;
                            
                        }
                    }

                } catch (error) {
                    console.error(`❌ Error processing customer ${customer.id}:`, error);
                    results.errors++;
                }
            }

    
            return results;

        } catch (error) {
            console.error('Error processing customer statuses:', error);
            throw error;
        }
    }

    // Get customers by status (calculate in real-time since no schema changes)
    async getCustomersByStatus(status, userId = null) {
        try {
            const whereClause = userId ? { userId } : {};

            const allCustomers = await prisma.customers.findMany({
                where: whereClause,
                include: {
                    user: {
                        select: {
                            id: true,
                            businessName: true,
                            phoneNumber: true
                        }
                    }
                },
                orderBy: { updatedAt: 'desc' }
            });

            // Filter customers by calculated status
            const filteredCustomers = [];
            for (const customer of allCustomers) {
                const calculatedStatus = await this.determineCustomerStatus(customer.id);
                if (calculatedStatus === status) {
                    filteredCustomers.push({ ...customer, calculatedStatus });
                }
            }

            return filteredCustomers;
        } catch (error) {
            console.error('Error getting customers by status:', error);
            return [];
        }
    }

    // Get status statistics (calculate in real-time)
    async getStatusStatistics(userId = null) {
        try {
            const whereClause = userId ? { userId } : {};

            const allCustomers = await prisma.customers.findMany({
                where: whereClause,
                select: { id: true }
            });

            const stats = {
                total: allCustomers.length,
                new: 0,
                active: 0,
                at_risk: 0,
                lost: 0,
                recovered: 0
            };

            // Calculate status for each customer
            for (const customer of allCustomers) {
                const status = await this.determineCustomerStatus(customer.id);
                if (status && stats.hasOwnProperty(status)) {
                    stats[status]++;
                }
            }

            return stats;
        } catch (error) {
            console.error('Error getting status statistics:', error);
            return null;
        }
    }

  // Get customers who were recently updated to a specific status (within last 2 minutes for testing)
  async getRecentlyUpdatedCustomers(status, userId = null) {
    try {
      // For testing: only customers updated within last 2 minutes (120 seconds)
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const whereClause = userId ? { userId } : {};

      // Get customers whose status was updated recently
      const recentlyUpdatedCustomers = await prisma.customerUser.findMany({
        where: {
          ...whereClause,
          status: status,
          updatedAt: {
            gte: twoMinutesAgo // Updated within last 2 minutes only
          }
        },
        include: {
          customer: {
            select: {
              id: true,
              customerFullName: true,
              firstName: true,
              customerPhone: true,
              userId: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      // Return customer data in the expected format
      return recentlyUpdatedCustomers.map(item => ({
        id: item.customer.id,
        customerFullName: item.customer.customerFullName,
        firstName: item.customer.firstName,
        customerPhone: item.customer.customerPhone,
        userId: item.customer.userId,
        statusUpdatedAt: item.updatedAt
      }));

    } catch (error) {
      console.error('Error getting recently updated customers:', error);
      return [];
    }
  }

  // Get recent status changes from CustomerStatusLog
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
              id: true,
              customerFullName: true,
              customerPhone: true
            }
          },
          user: {
            select: {
              id: true,
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

  // Get status change history for a specific customer
  async getCustomerStatusHistory(customerId, userId = null) {
    try {
      const whereClause = { customerId };
      if (userId) {
        whereClause.userId = userId;
      }

      const statusHistory = await prisma.customerStatusLog.findMany({
        where: whereClause,
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

      return statusHistory.map(entry => ({
        id: entry.id,
        customerName: entry.customer.customerFullName,
        customerPhone: entry.customer.customerPhone,
        businessName: entry.user.businessName,
        oldStatus: entry.oldStatus,
        newStatus: entry.newStatus,
        reason: entry.reason,
        changedAt: entry.changedAt
      }));

    } catch (error) {
      console.error('Error getting customer status history:', error);
      return [];
    }
  }
}

module.exports = CustomerStatusService;
