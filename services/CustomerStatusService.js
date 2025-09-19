const prisma = require('../lib/prisma');
const N8nMessageService = require('./N8nMessageService');

class CustomerStatusService {
    constructor() {
        // Test mode vs Production thresholds
        this.isTestMode = process.env.CRON_TEST_MODE === 'true';

        this.statusThresholds = this.isTestMode ? {
            // Testing thresholds - from environment variables
            atRisk: {
                defaultDays: parseInt(process.env.AT_RISK_TEST_DAYS) || 2,
                bufferDays: 0
            },
            lost: {
                defaultDays: parseInt(process.env.LOST_TEST_DAYS) || 3,
                bufferDays: 0
            }
        } : {
            // Production thresholds - from environment variables
            atRisk: {
                defaultDays: parseInt(process.env.AT_RISK_DEFAULT_DAYS) || 30,
                bufferDays: parseInt(process.env.AT_RISK_BUFFER_DAYS) || 5
            },
            lost: {
                defaultDays: parseInt(process.env.LOST_DEFAULT_DAYS) || 60,
                bufferDays: parseInt(process.env.LOST_BUFFER_DAYS) || 15
            }
        };

        this.n8nService = new N8nMessageService();
    }

    // Calculate days between two dates
    calculateDaysBetween(date1, date2) {
        const diffTime = Math.abs(date2 - date1);
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
                return `No activity for ${daysSinceLastVisit} days (threshold: ${threshold} days)`;

            case 'lost':
                return `No activity for ${daysSinceLastVisit} days (threshold: ${threshold} days)`;

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

    // Calculate average days between customer visits
    async calculateAverageDaysBetweenVisits(customerId) {
        try {
            const appointments = await prisma.appointment.findMany({
                where: { customerId },
                orderBy: { startDate: 'asc' },
                select: { startDate: true }
            });

            if (appointments.length < 2) {
                return null; // Not enough data for average
            }

            let totalDays = 0;
            let validIntervals = 0;

            for (let i = 1; i < appointments.length; i++) {
                const prevDate = new Date(appointments[i - 1].startDate);
                const currentDate = new Date(appointments[i].startDate);

                if (prevDate && currentDate) {
                    totalDays += this.calculateDaysBetween(prevDate, currentDate);
                    validIntervals++;
                }
            }

            return validIntervals > 0 ? Math.round(totalDays / validIntervals) : null;
        } catch (error) {
            console.error('Error calculating average days:', error);
            return null;
        }
    }

    // Get last appointment updatedAt for customer with detailed comparison
    async getLastVisitDate(customerId) {
        try {
            const lastAppointment = await prisma.appointment.findFirst({
                where: { customerId },
                orderBy: { updatedAt: 'desc' }, // Get the most recently updated appointment
                select: { updatedAt: true, startDate: true }
            });

            if (lastAppointment) {
                const lastUpdatedAt = new Date(lastAppointment.updatedAt);
                const currentTime = new Date();

                // Calculate time difference
                const timeDifference = currentTime - lastUpdatedAt;
                const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
                const hoursDifference = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutesDifference = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));

                

                return lastUpdatedAt;
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

            const lastVisitDate = await this.getLastVisitDate(customerId);
            if (!lastVisitDate) {
                return 'new'; // No appointments yet
            }

                  const daysSinceLastVisit = this.calculateDaysBetween(lastVisitDate, new Date());
      let averageDays = await this.calculateAverageDaysBetweenVisits(customerId);

      // Force use default thresholds in test mode (ignore averageDays)
      if (this.isTestMode) {
        averageDays = null;

      }

      // No upcoming appointment check - only use updatedAt as requested

                  // Calculate thresholds
      let atRiskThreshold, lostThreshold;

      if (averageDays === null) {
        // First time customer or not enough data
        atRiskThreshold = this.statusThresholds.atRisk.defaultDays;
        lostThreshold = this.statusThresholds.lost.defaultDays;
      } else {
        // Regular customer with visit history
        atRiskThreshold = averageDays + this.statusThresholds.atRisk.bufferDays;
        lostThreshold = averageDays + this.statusThresholds.lost.bufferDays;
      }



            // Determine status based on days since last visit
            if (daysSinceLastVisit >= lostThreshold) {
                return 'lost';
            } else if (daysSinceLastVisit >= atRiskThreshold) {
                return 'at_risk';
            } else {
                // Customer is active (visited recently)
                // If they were previously lost/at_risk and now visited, they become recovered
                // If they are already recovered, they stay recovered
                // If they are already active, they stay active
                if (currentStatus === 'lost' || currentStatus === 'at_risk') {
                    return 'recovered';
                } else if (currentStatus === 'recovered') {
                    return 'recovered'; // Recovered customers stay recovered
                } else {
                    return 'active'; // Active customers stay active
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
                            phoneNumber: true
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
                        const webhookParams = {
                            customer_name: customer.customerFullName,
                            customer_phone: customer.customerPhone,
                            business_name: customer.user?.businessName || 'Business',
                            business_type: customer.user?.businessType || 'general',
                            customer_service: customer.selectedServices || '',
                            business_owner_phone: customer.user?.phoneNumber || customer.user?.whatsappNumber,
                            last_visit_date: daysSinceLastVisit ? new Date(Date.now() - (daysSinceLastVisit * 24 * 60 * 60 * 1000)).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                            whatsapp_phone: customer.customerPhone
                        };

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

                        console.log(`✅ N8n webhook triggered for ${newStatus} status change - Customer: ${customer.customerFullName}`);
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
                    const newStatus = await this.determineCustomerStatus(customer.id);
                    results.processed++;

                    if (newStatus) {
                        // Get additional context for better logging
                        const lastVisitDate = await this.getLastVisitDate(customer.id);
                        const daysSinceLastVisit = lastVisitDate ? 
                            this.calculateDaysBetween(lastVisitDate, new Date()) : 0;
                        
                        // Calculate threshold used for this customer
                        const averageDays = await this.calculateAverageDaysBetweenVisits(customer.id);
                        let threshold = 0;
                        
                        if (newStatus === 'at_risk') {
                            threshold = averageDays === null ? 
                                this.statusThresholds.atRisk.defaultDays : 
                                averageDays + this.statusThresholds.atRisk.bufferDays;
                        } else if (newStatus === 'lost') {
                            threshold = averageDays === null ? 
                                this.statusThresholds.lost.defaultDays : 
                                averageDays + this.statusThresholds.lost.bufferDays;
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
