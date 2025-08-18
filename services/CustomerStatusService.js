const prisma = require('../lib/prisma');

class CustomerStatusService {
    constructor() {
        // Test mode vs Production thresholds
        this.isTestMode = process.env.CRON_TEST_MODE === 'true';

        this.statusThresholds = this.isTestMode ? {
            // Testing thresholds (1 day for at_risk, 2 days for lost)
            atRisk: {
                defaultDays: 2,
                bufferDays: 0
            },
            lost: {
                defaultDays: 3,
                bufferDays: 0
            }
        } : {
            // Production thresholds
            atRisk: {
                defaultDays: 30,
                bufferDays: 5
            },
            lost: {
                defaultDays: 60,
                bufferDays: 15
            }
        };

        
    }

    // Calculate days between two dates
    calculateDaysBetween(date1, date2) {
        const diffTime = Math.abs(date2 - date1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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



            // Determine status
            if (daysSinceLastVisit >= lostThreshold) {

                return 'lost';
            } else if (daysSinceLastVisit >= atRiskThreshold) {
                return 'at_risk';
            } else {
                return 'active';
            }

        } catch (error) {
            console.error('Error determining customer status:', error);
            return null;
        }
    }

    // Update customer status in existing CustomerUser table (only if status actually changed)
    async updateCustomerStatus(customerId, newStatus, userId = null) {
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
                        const updateResult = await this.updateCustomerStatus(customer.id, newStatus);
                        
                        // Only count as updated if status actually changed
                        if (updateResult?.statusChanged) {
                            results.updated++;
                            // Only count status changes for newly updated customers
                            results[newStatus]++;
                        }
                    }

                } catch (error) {
                    console.error(`Error processing customer ${customer.id}:`, error);
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
}

module.exports = CustomerStatusService;
