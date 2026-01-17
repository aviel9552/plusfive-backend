const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { constants } = require('../config');

class AdminDashboardController {
  // Get monthly performance metrics
  getMonthlyPerformance = async (req, res) => {
    try {

      const authenticatedUser = req.user;

      // Initialize counters
      const statusCounts = {
        active: 0,
        at_risk: 0,
        lost: 0,
        recovered: 0,
        new: 0
      };

      // Single optimized query to get customer status counts
      const statusCountsQuery = `
        SELECT 
          COALESCE(cu.status, 'active') as status,
          COUNT(*) as count
        FROM "customers" c
        LEFT JOIN "customer_users" cu ON c.id = cu."customerId" 
          AND cu."userId" = c."userId" 
          AND cu."isDeleted" = false
        ${authenticatedUser.role === constants.ROLES.USER ? 'WHERE c."userId" = $1' : 'WHERE 1=1'}
        GROUP BY COALESCE(cu.status, 'active')
      `;

      const statusParams = authenticatedUser.role === constants.ROLES.USER ? [authenticatedUser.userId] : [];
      const statusResults = await prisma.$queryRawUnsafe(statusCountsQuery, ...statusParams);

      // Process status counts
      for (const result of statusResults) {
        const status = result.status;
        const count = Number(result.count);
        if (statusCounts.hasOwnProperty(status)) {
          statusCounts[status] = count;
        }
      }

      const { month, year } = req.query;
      const currentDate = new Date();
      const targetMonth = month || currentDate.getMonth() + 1;
      const targetYear = year || currentDate.getFullYear();

      // Get start and end dates for the month
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

      // Get previous month for comparison
      const prevStartDate = new Date(targetYear, targetMonth - 2, 1);
      const prevEndDate = new Date(targetYear, targetMonth - 1, 0, 23, 59, 59);

      // Recovered Customers (customers with recovered status)
      const recoveredCustomers = await prisma.customerUser.count({
        where: {
          status: constants.CUSTOMER_STATUS.RECOVERED,
          updatedAt: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const prevRecoveredCustomers = await prisma.customerUser.count({
        where: {
          status: constants.CUSTOMER_STATUS.RECOVERED,
          updatedAt: {
            gte: prevStartDate,
            lte: prevEndDate
          }
        }
      });

      // Build where clause based on user role
      let where = {
        status: constants.PAYMENT_STATUS.SUCCESS // Only count successful payments
      };
      
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      // Recovered Revenue (payments with revenuePaymentStatus = 'recovered')
      const recoveredRevenue = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          paymentDate: {
            gte: startDate,
            lte: endDate
          },
          revenuePaymentStatus: constants.CUSTOMER_STATUS.RECOVERED
        },
        _sum: {
          total: true
        }
      });

      const prevRecoveredRevenue = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          paymentDate: {
            gte: prevStartDate,
            lte: prevEndDate
          },
          revenuePaymentStatus: constants.CUSTOMER_STATUS.RECOVERED
        },
        _sum: {
          total: true
        }
      });

      // Lost Revenue - Calculate based on lost customers (using getRevenueCounts logic)
      // For now, we'll use the same logic as recovered revenue but for lost status
      // Note: Lost revenue calculation might need custom logic based on your requirements
      const lostRevenue = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          paymentDate: {
            gte: startDate,
            lte: endDate
          },
          revenuePaymentStatus: constants.CUSTOMER_STATUS.LOST
        },
        _sum: {
          total: true
        }
      });

      const prevLostRevenue = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          paymentDate: {
            gte: prevStartDate,
            lte: prevEndDate
          },
          revenuePaymentStatus: constants.CUSTOMER_STATUS.LOST
        },
        _sum: {
          total: true
        }
      });

      // Customer LTV (average monthly value) - Average of all successful payments
      const customerLTV = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          paymentDate: {
            gte: startDate,
            lte: endDate
          }
        },
        _avg: {
          total: true
        }
      });

      const prevCustomerLTV = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          paymentDate: {
            gte: prevStartDate,
            lte: prevEndDate
          }
        },
        _avg: {
          total: true
        }
      });

      // Calculate percentage changes
      const calculatePercentageChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const response = {
        success: true,
        data: {
          recoveredCustomers: {
            value: recoveredCustomers,
            count: statusCounts.recovered || 0,
            change: calculatePercentageChange(recoveredCustomers, prevRecoveredCustomers),
            trend: recoveredCustomers >= prevRecoveredCustomers ? 'up' : 'down'
          },
          recoveredRevenue: {
            value: Math.round(recoveredRevenue._sum.total) || 0,
            change: calculatePercentageChange(
              Math.round(recoveredRevenue._sum.total) || 0,
              Math.round(prevRecoveredRevenue._sum.total) || 0
            ),
            trend: (Math.round(recoveredRevenue._sum.total) || 0) >= (Math.round(prevRecoveredRevenue._sum.total) || 0) ? 'up' : 'down'
          },
          lostRevenue: {
            value:  Math.round(lostRevenue._sum.total) || 0,
            count: statusCounts.lost || 0,
            change: calculatePercentageChange(
              lostRevenue._sum.total || 0,
              prevLostRevenue._sum.total || 0
            ),
            trend: (lostRevenue._sum.total || 0) >= (prevLostRevenue._sum.total || 0) ? 'up' : 'down'
          },
          customerLTV: {
            value: Math.round(customerLTV._avg.total || 0),
            change: calculatePercentageChange(
              customerLTV._avg.total || 0,
              prevCustomerLTV._avg.total || 0
            ),
            trend: (customerLTV._avg.total || 0) >= (prevCustomerLTV._avg.total || 0) ? 'up' : 'down'
          }
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting monthly performance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch monthly performance data',
        error: error.message
      });
    }
  }

  // Get revenue impact over months
  getRevenueImpact = async (req, res) => {
    try {
      const { months = 7, year } = req.query;
      const authenticatedUser = req.user;
      const currentDate = new Date();
      const targetYear = year ? parseInt(year) : currentDate.getFullYear();
      const revenueData = [];

      // Build where clause based on user role
      let where = {
        status: constants.PAYMENT_STATUS.SUCCESS // Only count successful payments
      };
      
      if (authenticatedUser && authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      for (let i = months - 1; i >= 0; i--) {
        // Calculate target date based on targetYear if provided, otherwise use current year
        const baseYear = targetYear || currentDate.getFullYear();
        const baseMonth = currentDate.getMonth();
        const targetDate = new Date(baseYear, baseMonth - i, 1);
        const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

        const monthRevenue = await prisma.paymentWebhook.aggregate({
          where: {
            ...where,
            paymentDate: {
              gte: startDate,
              lte: endDate
            }
          },
          _sum: {
            total: true
          }
        });

        revenueData.push({
          month: targetDate.toLocaleString('default', { month: 'long' }),
          revenue: monthRevenue._sum.total || 0,
          year: targetDate.getFullYear()
        });
      }
      res.json({
        success: true,
        data: revenueData
      });
    } catch (error) {
      console.error('Error getting revenue impact:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch revenue impact data',
        error: error.message
      });
    }
  }

  // Get Average Rating Counts - Month wise average rating data
  getAverageRatingCounts = async (req, res) => {
    try {
      const authenticatedUser = req.user;

      // Build where clause based on user role
      let where = {};
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      // Single optimized query to get all reviews with month grouping
      const monthlyRatingQuery = `
        SELECT 
          EXTRACT(MONTH FROM "createdAt") as month,
          AVG(rating) as avg_rating,
          COUNT(*) as total_reviews
        FROM "reviews"
        WHERE rating > 0 
        AND "createdAt" >= $1 
        AND "createdAt" <= $2
        ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
        GROUP BY EXTRACT(MONTH FROM "createdAt")
        ORDER BY month
      `;

      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
      const queryParams = authenticatedUser.role === constants.ROLES.USER 
        ? [yearStart, yearEnd, authenticatedUser.userId]
        : [yearStart, yearEnd];

      const monthlyResults = await prisma.$queryRawUnsafe(monthlyRatingQuery, ...queryParams);

      // Create monthly data array with all 12 months
      const monthlyData = [];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      for (let month = 1; month <= 12; month++) {
        const monthResult = monthlyResults.find(r => Number(r.month) === month);
        
        monthlyData.push({
          month: monthNames[month - 1],
          averageRating: monthResult ? Math.round(Number(monthResult.avg_rating) * 10) / 10 : 0,
          totalReviews: monthResult ? Number(monthResult.total_reviews) : 0,
          monthNumber: month
        });
      }

      // Calculate overall statistics from the same data (no additional query needed)
      const totalReviews = monthlyResults.reduce((sum, r) => sum + Number(r.total_reviews), 0);
      const overallAverage = totalReviews > 0 
        ? Math.round((monthlyResults.reduce((sum, r) => sum + (Number(r.avg_rating) * Number(r.total_reviews)), 0) / totalReviews) * 10) / 10
        : 0;

      return res.json({
        success: true,
        data: {
          monthlyData: monthlyData,
          overallStats: {
            totalReviews: totalReviews,
            averageRating: overallAverage,
            year: currentYear
          }
        }
      });

    } catch (error) {
      console.error('Error getting average rating counts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch average rating data',
        error: error.message
      });
    }
  }

  // Get Revenue Counts - Lost and Recovered customers count and revenue
  getRevenueCounts = async (req, res) => {
    try {
      const authenticatedUser = req.user;

      // Build where clause based on user role
      let where = {};
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      // Calculate recovered revenue directly from payment_webhooks using revenuePaymentStatus flag
      const recoveredPayments = await prisma.paymentWebhook.findMany({
        where: {
          status: constants.PAYMENT_STATUS.SUCCESS,
          revenuePaymentStatus: constants.CUSTOMER_STATUS.RECOVERED,
          ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
        },
        select: {
          customerId: true,
          total: true
        }
      });

      const totalRecoveredRevenue = recoveredPayments.reduce(
        (sum, payment) => sum + (payment.total || 0),
        0
      );

      // Total count of recovered payments (not unique customers)
      const recoveredCustomersCount = recoveredPayments.length;

      // Get customers who are currently in Lost or AtRisk status from CustomerUser table
      // IMPORTANT: Only calculate Lost Revenue for customers with CURRENT status: 'lost', 'at_risk', or 'risk'
      // DO NOT count customers with status: 'recovered', 'active', or 'new' in Lost Revenue calculation
      // 
      // Status filtering:
      // ✅ INCLUDED in Lost Revenue: 'lost', 'at_risk', 'risk'
      // ❌ EXCLUDED from Lost Revenue: 'recovered', 'active', 'new'
      //
      // When a customer's status changes from 'lost'/'at_risk'/'risk' to 'recovered' (after payment),
      // their CustomerUser status is updated to 'recovered', and they will NOT be included in this query.
      // This ensures that only customers who are CURRENTLY at_risk/lost are counted in Lost Revenue.
      const atRiskAndLostCustomers = await prisma.customerUser.findMany({
        where: {
          ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId }),
          status: {
            in: [constants.CUSTOMER_STATUS.LOST, constants.CUSTOMER_STATUS.AT_RISK, constants.CUSTOMER_STATUS.RISK] // ONLY these statuses are included in Lost Revenue
            // EXCLUDED: 'recovered', 'active', 'new' - these customers are NOT in Lost Revenue calculation
          },
          isDeleted: false // Only active customer-user relationships
        },
        select: {
          customerId: true,
          userId: true,
          status: true,
          updatedAt: true,
          customer: {
            select: {
              id: true,
              customerFullName: true,
              createdAt: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc' // Get latest status (most recent update first)
        }
      });

      // Get all customers for calculating average LTV (Average Lifetime Visits)
      // NOTE: For averageLTV calculation, we EXCLUDE customers with status 'new'
      // Only include: active, recovered, lost, at_risk, risk customers
      const allCustomers = await prisma.customers.findMany({
        where: {
          ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
        },
        select: {
          id: true,
          createdAt: true
        }
      });

      // Get customers with status 'new' to exclude them from LTV calculation
      const newStatusCustomers = await prisma.customerUser.findMany({
        where: {
          status: constants.CUSTOMER_STATUS.NEW,
          isDeleted: false,
          ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
        },
        select: {
          customerId: true
        }
      });
      const newStatusCustomerIds = new Set(newStatusCustomers.map(cu => cu.customerId));

      // Filter out customers with status 'new' for LTV calculation
      const customersForLTV = allCustomers.filter(c => !newStatusCustomerIds.has(c.id));

      // For Lost Revenue calculation, we ONLY count customers with status 'lost', 'at_risk', or 'risk'
      // IMPORTANT: Ignore active, new, and recovered status customers in Lost Revenue calculation
      const totalCustomersForLostRevenue = atRiskAndLostCustomers.length; // Only lost/at_risk/risk customers
      
      // For averageLTV calculation, EXCLUDE customers with status 'new'
      const totalCustomersForLTV = customersForLTV.length; // All customers EXCEPT 'new' status
      
      // Use totalCustomersForLostRevenue for Lost Revenue calculation
      const totalCustomers = totalCustomersForLostRevenue; // Only lost/at_risk/risk customers

      // Calculate average LTV (Average Lifetime Visits) using optimized aggregation queries
      // Formula: (Total number of successful payments by all customers) ÷ (Total number of customers)
      // IMPORTANT: Count ONLY successful payments, NOT appointments
      // Only count when customer arrives and pays (payment exists)
      // Example: Customer has 10 appointments but only 5 payments → count = 5
      // IMPORTANT: EXCLUDE customers with status 'new' from services count
      
      // Build where conditions for user role filtering
      const userId = authenticatedUser.userId;
      const userWhereCondition = authenticatedUser.role === constants.ROLES.USER 
        ? `AND a."userId" = '${userId}'` 
        : '';
      const paymentUserWhereCondition = authenticatedUser.role === constants.ROLES.USER 
        ? `AND pw."userId" = '${userId}'` 
        : '';
      
      // Build condition to exclude 'new' status customers
      const excludeNewStatusCondition = newStatusCustomerIds.size > 0
        ? `AND c.id NOT IN (${Array.from(newStatusCustomerIds).map(id => `'${id}'`).join(', ')})`
        : '';
      
      const customerUserWhereCondition = authenticatedUser.role === constants.ROLES.USER 
        ? `WHERE c."userId" = '${userId}' ${excludeNewStatusCondition}`
        : excludeNewStatusCondition ? `WHERE ${excludeNewStatusCondition.replace('AND ', '')}` : '';

      // Optimized SQL query to get service counts per customer
      // Count appointments (primary) and payments (fallback) for each customer
      // EXCLUDE customers with status 'new'
      const servicesQuery = `
        SELECT 
          c.id as "customerId",
          COALESCE(appointment_counts.total_appointments, 0) as "appointmentCount",
          COALESCE(payment_counts.total_payments, 0) as "paymentCount"
        FROM "customers" c
        LEFT JOIN (
          SELECT 
            a."customerId",
            COUNT(*) as total_appointments
          FROM "appointments" a
          WHERE a."customerId" IS NOT NULL ${userWhereCondition}
          GROUP BY a."customerId"
        ) appointment_counts ON c.id = appointment_counts."customerId"
        LEFT JOIN (
          SELECT 
            pw."customerId",
            COUNT(*) as total_payments
          FROM "payment_webhooks" pw
          WHERE pw."customerId" IS NOT NULL 
            AND pw.status = '${constants.PAYMENT_STATUS.SUCCESS}' ${paymentUserWhereCondition}
          GROUP BY pw."customerId"
        ) payment_counts ON c.id = payment_counts."customerId"
        ${customerUserWhereCondition}
      `;

      // Execute the query
      const servicesResults = await prisma.$queryRawUnsafe(servicesQuery);
      
      // Calculate total services received (only for non-'new' customers)
      // IMPORTANT: Count ONLY successful payments, NOT appointments
      // Scenario: If customer has 10 appointments but only 5 payments, count = 5
      // Only count when customer arrives and pays (payment exists)
      let totalServicesReceived = 0;
      for (const result of servicesResults) {
        // Double check: exclude 'new' status customers (in case SQL query didn't filter properly)
        if (newStatusCustomerIds.has(result.customerId)) {
          continue;
        }
        
        // Count ONLY payments (successful payments)
        // Don't count appointments - only count when customer arrives and pays
        const paymentCount = Number(result.paymentCount) || 0;
        totalServicesReceived += paymentCount;
      }
      
      // Calculate average: Total services (payments only) ÷ Total customers (excluding 'new' status)
      // NOTE: Use totalCustomersForLTV (customers EXCEPT 'new' status) for averageLTV calculation
      // Formula: averageLTV = totalSuccessfulPayments / totalCustomers (excluding 'new')
      const averageLTV = totalCustomersForLTV > 0 ? totalServicesReceived / totalCustomersForLTV : 0;

      // Calculate Lost Revenue - Optimized with batch queries
      // Formula: For each customer: ATV = revenue ÷ visits, Potential Value = ATV × visits
      // Final Lost Revenue = Sum of all potential values

      const lostCustomerDetails = [];
      let totalPotentialLostRevenue = 0;

      if (atRiskAndLostCustomers.length > 0) {
        // Get all customer IDs for batch queries
        const customerIds = atRiskAndLostCustomers.map(cu => cu.customer.id);
        
        // Batch query: Get appointment counts for all customers at once
        const appointmentCounts = await prisma.appointment.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: customerIds }
          },
          _count: {
            id: true
          }
        });
        const appointmentCountMap = new Map(
          appointmentCounts.map(ac => [ac.customerId, ac._count.id])
        );

        // Batch query: Get payment totals for all customers at once
        const paymentTotals = await prisma.paymentWebhook.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: customerIds },
            status: constants.PAYMENT_STATUS.SUCCESS,
            ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
          },
          _sum: {
            total: true
          },
          _count: {
            id: true
          }
        });
        const paymentTotalMap = new Map(
          paymentTotals.map(pt => [pt.customerId, { total: pt._sum.total || 0, count: pt._count.id }])
        );

        // Process each customer
        for (const customerUser of atRiskAndLostCustomers) {
          const customerId = customerUser.customer.id;
          const customerVisits = appointmentCountMap.get(customerId) || 0;
          const paymentData = paymentTotalMap.get(customerId) || { total: 0, count: 0 };
          const customerRevenue = paymentData.total;

          // Skip if no visits or revenue
          if (customerVisits === 0 || customerRevenue === 0) {
            continue;
          }

          // Calculate ATV and Potential Value
          const customerAverageTransaction = customerRevenue / customerVisits;
          const potentialValue = customerAverageTransaction * customerVisits;

          totalPotentialLostRevenue += potentialValue;

          lostCustomerDetails.push({
            customerId: customerId,
            customerName: customerUser.customer.customerFullName,
            currentStatus: customerUser.status,
            firstStatusChangeDate: null,
            totalPayments: paymentData.count,
            totalAppointments: customerVisits,
            customerVisits: customerVisits,
            totalSpent: customerRevenue,
            averageTransaction: Math.round(customerAverageTransaction * 100) / 100,
            potentialValue: Math.round(potentialValue * 100) / 100,
            customerLostRevenue: Math.round(potentialValue * 100) / 100
          });
        }
      }

      const totalLostRevenue = totalPotentialLostRevenue;
      
      return res.json({
        success: true,
        data: {
          // Recovered customer data
          totalRecoveredRevenue: Math.round(totalRecoveredRevenue * 100) / 100,
          recoveredCustomersCount: recoveredCustomersCount,
          
          // Lost revenue data
          totalLostRevenue: Math.round(totalLostRevenue * 100) / 100,
          averageLTV: Math.round(averageLTV * 100) / 100,
          lostCustomersCount: atRiskAndLostCustomers.length,
          lostCustomerDetails: lostCustomerDetails,
          
          // Additional metrics
          totalCustomers: allCustomers.length,
          averageTransactionValue: lostCustomerDetails.length > 0 
            ? Math.round((lostCustomerDetails.reduce((sum, customer) => sum + customer.averageTransaction, 0) / lostCustomerDetails.length) * 100) / 100 
            : 0
        }
      });
    } catch (error) {
      console.error('Error getting revenue counts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch revenue counts',
        error: error.message
      });
    }
  }

  // Calculate Lost Revenue for all lost customers
  // Lost Revenue = Average Transaction × LTV (in months)
  getLostRevenue = async (req, res) => {
    try {
      const authenticatedUser = req.user;

      // Build where clause based on user role
      let where = {};
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      // Get all customers based on user role
      const lostCustomers = await prisma.customerUser.findMany({
        where: {
          ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
        },
        include: {
          customer: {
            select: {
              id: true,
              customerFullName: true,
              userId: true
            }
          }
        }
      });

      let totalLostRevenue = 0;
      let averageLTV = 0;
      const customerDetails = [];

      for (const customerUser of lostCustomers) {
        const customerId = customerUser.customer.id;
        // Use customer creation date from customers table instead of customerUser table
        const customerCreatedDate = new Date(customerUser.customer.createdAt || customerUser.createdAt);
        const currentDate = new Date();

        // Calculate months active (LTV in months)
        const monthsActive = Math.max(1, Math.ceil((currentDate - customerCreatedDate) / (1000 * 60 * 60 * 24 * 30)));

        // Get all payments for this customer
        const customerPayments = await prisma.paymentWebhook.findMany({
          where: {
            customerId: customerId,
            status: constants.PAYMENT_STATUS.SUCCESS
          },
          select: {
            total: true
          }
        });

        if (customerPayments.length > 0) {
          // Calculate average payment amount
          const totalSpent = customerPayments.reduce((sum, payment) => sum + (payment.total || 0), 0);
          const averagePayment = totalSpent / customerPayments.length;

          // Calculate lost revenue for this customer
          const customerLostRevenue = averagePayment * monthsActive;
          totalLostRevenue += customerLostRevenue;

          customerDetails.push({
            customerId: customerId,
            customerName: customerUser.customer.customerFullName,
            createdDate: customerCreatedDate,
            monthsActive: monthsActive,
            totalPayments: customerPayments.length,
            totalSpent: totalSpent,
            averagePayment: Math.round(averagePayment * 100) / 100,
            lostRevenue: Math.round(customerLostRevenue * 100) / 100
          });
        }
      }

      // Calculate average LTV across all lost customers
      if (customerDetails.length > 0) {
        averageLTV = customerDetails.reduce((sum, customer) => sum + customer.monthsActive, 0) / customerDetails.length;
      }

      return res.json({
        success: true,
        data: {
          totalLostRevenue: Math.round(totalLostRevenue * 100) / 100,
          averageLTV: Math.round(averageLTV * 100) / 100,
          lostCustomersCount: lostCustomers.length,
          customerDetails: customerDetails
        }
      });

    } catch (error) {
      console.error('Error calculating lost revenue:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to calculate lost revenue',
        error: error.message
      });
    }
  }

  // Get Revenue Impact with filters (same as backup code structure)
  getRevenueImpacts = async (req, res) => {
    try {
      const authenticatedUser = req.user;

      // Get data for different periods in parallel for better performance
      const [monthlyData, weeklyData, lastMonthData, yearlyData] = await Promise.all([
        this.getRevenuePeriodData('monthly', authenticatedUser),
        this.getRevenuePeriodData('weekly', authenticatedUser),
        this.getRevenuePeriodData('last-month', authenticatedUser),
        this.getRevenuePeriodData('yearly', authenticatedUser)
      ]);

      return res.json({
        success: true,
        data: {
          monthly: monthlyData,
          weekly: weeklyData,
          lastMonth: lastMonthData,
          yearly: yearlyData
        }
      });

    } catch (error) {
      console.error('Error getting revenue impacts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch revenue impact data',
        error: error.message
      });
    }
  }

  // Helper function to get revenue period data - OPTIMIZED
  async getRevenuePeriodData(period, authenticatedUser) {
    try {
      let where = {};
      
      // If user role is 'user', only show their data
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      let data = [];
      
      switch (period) {
        case 'monthly':
          // Get last 6 months data with single optimized query
          const sixMonthsAgo = new Date(currentYear, currentDate.getMonth() - 5, 1);
          const monthlyEndDate = new Date(currentYear, currentDate.getMonth() + 1, 0, 23, 59, 59);
          
          const monthlyQuery = `
            SELECT 
              EXTRACT(YEAR FROM "paymentDate") as year,
              EXTRACT(MONTH FROM "paymentDate") as month,
              SUM(total) as total_revenue,
              SUM("totalWithoutVAT") as total_without_vat,
              SUM("totalVAT") as total_vat,
              COUNT(*) as transaction_count
            FROM "payment_webhooks"
            WHERE status = '${constants.PAYMENT_STATUS.SUCCESS}'
            AND "revenuePaymentStatus" = '${constants.CUSTOMER_STATUS.RECOVERED}'
            AND "paymentDate" >= $1
            AND "paymentDate" <= $2
            ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(YEAR FROM "paymentDate"), EXTRACT(MONTH FROM "paymentDate")
            ORDER BY year, month
          `;
          
          const monthlyParams = authenticatedUser.role === constants.ROLES.USER 
            ? [sixMonthsAgo, monthlyEndDate, authenticatedUser.userId]
            : [sixMonthsAgo, monthlyEndDate];
            
          const monthlyResults = await prisma.$queryRawUnsafe(monthlyQuery, ...monthlyParams);
          
          // Build monthly data array (same structure as backup)
          for (let i = 5; i >= 0; i--) {
            const targetDate = new Date(currentYear, currentDate.getMonth() - i, 1);
            const targetYear = targetDate.getFullYear();
            const targetMonth = targetDate.getMonth() + 1;
            
            const monthResult = monthlyResults.find(r => 
              Number(r.year) === targetYear && Number(r.month) === targetMonth
            );
            
            data.push({
              label: targetDate.toLocaleString('default', { month: 'short' }),
              revenue: monthResult ? Number(monthResult.total_revenue) : 0,
              revenueWithoutVAT: monthResult ? Number(monthResult.total_without_vat) : 0,
              vat: monthResult ? Number(monthResult.total_vat) : 0,
              transactionCount: monthResult ? Number(monthResult.transaction_count) : 0,
              month: targetDate.getMonth() + 1,
              year: targetDate.getFullYear()
            });
          }
          break;
          
        case 'weekly':
          // Get current month's weekly data - Optimized with single query  
          const currentMonthStart = new Date(currentYear, currentDate.getMonth(), 1);
          const currentMonthEnd = new Date(currentYear, currentDate.getMonth() + 1, 0, 23, 59, 59);
          
          // Get all payments for the month in one query
          const weeklyPayments = await prisma.paymentWebhook.findMany({
            where: {
              ...where,
              paymentDate: { gte: currentMonthStart, lte: currentMonthEnd },
              status: constants.PAYMENT_STATUS.SUCCESS,
              revenuePaymentStatus: constants.CUSTOMER_STATUS.RECOVERED
            },
            select: {
              total: true,
              totalWithoutVAT: true,
              totalVAT: true,
              paymentDate: true
            }
          });
          
          // Calculate weeks and group payments by week
          const weeksInCurrentMonth = [];
          let currentWeekNumber = 1;
          
          // Find the first Sunday of the month or before the month starts
          let currentWeekStartDate = new Date(currentMonthStart);
          const currentFirstDayOfWeek = currentMonthStart.getDay();
          
          if (currentFirstDayOfWeek !== 0) {
            currentWeekStartDate.setDate(currentMonthStart.getDate() - currentFirstDayOfWeek);
          }
          
          while (currentWeekStartDate <= currentMonthEnd) {
            let currentWeekEndDate = new Date(currentWeekStartDate);
            currentWeekEndDate.setDate(currentWeekStartDate.getDate() + 6);
            currentWeekEndDate.setHours(23, 59, 59, 999);
            
            const weekHasDaysInMonth = (currentWeekStartDate <= currentMonthEnd) && 
                                     (currentWeekEndDate >= currentMonthStart);
            
            if (weekHasDaysInMonth) {
              const queryStartDate = currentWeekStartDate < currentMonthStart ? currentMonthStart : currentWeekStartDate;
              const queryEndDate = currentWeekEndDate > currentMonthEnd ? currentMonthEnd : currentWeekEndDate;
              
              // Filter payments for this week
              const weekPayments = weeklyPayments.filter(p => {
                const paymentDate = new Date(p.paymentDate);
                return paymentDate >= queryStartDate && paymentDate <= queryEndDate;
              });
              
              const weekRevenue = weekPayments.reduce((sum, p) => sum + (p.total || 0), 0);
              const weekRevenueWithoutVAT = weekPayments.reduce((sum, p) => sum + (p.totalWithoutVAT || 0), 0);
              const weekVAT = weekPayments.reduce((sum, p) => sum + (p.totalVAT || 0), 0);
              
              weeksInCurrentMonth.push({
                label: `Week ${currentWeekNumber}`,
                revenue: weekRevenue,
                revenueWithoutVAT: weekRevenueWithoutVAT,
                vat: weekVAT,
                transactionCount: weekPayments.length,
                week: currentWeekNumber
              });
              
              currentWeekNumber++;
            }
            
            currentWeekStartDate = new Date(currentWeekEndDate);
            currentWeekStartDate.setDate(currentWeekEndDate.getDate() + 1);
            currentWeekStartDate.setHours(0, 0, 0, 0);
          }
          
          data = weeksInCurrentMonth;
          break;
          
        case 'last-month':
          // Last month's weekly data - Optimized with single query
          const lastMonthStart = new Date(currentYear, currentDate.getMonth() - 1, 1);
          const lastMonthEnd = new Date(currentYear, currentDate.getMonth(), 0, 23, 59, 59);
          
          // Get all payments for last month in one query
          const lastMonthPayments = await prisma.paymentWebhook.findMany({
            where: {
              ...where,
              paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
              status: constants.PAYMENT_STATUS.SUCCESS,
              revenuePaymentStatus: constants.CUSTOMER_STATUS.RECOVERED
            },
            select: {
              total: true,
              totalWithoutVAT: true,
              totalVAT: true,
              paymentDate: true
            }
          });
          
          // Calculate weeks and group payments by week
          const weeksInLastMonth = [];
          let lastMonthWeekNumber = 1;
          
          // Find the first Sunday of the month or before the month starts
          let lastMonthWeekStartDate = new Date(lastMonthStart);
          const lastMonthFirstDayOfWeek = lastMonthStart.getDay();
          
          if (lastMonthFirstDayOfWeek !== 0) {
            lastMonthWeekStartDate.setDate(lastMonthStart.getDate() - lastMonthFirstDayOfWeek);
          }
          
          while (lastMonthWeekStartDate <= lastMonthEnd) {
            let lastMonthWeekEndDate = new Date(lastMonthWeekStartDate);
            lastMonthWeekEndDate.setDate(lastMonthWeekStartDate.getDate() + 6);
            lastMonthWeekEndDate.setHours(23, 59, 59, 999);
            
            const weekHasDaysInMonth = (lastMonthWeekStartDate <= lastMonthEnd) && 
                                     (lastMonthWeekEndDate >= lastMonthStart);
            
            if (weekHasDaysInMonth) {
              const queryStartDate = lastMonthWeekStartDate < lastMonthStart ? lastMonthStart : lastMonthWeekStartDate;
              const queryEndDate = lastMonthWeekEndDate > lastMonthEnd ? lastMonthEnd : lastMonthWeekEndDate;
              
              // Filter payments for this week
              const weekPayments = lastMonthPayments.filter(p => {
                const paymentDate = new Date(p.paymentDate);
                return paymentDate >= queryStartDate && paymentDate <= queryEndDate;
              });
              
              const weekRevenue = weekPayments.reduce((sum, p) => sum + (p.total || 0), 0);
              const weekRevenueWithoutVAT = weekPayments.reduce((sum, p) => sum + (p.totalWithoutVAT || 0), 0);
              const weekVAT = weekPayments.reduce((sum, p) => sum + (p.totalVAT || 0), 0);
              
              weeksInLastMonth.push({
                label: `Week ${lastMonthWeekNumber}`,
                revenue: weekRevenue,
                revenueWithoutVAT: weekRevenueWithoutVAT,
                vat: weekVAT,
                transactionCount: weekPayments.length,
                week: lastMonthWeekNumber
              });
              
              lastMonthWeekNumber++;
            }
            
            lastMonthWeekStartDate = new Date(lastMonthWeekEndDate);
            lastMonthWeekStartDate.setDate(lastMonthWeekEndDate.getDate() + 1);
            lastMonthWeekStartDate.setHours(0, 0, 0, 0);
          }
          
          data = weeksInLastMonth;
          break;
          
        case 'yearly':
          // Get yearly data for last 3 years - optimized with single query
          const threeYearsAgo = new Date(currentYear - 2, 0, 1);
          const currentYearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
          
          const yearlyQuery = `
            SELECT 
              EXTRACT(YEAR FROM "paymentDate") as year,
              SUM(total) as total_revenue,
              SUM("totalWithoutVAT") as total_without_vat,
              SUM("totalVAT") as total_vat,
              COUNT(*) as transaction_count
            FROM "payment_webhooks"
            WHERE status = '${constants.PAYMENT_STATUS.SUCCESS}'
            AND "revenuePaymentStatus" = '${constants.CUSTOMER_STATUS.RECOVERED}'
            AND "paymentDate" >= $1
            AND "paymentDate" <= $2
            ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(YEAR FROM "paymentDate")
            ORDER BY year
          `;
          
          const yearlyParams = authenticatedUser.role === constants.ROLES.USER 
            ? [threeYearsAgo, currentYearEnd, authenticatedUser.userId]
            : [threeYearsAgo, currentYearEnd];
            
          const yearlyResults = await prisma.$queryRawUnsafe(yearlyQuery, ...yearlyParams);
          
          // Build yearly data array (same structure as backup)
          for (let year = currentYear - 2; year <= currentYear; year++) {
            const yearResult = yearlyResults.find(r => Number(r.year) === year);
            
            data.push({
              label: year.toString(),
              revenue: yearResult ? Number(yearResult.total_revenue) : 0,
              revenueWithoutVAT: yearResult ? Number(yearResult.total_without_vat) : 0,
              vat: yearResult ? Number(yearResult.total_vat) : 0,
              transactionCount: yearResult ? Number(yearResult.transaction_count) : 0
            });
          }
          break;
          
        default:
          throw new Error('Invalid period specified');
      }
      
      return data;
      
    } catch (error) {
      console.error('Error getting revenue period data:', error);
      throw error;
    }
  }

  // Get monthly LTV (Lifetime Value) data - Average revenue per customer per month
  // Formula: (Total revenue from all customers) ÷ (Total number of customers)
  // For each customer, sum up total amount spent from first payment until lost/inactive
  getMonthlyLTVCount = async (req, res) => {
    try {
      const authenticatedUser = req.user;
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

      // Get all customers for this user
      const allCustomers = await prisma.customers.findMany({
        where: {
          ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
        },
        select: {
          id: true,
          customerFullName: true,
          createdAt: true
        }
      });

      const totalCustomers = allCustomers.length;

      // Get ALL successful payments for customers (not just current year)
      // This includes payments from all time to calculate actual LTV
      const allPayments = await prisma.paymentWebhook.findMany({
        where: {
          status: constants.PAYMENT_STATUS.SUCCESS,
          ...(authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId }),
          customerId: {
            in: allCustomers.map(c => c.id)
          }
        },
        select: {
          customerId: true,
          total: true,
          paymentDate: true
        },
        orderBy: {
          paymentDate: 'asc'
        }
      });

      // Group payments by customer and calculate cumulative LTV up to end of each month
      const customerRevenueMap = new Map();
      
      // Initialize customer revenue map
      allCustomers.forEach(customer => {
        customerRevenueMap.set(customer.id, {
          customerId: customer.id,
          customerName: customer.customerFullName,
          payments: [] // Store all payments for this customer
        });
      });

      // Store all payments for each customer
      allPayments.forEach(payment => {
        const paymentDate = new Date(payment.paymentDate);
        const amount = Number(payment.total) || 0;
        
        if (customerRevenueMap.has(payment.customerId)) {
          const customerData = customerRevenueMap.get(payment.customerId);
          customerData.payments.push({
            total: amount,
            paymentDate: paymentDate
          });
        }
      });

      // Sort payments by date for each customer
      customerRevenueMap.forEach((customerData) => {
        customerData.payments.sort((a, b) => a.paymentDate - b.paymentDate);
      });

      // Determine how many customers have EVER paid at least once
      const customersWhoPaidCount = Array.from(customerRevenueMap.values()).filter(
        customerData => customerData.payments.length > 0
      ).length;

      // Process data by month - calculate LTV for payments made ONLY in each specific month
      // Each month shows separate data (not cumulative), and values are frozen once month ends
      const monthlyLTVData = [];
      
      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        const targetDate = new Date(currentYear, monthIndex, 1);
        const monthEnd = new Date(currentYear, monthIndex + 1, 0, 23, 59, 59, 999);
        const totalDaysInMonth = monthEnd.getDate();
        const monthNumber = monthIndex + 1;

        // Calculate LTV for payments made ONLY in this specific month (not cumulative)
        // IMPORTANT: Each month shows ONLY payments made in that month, previous months are NOT included
        const monthStartDate = new Date(currentYear, monthIndex, 1, 0, 0, 0);
        let totalRevenueForMonth = 0;
        let customersWithPayments = 0;
        const customerDetails = [];
        
        customerRevenueMap.forEach((customerData, customerId) => {
          // Filter payments made ONLY in this specific month
          // Example: For December, only payments between Dec 1 and Dec 31 are included
          // November payments are NOT included in December's totalRevenueForMonth
          const paymentsInThisMonth = customerData.payments.filter(p => {
            return p.paymentDate >= monthStartDate && p.paymentDate <= monthEnd;
          });
          
          // Calculate revenue from payments made ONLY in this month (previous months excluded)
          const monthlyRevenue = paymentsInThisMonth.reduce((sum, p) => sum + p.total, 0);
          
          // Only include customers who made payments in this specific month
          if (monthlyRevenue > 0) {
            totalRevenueForMonth += monthlyRevenue;
            customersWithPayments++;
            
            customerDetails.push({
              customerId: customerData.customerId,
              customerName: customerData.customerName,
              ltvCount: Math.round(monthlyRevenue * 100) / 100, // Revenue from payments made IN this month only
              totalRevenue: Math.round(monthlyRevenue * 100) / 100,
              paymentCount: paymentsInThisMonth.length, // Payments made IN this month
              totalDaysInMonth: totalDaysInMonth
            });
          }
        });

        // Calculate average LTV for this month
        // Formula: (Total revenue from payments made IN this month) ÷ (Customers who paid IN this month)
        const averageLTV = customersWithPayments > 0 
          ? totalRevenueForMonth / customersWithPayments 
          : 0;

        // Debug logging for monthly calculation
        if (process.env.NODE_ENV === 'development') {
          console.log(`📊 [Monthly LTV] ${targetDate.toLocaleString('default', { month: 'short' })} ${currentYear}:`, {
            totalRevenueForMonth: Math.round(totalRevenueForMonth * 100) / 100, // ONLY payments made in this month (previous months excluded)
            totalCustomers,
            customersWhoPaidCount,
            customersWithPayments,
            averageLTV: Math.round(averageLTV * 100) / 100,
            formula: `(${Math.round(totalRevenueForMonth * 100) / 100} ÷ ${customersWithPayments || 0}) = ${Math.round(averageLTV * 100) / 100}`,
            note: `Only includes payments from ${monthStartDate.toISOString().split('T')[0]} to ${monthEnd.toISOString().split('T')[0]}`
          });
        }

        monthlyLTVData.push({
          month: targetDate.toLocaleString('default', { month: 'short' }),
          monthNumber: monthNumber,
          year: currentYear,
          totalDaysInMonth: totalDaysInMonth,
          customersWithPayments: customersWithPayments,
          totalRevenueForMonth: Math.round(totalRevenueForMonth * 100) / 100, // Total payments made in this month
          averageLTVCount: Math.round(averageLTV * 100) / 100, // Average LTV in currency
          customerDetails: customerDetails
        });
      }

      // Calculate overall average LTV (total revenue from all customers ÷ customers who paid)
      // This is the true average LTV based on all-time revenue
      let totalRevenueAllCustomers = 0;
      customerRevenueMap.forEach((customerData) => {
        // Sum all payments for this customer (all-time LTV)
        const customerTotalLTV = customerData.payments.reduce((sum, p) => sum + p.total, 0);
        totalRevenueAllCustomers += customerTotalLTV;
      });
      
      const overallAverageLTV = customersWhoPaidCount > 0 
        ? Math.round((totalRevenueAllCustomers / customersWhoPaidCount) * 100) / 100
        : 0;

      // Debug logging for overall average calculation
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 [Overall Average LTV] Year ${currentYear}:`, {
          totalRevenueAllCustomers: Math.round(totalRevenueAllCustomers * 100) / 100,
          totalCustomers,
          customersWhoPaidCount,
          overallAverageLTV: Math.round(overallAverageLTV * 100) / 100,
          formula: `(${Math.round(totalRevenueAllCustomers * 100) / 100} ÷ ${customersWhoPaidCount}) = ${Math.round(overallAverageLTV * 100) / 100}`
        });
      }

      return res.json({
        success: true,
        data: {
          year: currentYear,
          monthlyLTVData: monthlyLTVData,
          summary: {
            totalMonths: monthlyLTVData.length,
            overallAverageLTV: overallAverageLTV,
            totalCustomers: totalCustomers,
            customersWhoPaid: customersWhoPaidCount
          }
        }
      });

    } catch (error) {
      console.error('Error getting monthly LTV count:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch monthly LTV count data',
        error: error.message
      });
    }
  }

  // Get customer status breakdown
  getCustomerStatusBreakdown = async (req, res) => {
    try {
      const authenticatedUser = req.user;

      // Build where clause based on user role
      let where = {};
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      const totalCustomers = await prisma.customers.count({
        where: where
      });

      // Active customers (have made payments in last 3 months through their business owners)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const activeCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: constants.STATUS.ACTIVE,
        }
      });

      // At risk customers
      const atRiskCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: constants.CUSTOMER_STATUS.AT_RISK
        }
      });

      // Lost customers
      const lostCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: constants.CUSTOMER_STATUS.LOST
        }
      });

      // Recovered customers
      const recoveredCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: constants.CUSTOMER_STATUS.RECOVERED
        }
      });

      // New customers
      const newCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: constants.CUSTOMER_STATUS.NEW
        }
      });

      const response = {
        success: true,
        data: {
          total: totalCustomers,
          breakdown: [
            {
              status: 'Active',
              count: activeCustomers,
              percentage: totalCustomers > 0 ? ((activeCustomers / totalCustomers) * 100).toFixed(1) : 0,
              color: '#FF257C'
            },
            {
              status: 'New',
              count: newCustomers,
              percentage: totalCustomers > 0 ? ((newCustomers / totalCustomers) * 100).toFixed(1) : 0,
              color: '#E062CB'
            },
            {
              status: 'At Risk',
              count: atRiskCustomers,
              percentage: totalCustomers > 0 ? ((atRiskCustomers / totalCustomers) * 100).toFixed(1) : 0,
              color: '#FE5D39'
            },
            {
              status: 'Lost',
              count: lostCustomers,
              percentage: totalCustomers > 0 ? ((lostCustomers / totalCustomers) * 100).toFixed(1) : 0,
              color: '#912018'
            },
            {
              status: 'Recovered',
              count: recoveredCustomers,
              percentage: totalCustomers > 0 ? ((recoveredCustomers / totalCustomers) * 100).toFixed(1) : 0,
              color: '#675DFF'
            }
          ]
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting customer status breakdown:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer status breakdown',
        error: error.message
      });
    }
  }

  // Get admin summary
  getAdminSummary = async (req, res) => {
    try {
      const totalAdmins = await prisma.user.count({
        where: {
          role: constants.ROLES.ADMIN
        }
      });

      const totalBusinessOwners = await prisma.user.count({
        where: {
          role: constants.ROLES.USER
        }
      });

      const totalCustomers = await prisma.customers.count();

      const totalRevenue = await prisma.paymentWebhook.aggregate({
        where: {
          status: constants.PAYMENT_STATUS.SUCCESS // Only count successful payments
        },
        _sum: {
          total: true
        }
      });

      const response = {
        success: true,
        data: {
          totalAdmins,
          totalBusinessOwners,
          totalCustomers,
          totalRevenue: totalRevenue._sum.total || 0,
          summary: [
            {
              label: 'Admins',
              count: totalAdmins,
              icon: '👥'
            },
            {
              label: 'Business Owners',
              count: totalBusinessOwners,
              icon: '🏢'
            },
            {
              label: 'Customers',
              count: totalCustomers,
              icon: '👤'
            },
            {
              label: 'Total Revenue',
              count: `$${(totalRevenue._sum.amount || 0).toLocaleString()}`,
              icon: '💰'
            }
          ]
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting admin summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin summary',
        error: error.message
      });
    }
  }

  // Get dashboard overview (all metrics in one call)
  getDashboardOverview = async (req, res) => {
    try {
      const [monthlyPerformance, revenueImpact, customerStatus, adminSummary, qrAnalytics] = await Promise.all([
        this.getMonthlyPerformanceData(req),
        this.getRevenueImpactData(req),
        this.getCustomerStatusData(req),
        this.getAdminSummaryData(req),
        this.getQRCodeAnalyticsData(req)
      ]);

      res.json({
        success: true,
        data: {
          monthlyPerformance,
          revenueImpact,
          customerStatus,
          adminSummary,
          qrAnalytics
        }
      });
    } catch (error) {
      console.error('Error getting dashboard overview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard overview',
        error: error.message
      });
    }
  }

  // Helper methods for dashboard overview
  async getMonthlyPerformanceData(req) {
    const authenticatedUser = req.user;
    const { month, year } = req.query;
    const currentDate = new Date();
    const targetMonth = month || currentDate.getMonth() + 1;
    const targetYear = year || currentDate.getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
    const prevStartDate = new Date(targetYear, targetMonth - 2, 1);
    const prevEndDate = new Date(targetYear, targetMonth - 1, 0, 23, 59, 59);

    // Build where clause based on user role
    let where = {
      status: constants.PAYMENT_STATUS.SUCCESS // Only count successful payments
    };
    
    if (authenticatedUser && authenticatedUser.role === constants.ROLES.USER) {
      where.userId = authenticatedUser.userId;
    }

    const [recoveredCustomers, prevRecoveredCustomers, recoveredRevenue, prevRecoveredRevenue,
      lostRevenue, prevLostRevenue, customerLTV, prevCustomerLTV] = await Promise.all([
        prisma.customerUser.count({
          where: {
            status: constants.CUSTOMER_STATUS.RECOVERED,
            updatedAt: { gte: startDate, lte: endDate },
            ...(authenticatedUser && authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
          }
        }),
        prisma.customerUser.count({
          where: {
            status: constants.CUSTOMER_STATUS.RECOVERED,
            updatedAt: { gte: prevStartDate, lte: prevEndDate },
            ...(authenticatedUser && authenticatedUser.role === constants.ROLES.USER && { userId: authenticatedUser.userId })
          }
        }),
        prisma.paymentWebhook.aggregate({
          where: {
            ...where,
            paymentDate: { gte: startDate, lte: endDate },
            revenuePaymentStatus: constants.CUSTOMER_STATUS.RECOVERED
          },
          _sum: { total: true }
        }),
        prisma.paymentWebhook.aggregate({
          where: {
            ...where,
            paymentDate: { gte: prevStartDate, lte: prevEndDate },
            revenuePaymentStatus: constants.CUSTOMER_STATUS.RECOVERED
          },
          _sum: { total: true }
        }),
        prisma.paymentWebhook.aggregate({
          where: {
            ...where,
            paymentDate: { gte: startDate, lte: endDate },
            revenuePaymentStatus: constants.CUSTOMER_STATUS.LOST
          },
          _sum: { total: true }
        }),
        prisma.paymentWebhook.aggregate({
          where: {
            ...where,
            paymentDate: { gte: prevStartDate, lte: prevEndDate },
            revenuePaymentStatus: constants.CUSTOMER_STATUS.LOST
          },
          _sum: { total: true }
        }),
        prisma.paymentWebhook.aggregate({
          where: {
            ...where,
            paymentDate: { gte: startDate, lte: endDate }
          },
          _avg: { total: true }
        }),
        prisma.paymentWebhook.aggregate({
          where: {
            ...where,
            paymentDate: { gte: prevStartDate, lte: prevEndDate }
          },
          _avg: { total: true }
        })
      ]);

    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      recoveredCustomers: {
        value: recoveredCustomers,
        change: calculatePercentageChange(recoveredCustomers, prevRecoveredCustomers),
        trend: recoveredCustomers >= prevRecoveredCustomers ? 'up' : 'down'
      },
      recoveredRevenue: {
        value: recoveredRevenue._sum.total || 0,
        change: calculatePercentageChange(
          recoveredRevenue._sum.total || 0,
          prevRecoveredRevenue._sum.total || 0
        ),
        trend: (recoveredRevenue._sum.total || 0) >= (prevRecoveredRevenue._sum.total || 0) ? 'up' : 'down'
      },
      lostRevenue: {
        value: lostRevenue._sum.total || 0,
        change: calculatePercentageChange(
          lostRevenue._sum.total || 0,
          prevLostRevenue._sum.total || 0
        ),
        trend: (lostRevenue._sum.total || 0) >= (prevLostRevenue._sum.total || 0) ? 'up' : 'down'
      },
      customerLTV: {
        value: (customerLTV._avg.total || 0).toFixed(1),
        change: calculatePercentageChange(
          customerLTV._avg.total || 0,
          prevCustomerLTV._avg.total || 0
        ),
        trend: (customerLTV._avg.total || 0) >= (prevCustomerLTV._avg.total || 0) ? 'up' : 'down'
      }
    };
  }

  async getRevenueImpactData(req) {
    const { months = 7 } = req.query;
    const currentDate = new Date();
    
    // Calculate date range for the specified number of months
    const startMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - (months - 1), 1);
    const endMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

    // Single optimized query to get all revenue data for the specified months
    const revenueQuery = `
      SELECT 
        EXTRACT(YEAR FROM "createdAt") as year,
        EXTRACT(MONTH FROM "createdAt") as month,
        SUM(amount) as total_revenue
      FROM "payments"
      WHERE "createdAt" >= $1 AND "createdAt" <= $2
      GROUP BY EXTRACT(YEAR FROM "createdAt"), EXTRACT(MONTH FROM "createdAt")
      ORDER BY year, month
    `;

    const revenueResults = await prisma.$queryRawUnsafe(revenueQuery, startMonth, endMonth);

    // Create a map for quick lookup of revenue by year-month
    const revenueMap = {};
    revenueResults.forEach(result => {
      const key = `${result.year}-${result.month}`;
      revenueMap[key] = Number(result.total_revenue) || 0;
    });

    // Build the response array with the same structure as before
    const revenueData = [];
    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1; // getMonth() returns 0-11, we need 1-12
      const key = `${year}-${month}`;

      revenueData.push({
        month: targetDate.toLocaleString('default', { month: 'long' }),
        revenue: revenueMap[key] || 0,
        year: year
      });
    }

    return revenueData;
  }

  async getCustomerStatusData(req) {
    const totalCustomers = await prisma.customers.count();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [activeCustomers, atRiskCustomers, lostCustomers, recoveredCustomers, newCustomers] = await Promise.all([
      // prisma.customers.count({
      //   where: {
      //     user: {
      //       payments: {
      //         some: { createdAt: { gte: threeMonthsAgo } }
      //       }
      //     }
      //   }
      // }),
      prisma.customerUser.count({
        where: { status: constants.STATUS.ACTIVE }
      }),
      prisma.customerUser.count({
        where: { status: { in: [constants.CUSTOMER_STATUS.RISK, constants.CUSTOMER_STATUS.AT_RISK] } }
      }),
      prisma.customerUser.count({
        where: { status: constants.CUSTOMER_STATUS.LOST }
      }),
      prisma.customerUser.count({
        where: { status: constants.CUSTOMER_STATUS.RECOVERED }
      }),
      prisma.customerUser.count({
        where: { status: constants.CUSTOMER_STATUS.NEW }
      })
    ]);

    return {
      total: totalCustomers,
      breakdown: [
        {
          status: 'Active',
          count: activeCustomers,
          percentage: totalCustomers > 0 ? ((activeCustomers / totalCustomers) * 100).toFixed(1) : 0,
          color: '#8B5CF6'
        },
        {
          status: 'New',
          count: newCustomers,
          percentage: totalCustomers > 0 ? ((newCustomers / totalCustomers) * 100).toFixed(1) : 0,
          color: '#10B981'
        },
        {
          status: 'At Risk',
          count: atRiskCustomers,
          percentage: totalCustomers > 0 ? ((atRiskCustomers / totalCustomers) * 100).toFixed(1) : 0,
          color: '#F97316'
        },
        {
          status: 'Lost',
          count: lostCustomers,
          percentage: totalCustomers > 0 ? ((lostCustomers / totalCustomers) * 100).toFixed(1) : 0,
          color: '#DC2626'
        },
        {
          status: 'Recovered',
          count: recoveredCustomers,
          percentage: totalCustomers > 0 ? ((recoveredCustomers / totalCustomers) * 100).toFixed(1) : 0,
          color: '#EC4899'
        }
      ]
    };
  }

  async getAdminSummaryData(req) {
    const authenticatedUser = req.user;
    
    // Build where clause based on user role
    let where = {
      status: constants.PAYMENT_STATUS.SUCCESS // Only count successful payments
    };
    
    if (authenticatedUser && authenticatedUser.role === constants.ROLES.USER) {
      where.userId = authenticatedUser.userId;
    }

    const [totalAdmins, totalBusinessOwners, totalCustomers, totalRevenue] = await Promise.all([
      prisma.user.count({ where: { role: constants.ROLES.ADMIN } }),
      prisma.user.count({ where: { role: constants.ROLES.USER } }),
      prisma.customers.count({
        where: authenticatedUser && authenticatedUser.role === constants.ROLES.USER 
          ? { userId: authenticatedUser.userId }
          : {}
      }),
      prisma.paymentWebhook.aggregate({
        where: where,
        _sum: { total: true }
      })
    ]);

    return {
      totalAdmins,
      totalBusinessOwners,
      totalCustomers,
      totalRevenue: totalRevenue._sum.total || 0,
      summary: [
        {
          label: 'Admins',
          count: totalAdmins,
          icon: '👥'
        },
        {
          label: 'Business Owners',
          count: totalBusinessOwners,
          icon: '🏢'
        },
        {
          label: 'Customers',
          count: totalCustomers,
          icon: '👤'
        },
        {
          label: 'Total Revenue',
          count: `$${(totalRevenue._sum.amount || 0).toLocaleString()}`,
          icon: '💰'
        }
      ]
    };
  }

  // Get QR Code Analytics with ScanCount and ShareCount - OPTIMIZED
  getQRCodeAnalytics = async (req, res) => {
    try {
      const authenticatedUser = req.user;
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      // Single optimized query to get QR analytics data with scan/share stats
      const qrAnalyticsQuery = `
        SELECT 
          qr.id,
          qr.name,
          qr.url,
          qr."qrData",
          qr."qrCodeImage",
          qr."messageForCustomer",
          qr."directMessage",
          qr."directUrl",
          qr."messageUrl",
          qr."isActive",
          qr."scanCount",
          qr."shareCount",
          qr."createdAt",
          qr."updatedAt",
          u.id as "userId",
          u."businessName",
          u."businessType",
          COALESCE(scan_stats.actual_scans, 0) as actual_scans,
          COALESCE(scan_stats.actual_shares, 0) as actual_shares
        FROM "qr_codes" qr
        LEFT JOIN "users" u ON qr."userId" = u.id
        LEFT JOIN (
          SELECT 
            "qrCodeId",
            SUM(CASE WHEN "scanData" IS NOT NULL AND "sharedata" IS NULL THEN 1 ELSE 0 END) as actual_scans,
            SUM(CASE WHEN "sharedata" IS NOT NULL AND "scanData" IS NULL THEN 1 ELSE 0 END) as actual_shares
          FROM "qr_code_scans"
          WHERE "scanTime" >= $1 AND "scanTime" <= $2
          ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
          GROUP BY "qrCodeId"
        ) scan_stats ON qr.id = scan_stats."qrCodeId"
        ${authenticatedUser.role === constants.ROLES.USER ? 'WHERE qr."userId" = $' + (authenticatedUser.role === constants.ROLES.USER ? '3' : '1') : 'WHERE 1=1'}
        AND qr."createdAt" >= $1 AND qr."createdAt" <= $2
        ORDER BY qr."createdAt" DESC
      `;

      // Calculate date range for current month
      const startDate = new Date(currentYear, currentDate.getMonth(), 1);
      const endDate = new Date(currentYear, currentDate.getMonth() + 1, 0, 23, 59, 59);
      
      const qrParams = authenticatedUser.role === constants.ROLES.USER 
        ? [startDate, endDate, authenticatedUser.userId]
        : [startDate, endDate];

      const qrResults = await prisma.$queryRawUnsafe(qrAnalyticsQuery, ...qrParams);

      // Process QR code data with stats
      const qrCodeDataWithStats = qrResults.map(qr => ({
        id: qr.id,
        name: qr.name,
        url: qr.url,
        qrData: qr.qrData,
        qrCodeImage: qr.qrCodeImage,
        messageForCustomer: qr.messageForCustomer,
        directMessage: qr.directMessage,
        directUrl: qr.directUrl,
        messageUrl: qr.messageUrl,
        isActive: qr.isActive,
        scans: Number(qr.scanCount) || 0,
        createdAt: qr.createdAt,
        updatedAt: qr.updatedAt,
        user: {
          id: qr.userId,
          businessName: qr.businessName,
          businessType: qr.businessType
        },
        actualScans: Number(qr.actual_scans) || 0,
        actualShares: Number(qr.actual_shares) || 0
      }));
      
      // Calculate totals using actual data from QRCodeScan table
      const totalScans = qrResults.reduce((sum, qr) => sum + (Number(qr.actual_scans) || 0), 0);
      const totalShares = qrResults.reduce((sum, qr) => sum + (Number(qr.actual_shares) || 0), 0);
      const totalQRCodes = qrResults.length;
      
      // Calculate averages
      const avgScans = totalQRCodes > 0 ? (totalScans / totalQRCodes).toFixed(2) : 0;
      const avgShares = totalQRCodes > 0 ? (totalShares / totalQRCodes).toFixed(2) : 0;
      
      // Get top performing QR codes based on actual scan data
      const topScannedQR = qrCodeDataWithStats
        .sort((a, b) => (b.actualScans || 0) - (a.actualScans || 0))
        .slice(0, 5);

      // Get top shared QR codes
      const topSharedQR = qrCodeDataWithStats
        .sort((a, b) => (b.actualShares || 0) - (a.actualShares || 0))
        .slice(0, 5);

      // Get data for different periods (same as backup code structure)
      const monthlyData = await this.getPeriodData('monthly', authenticatedUser);
      const quarterlyData = await this.getPeriodData('quarterly', authenticatedUser);
      const yearlyData = await this.getPeriodData('yearly', authenticatedUser);
      const weeklyData = await this.getPeriodData('thisWeek', authenticatedUser);

      const response = {
        success: true,
        data: {
          // Frontend ke jaisa data structure (same as backup)
          monthlyQrCodeData: monthlyData,
          quarterlyQrCodeData: quarterlyData,
          yearlyQrCodeData: yearlyData,
          weeklyQrCodeData: weeklyData
        }
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error getting QR code analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch QR code analytics',
        error: error.message
      });
    }
  }

  // Helper method for QR Analytics data
  async getQRCodeAnalyticsData(req) {
    try {
      const authenticatedUser = req.user;
      const { period = 'monthly' } = req.query;
      
      // Use common helper function
      const { startDate, endDate } = this.calculateDateRange(period);
      
      let where = {};
      
      // If user role is 'user', only show their data
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }
      
      where.createdAt = {
        gte: startDate,
        lte: endDate
      };
      
      const qrCodeData = await prisma.qRCode.findMany({
        where,
        select: {
          scans: true
        }
      });
      
      const totalScans = qrCodeData.reduce((sum, qr) => sum + (qr.scans || 0), 0);
      const totalQRCodes = qrCodeData.length;
      
      return {
        period,
        summary: {
          totalQRCodes,
          totalScans
        }
      };
      
    } catch (error) {
      console.error('Error getting QR analytics data:', error);
      return {
        period: 'monthly',
        summary: {
          totalQRCodes: 0,
          totalScans: 0
        }
      };
    }
  }

  // Common helper function for date calculations
  calculateDateRange(period) {
    const currentDate = new Date();
    let startDate, endDate;
    
    switch (period) {
      case 'thisWeek':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - currentDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(currentDate);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'monthly':
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
        
      case 'quarterly':
        const currentQuarter = Math.floor(currentDate.getMonth() / 3);
        startDate = new Date(currentDate.getFullYear(), currentQuarter * 3, 1);
        endDate = new Date(currentDate.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
        break;
        
      case 'yearly':
        startDate = new Date(currentDate.getFullYear(), 0, 1);
        endDate = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
        
      default:
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    
    return { where: {}, startDate, endDate };
  }

  // Helper function to get period data for frontend charts - OPTIMIZED
  async getPeriodData(period, authenticatedUser) {
    try {
      let where = {};
      
      // If user role is 'user', only show their data
      if (authenticatedUser.role === constants.ROLES.USER) {
        where.userId = authenticatedUser.userId;
      }

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      let data = [];
      
      switch (period) {
        case 'monthly':
          // Get last 6 months data with single optimized query
          const sixMonthsAgo = new Date(currentYear, currentDate.getMonth() - 5, 1);
          const currentMonthEnd = new Date(currentYear, currentDate.getMonth() + 1, 0, 23, 59, 59);
          
          const monthlyQuery = `
            SELECT 
              EXTRACT(YEAR FROM "scanTime") as year,
              EXTRACT(MONTH FROM "scanTime") as month,
              SUM(CASE WHEN "scanData" IS NOT NULL AND "sharedata" IS NULL THEN 1 ELSE 0 END) as scan_count,
              SUM(CASE WHEN "sharedata" IS NOT NULL AND "scanData" IS NULL THEN 1 ELSE 0 END) as share_count
            FROM "qr_code_scans"
            WHERE "scanTime" >= $1 AND "scanTime" <= $2
            ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(YEAR FROM "scanTime"), EXTRACT(MONTH FROM "scanTime")
            ORDER BY year, month
          `;
          
          const monthlyParams = authenticatedUser.role === constants.ROLES.USER 
            ? [sixMonthsAgo, currentMonthEnd, authenticatedUser.userId]
            : [sixMonthsAgo, currentMonthEnd];
            
          const monthlyResults = await prisma.$queryRawUnsafe(monthlyQuery, ...monthlyParams);
          
          // Build monthly data array
          for (let i = 5; i >= 0; i--) {
            const targetDate = new Date(currentYear, currentDate.getMonth() - i, 1);
            const targetYear = targetDate.getFullYear();
            const targetMonth = targetDate.getMonth() + 1;
            
            const monthResult = monthlyResults.find(r => 
              Number(r.year) === targetYear && Number(r.month) === targetMonth
            );
            
            data.push({
              label: targetDate.toLocaleString('default', { month: 'short' }),
              scanCount: monthResult ? Number(monthResult.scan_count) : 0,
              shareCount: monthResult ? Number(monthResult.share_count) : 0,
              month: targetMonth,
              year: targetYear
            });
          }
          break;
          
        case 'quarterly':
          // Get quarterly data for current year with single optimized query
          const yearStart = new Date(currentYear, 0, 1);
          const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
          
          const quarterlyQuery = `
            SELECT 
              EXTRACT(QUARTER FROM "scanTime") as quarter,
              SUM(CASE WHEN "scanData" IS NOT NULL AND "sharedata" IS NULL THEN 1 ELSE 0 END) as scan_count,
              SUM(CASE WHEN "sharedata" IS NOT NULL AND "scanData" IS NULL THEN 1 ELSE 0 END) as share_count
            FROM "qr_code_scans"
            WHERE "scanTime" >= $1 AND "scanTime" <= $2
            ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(QUARTER FROM "scanTime")
            ORDER BY quarter
          `;
          
          const quarterlyParams = authenticatedUser.role === constants.ROLES.USER 
            ? [yearStart, yearEnd, authenticatedUser.userId]
            : [yearStart, yearEnd];
            
          const quarterlyResults = await prisma.$queryRawUnsafe(quarterlyQuery, ...quarterlyParams);
          
          // Build quarterly data array
          for (let quarter = 1; quarter <= 4; quarter++) {
            const quarterResult = quarterlyResults.find(r => Number(r.quarter) === quarter);
            
            data.push({
              label: `Q${quarter}`,
              scanCount: quarterResult ? Number(quarterResult.scan_count) : 0,
              shareCount: quarterResult ? Number(quarterResult.share_count) : 0
            });
          }
          break;
          
        case 'yearly':
          // Get last 3 years data with single optimized query
          const threeYearsAgo = new Date(currentYear - 2, 0, 1);
          const currentYearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
          
          const yearlyQuery = `
            SELECT 
              EXTRACT(YEAR FROM "scanTime") as year,
              SUM(CASE WHEN "scanData" IS NOT NULL AND "sharedata" IS NULL THEN 1 ELSE 0 END) as scan_count,
              SUM(CASE WHEN "sharedata" IS NOT NULL AND "scanData" IS NULL THEN 1 ELSE 0 END) as share_count
            FROM "qr_code_scans"
            WHERE "scanTime" >= $1 AND "scanTime" <= $2
            ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(YEAR FROM "scanTime")
            ORDER BY year
          `;
          
          const yearlyParams = authenticatedUser.role === constants.ROLES.USER 
            ? [threeYearsAgo, currentYearEnd, authenticatedUser.userId]
            : [threeYearsAgo, currentYearEnd];
            
          const yearlyResults = await prisma.$queryRawUnsafe(yearlyQuery, ...yearlyParams);
          
          // Build yearly data array
          for (let year = currentYear - 2; year <= currentYear; year++) {
            const yearResult = yearlyResults.find(r => Number(r.year) === year);
            
            data.push({
              label: year.toString(),
              scanCount: yearResult ? Number(yearResult.scan_count) : 0,
              shareCount: yearResult ? Number(yearResult.share_count) : 0
            });
          }
          break;
          
        case 'thisWeek':
          // Get current week data with single optimized query
          const weekStart = new Date(currentDate);
          weekStart.setDate(currentDate.getDate() - currentDate.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          
          const weeklyQuery = `
            SELECT 
              EXTRACT(DOW FROM "scanTime") as day_of_week,
              SUM(CASE WHEN "scanData" IS NOT NULL AND "sharedata" IS NULL THEN 1 ELSE 0 END) as scan_count,
              SUM(CASE WHEN "sharedata" IS NOT NULL AND "scanData" IS NULL THEN 1 ELSE 0 END) as share_count
            FROM "qr_code_scans"
            WHERE "scanTime" >= $1 AND "scanTime" <= $2
            ${authenticatedUser.role === constants.ROLES.USER ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(DOW FROM "scanTime")
            ORDER BY day_of_week
          `;
          
          const weeklyParams = authenticatedUser.role === constants.ROLES.USER 
            ? [weekStart, weekEnd, authenticatedUser.userId]
            : [weekStart, weekEnd];
            
          const weeklyResults = await prisma.$queryRawUnsafe(weeklyQuery, ...weeklyParams);
          
          const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          
          // Build weekly data array (DOW: 0=Sunday, 1=Monday, ..., 6=Saturday)
          for (let i = 0; i < 7; i++) {
            const dayResult = weeklyResults.find(r => Number(r.day_of_week) === i);
            
            data.push({
              label: weekDays[i],
              scanCount: dayResult ? Number(dayResult.scan_count) : 0,
              shareCount: dayResult ? Number(dayResult.share_count) : 0
            });
          }
          break;
      }
      
      return data;
      
    } catch (error) {
      console.error('Error getting period data:', error);
      return [];
    }
  }

  // Helper function for previous period data
  async getPreviousPeriodData(period, startDate, where) {
    try {
      let previousStartDate, previousEndDate;
      
      // Calculate previous period dates based on current period
      switch (period) {
        case 'thisWeek':
          previousStartDate = new Date(startDate);
          previousStartDate.setDate(previousStartDate.getDate() - 7);
          previousEndDate = new Date(startDate);
          previousEndDate.setDate(previousEndDate.getDate() - 1);
          previousEndDate.setHours(23, 59, 59, 999);
          break;
          
        case 'monthly':
          previousStartDate = new Date(startDate);
          previousStartDate.setMonth(previousStartDate.getMonth() - 1);
          previousEndDate = new Date(startDate);
          previousEndDate.setDate(previousEndDate.getDate() - 1);
          previousEndDate.setHours(23, 59, 59, 999);
          break;
          
        case 'quarterly':
          previousStartDate = new Date(startDate);
          previousStartDate.setMonth(previousStartDate.getMonth() - 3);
          previousEndDate = new Date(startDate);
          previousEndDate.setDate(previousEndDate.getDate() - 1);
          previousEndDate.setHours(23, 59, 59, 999);
          break;
          
        case 'yearly':
          previousStartDate = new Date(startDate);
          previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
          previousEndDate = new Date(startDate);
          previousEndDate.setDate(previousEndDate.getDate() - 1);
          previousEndDate.setHours(23, 59, 59, 999);
          break;
          
        default:
          return null;
      }
      
      // Get previous period data
      const previousWhere = { ...where };
      previousWhere.createdAt = {
        gte: previousStartDate,
        lte: previousEndDate
      };
      
      const previousQRData = await prisma.qRCode.findMany({
        where: previousWhere,
        select: {
          scans: true
        }
      });
      
      const previousScans = previousQRData.reduce((sum, qr) => sum + (qr.scans || 0), 0);
      
      return {
        scans: previousScans,
        qrCodes: previousQRData.length
      };
      
    } catch (error) {
      console.error('Error getting previous period data:', error);
      return null;
    }
  }
}

module.exports = new AdminDashboardController();