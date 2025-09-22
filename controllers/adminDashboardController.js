const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
        ${authenticatedUser.role === 'user' ? 'WHERE c."userId" = $1' : 'WHERE 1=1'}
        GROUP BY COALESCE(cu.status, 'active')
      `;

      const statusParams = authenticatedUser.role === 'user' ? [authenticatedUser.userId] : [];
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
          status: 'recovered',
          updatedAt: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const prevRecoveredCustomers = await prisma.customerUser.count({
        where: {
          status: 'recovered',
          updatedAt: {
            gte: prevStartDate,
            lte: prevEndDate
          }
        }
      });

      // Recovered Revenue (payments from users who have recovered customers)
      const recoveredRevenue = await prisma.payment.aggregate({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          },
          user: {
            customerUsers: {
              some: {
                status: 'recovered'
              }
            }
          }
        },
        _sum: {
          amount: true
        }
      });

      const prevRecoveredRevenue = await prisma.payment.aggregate({
        where: {
          createdAt: {
            gte: prevStartDate,
            lte: prevEndDate
          },
          user: {
            customerUsers: {
              some: {
                status: 'recovered'
              }
            }
          }
        },
        _sum: {
          amount: true
        }
      });

      // Lost Revenue (payments from users who have lost customers)
      const lostRevenue = await prisma.payment.aggregate({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          },
          user: {
            customerUsers: {
              some: {
                status: 'lost'
              }
            }
          }
        },
        _sum: {
          amount: true
        }
      });

      const prevLostRevenue = await prisma.payment.aggregate({
        where: {
          createdAt: {
            gte: prevStartDate,
            lte: prevEndDate
          },
          user: {
            customerUsers: {
              some: {
                status: 'lost'
              }
            }
          }
        },
        _sum: {
          amount: true
        }
      });

      // Customer LTV (average monthly value)
      const customerLTV = await prisma.payment.aggregate({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        _avg: {
          amount: true
        }
      });

      const prevCustomerLTV = await prisma.payment.aggregate({
        where: {
          createdAt: {
            gte: prevStartDate,
            lte: prevEndDate
          }
        },
        _avg: {
          amount: true
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
            value: Math.round(recoveredRevenue._sum.amount) || 0,
            change: calculatePercentageChange(
              Math.round(recoveredRevenue._sum.amount) || 0,
              Math.round(prevRecoveredRevenue._sum.amount) || 0
            ),
            trend: (Math.round(recoveredRevenue._sum.amount) || 0) >= (Math.round(prevRecoveredRevenue._sum.amount) || 0) ? 'up' : 'down'
          },
          lostRevenue: {
            value:  Math.round(lostRevenue._sum.amount) || 0,
            count: statusCounts.lost || 0,
            change: calculatePercentageChange(
              lostRevenue._sum.amount || 0,
              prevLostRevenue._sum.amount || 0
            ),
            trend: (lostRevenue._sum.amount || 0) >= (prevLostRevenue._sum.amount || 0) ? 'up' : 'down'
          },
          customerLTV: {
            value: Math.round(customerLTV._avg.amount || 0),
            change: calculatePercentageChange(
              customerLTV._avg.amount || 0,
              prevCustomerLTV._avg.amount || 0
            ),
            trend: (customerLTV._avg.amount || 0) >= (prevCustomerLTV._avg.amount || 0) ? 'up' : 'down'
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
      const { months = 7 } = req.query;
      const currentDate = new Date();
      const revenueData = [];

      for (let i = months - 1; i >= 0; i--) {
        const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

        const monthRevenue = await prisma.payment.aggregate({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate
            }
          },
          _sum: {
            amount: true
          }
        });

        revenueData.push({
          month: targetDate.toLocaleString('default', { month: 'long' }),
          revenue: monthRevenue._sum.amount || 0,
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
      if (authenticatedUser.role === 'user') {
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
        ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
        GROUP BY EXTRACT(MONTH FROM "createdAt")
        ORDER BY month
      `;

      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
      const queryParams = authenticatedUser.role === 'user' 
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
      if (authenticatedUser.role === 'user') {
        where.userId = authenticatedUser.userId;
      }

      // Get customers who are currently in Recovered status from CustomerUser table
      const recoveredCustomers = await prisma.customerUser.findMany({
        where: {
          ...(authenticatedUser.role === 'user' && { userId: authenticatedUser.userId }),
          status: 'recovered'
        },
        select: {
          customerId: true,
          updatedAt: true
        }
      });

      // Get revenue from payments made by recovered customers after their recovery date
      let totalRecoveredRevenue = 0;
      for (const recoveredCustomer of recoveredCustomers) {
        const paymentsAfterRecovery = await prisma.paymentWebhook.aggregate({
          where: {
            customerId: recoveredCustomer.customerId,
            status: 'success',
            paymentDate: {
              gte: recoveredCustomer.updatedAt // Payments after recovery date
            },
            ...(authenticatedUser.role === 'user' && { userId: authenticatedUser.userId })
          },
          _sum: {
            total: true
          }
        });
        
        totalRecoveredRevenue += paymentsAfterRecovery._sum.total || 0;
      }

      const recoveredCustomersCount = recoveredCustomers.length;

      // Get customers who are currently in Lost status
      const lostCustomers = await prisma.customerStatusLog.findMany({
        where: {
          ...(authenticatedUser.role === 'user' && { userId: authenticatedUser.userId }),
          newStatus: 'Lost'
        },
        include: {
          customer: {
            select: {
              id: true,
              customerFullName: true,
              createdAt: true
            }
          }
        },
        orderBy: {
          changedAt: 'desc'
        },
        distinct: ['customerId'] // Get the latest status for each customer
      });

      // Calculate average LTV for all customers (not just lost ones)
      const allCustomers = await prisma.customers.findMany({
        where: {
          ...(authenticatedUser.role === 'user' && { userId: authenticatedUser.userId })
        },
        select: {
          id: true,
          createdAt: true
        }
      });

      // Calculate average LTV across all customers
      let totalMonthsAllCustomers = 0;
      const currentDate = new Date();
      
      for (const customer of allCustomers) {
        const customerCreatedDate = new Date(customer.createdAt);
        const monthsActive = Math.max(1, Math.ceil((currentDate - customerCreatedDate) / (1000 * 60 * 60 * 24 * 30)));
        totalMonthsAllCustomers += monthsActive;
      }
      
      const averageLTV = allCustomers.length > 0 ? totalMonthsAllCustomers / allCustomers.length : 0;

      // Calculate lost revenue using proper formula: Average Transaction × LTV (in months)
      let totalLostRevenue = 0;
      let totalAverageTransaction = 0;
      const lostCustomerDetails = [];

      for (const lostCustomer of lostCustomers) {
        const customerId = lostCustomer.customer.id;
        const latestChangeDate = lostCustomer.changedAt; // Latest changeAt date when status became Lost

        // Get payments that happened AFTER the latest status change date
        const customerPayments = await prisma.paymentWebhook.findMany({
          where: {
            customerId: customerId,
            status: 'success',
            paymentDate: {
              gte: latestChangeDate // Only payments after latest status change
            }
          },
          select: {
            total: true,
            paymentDate: true
          }
        });

        if (customerPayments.length > 0) {
          // Calculate average transaction value for payments after status change
          const totalSpent = customerPayments.reduce((sum, payment) => sum + (payment.total || 0), 0);
          const averageTransaction = totalSpent / customerPayments.length;
          
          // Calculate lost revenue for this customer: Average Transaction × LTV
          const customerLostRevenue = averageTransaction * averageLTV;
          totalLostRevenue += customerLostRevenue;
          totalAverageTransaction += averageTransaction;

          lostCustomerDetails.push({
            customerId: customerId,
            customerName: lostCustomer.customer.customerFullName,
            latestStatusChangeDate: latestChangeDate,
            totalPayments: customerPayments.length,
            totalSpent: totalSpent,
            averageTransaction: Math.round(averageTransaction * 100) / 100,
            lostRevenue: Math.round(customerLostRevenue * 100) / 100,
            ltv: Math.round(averageLTV * 100) / 100
          });
        } else {
          // Customer became Lost but made no payments after the status change
          lostCustomerDetails.push({
            customerId: customerId,
            customerName: lostCustomer.customer.customerFullName,
            latestStatusChangeDate: latestChangeDate,
            totalPayments: 0,
            totalSpent: 0,
            averageTransaction: 0,
            lostRevenue: 0,
            ltv: Math.round(averageLTV * 100) / 100
          });
        }
      }
      
      return res.json({
        success: true,
        data: {
          // Recovered customer data
          totalRecoveredRevenue: Math.round(totalRecoveredRevenue * 100) / 100,
          recoveredCustomersCount: recoveredCustomersCount,
          
          // Lost revenue data
          totalLostRevenue: Math.round(totalLostRevenue * 100) / 100,
          averageLTV: Math.round(averageLTV * 100) / 100,
          lostCustomersCount: lostCustomers.length,
          lostCustomerDetails: lostCustomerDetails,
          
          // Additional metrics
          totalCustomers: allCustomers.length,
          averageTransactionValue: lostCustomerDetails.length > 0 
            ? Math.round((totalAverageTransaction / lostCustomerDetails.length) * 100) / 100 
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
      if (authenticatedUser.role === 'user') {
        where.userId = authenticatedUser.userId;
      }

      // Get all customers based on user role
      const lostCustomers = await prisma.customerUser.findMany({
        where: {
          ...(authenticatedUser.role === 'user' && { userId: authenticatedUser.userId })
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
            status: 'success'
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

  // Get Revenue Impact with filters - OPTIMIZED
  getRevenueImpacts = async (req, res) => {
    try {
      const authenticatedUser = req.user;
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();

      // Single query for last 6 months data (only recovered customers - same as original)
      const sixMonthsAgo = new Date(currentYear, currentDate.getMonth() - 5, 1);
      const monthlyQuery = `
        SELECT 
          EXTRACT(YEAR FROM "paymentDate") as year,
          EXTRACT(MONTH FROM "paymentDate") as month,
          SUM(total) as total_revenue,
          SUM("totalWithoutVAT") as total_without_vat,
          SUM("totalVAT") as total_vat,
          COUNT(*) as transaction_count
        FROM "payment_webhooks"
        WHERE status = 'success'
        AND "revenuePaymentStatus" = 'recovered'
        AND "paymentDate" >= $1
        AND "paymentDate" <= $2
        ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
        GROUP BY EXTRACT(YEAR FROM "paymentDate"), EXTRACT(MONTH FROM "paymentDate")
        ORDER BY year, month
      `;

      const monthlyParams = authenticatedUser.role === 'user' 
        ? [sixMonthsAgo, currentDate, authenticatedUser.userId]
        : [sixMonthsAgo, currentDate];

      const monthlyResults = await prisma.$queryRawUnsafe(monthlyQuery, ...monthlyParams);

      // Process monthly data
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const targetDate = new Date(currentYear, currentDate.getMonth() - i, 1);
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth() + 1;
        
        const monthResult = monthlyResults.find(r => 
          Number(r.year) === targetYear && Number(r.month) === targetMonth
        );
        
        monthlyData.push({
          label: targetDate.toLocaleString('default', { month: 'short' }),
          revenue: monthResult ? Number(monthResult.total_revenue) : 0,
          revenueWithoutVAT: monthResult ? Number(monthResult.total_without_vat) : 0,
          vat: monthResult ? Number(monthResult.total_vat) : 0,
          transactionCount: monthResult ? Number(monthResult.transaction_count) : 0,
          month: targetMonth,
          year: targetYear
        });
      }

      // Get weekly data for current month (optimized single query)
      const currentMonthStart = new Date(currentYear, currentDate.getMonth(), 1);
      const currentMonthEnd = new Date(currentYear, currentDate.getMonth() + 1, 0, 23, 59, 59);
      
      // Single query for current month weekly data
      const currentWeeklyQuery = `
        SELECT 
          EXTRACT(WEEK FROM "paymentDate") as week_number,
          SUM(total) as total_revenue,
          SUM("totalWithoutVAT") as total_without_vat,
          SUM("totalVAT") as total_vat,
          COUNT(*) as transaction_count
        FROM "payment_webhooks"
        WHERE status = 'success'
        AND "revenuePaymentStatus" = 'recovered'
        AND "paymentDate" >= $1
        AND "paymentDate" <= $2
        ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
        GROUP BY EXTRACT(WEEK FROM "paymentDate")
        ORDER BY week_number
      `;

      const currentWeeklyParams = authenticatedUser.role === 'user' 
        ? [currentMonthStart, currentMonthEnd, authenticatedUser.userId]
        : [currentMonthStart, currentMonthEnd];

      const currentWeeklyResults = await prisma.$queryRawUnsafe(currentWeeklyQuery, ...currentWeeklyParams);
      
      // Build weekly data array
      const weeklyData = currentWeeklyResults.map((result, index) => ({
        label: `Week ${index + 1}`,
        revenue: Number(result.total_revenue) || 0,
        revenueWithoutVAT: Number(result.total_without_vat) || 0,
        vat: Number(result.total_vat) || 0,
        transactionCount: Number(result.transaction_count) || 0,
        week: index + 1
      }));

      // Get yearly data for last 3 years (optimized)
      const yearlyQuery = `
        SELECT 
          EXTRACT(YEAR FROM "paymentDate") as year,
          SUM(total) as total_revenue,
          SUM("totalWithoutVAT") as total_without_vat,
          SUM("totalVAT") as total_vat,
          COUNT(*) as transaction_count
        FROM "payment_webhooks"
        WHERE status = 'success'
        AND "revenuePaymentStatus" = 'recovered'
        AND "paymentDate" >= $1
        AND "paymentDate" <= $2
        ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
        GROUP BY EXTRACT(YEAR FROM "paymentDate")
        ORDER BY year
      `;

      const threeYearsAgo = new Date(currentYear - 2, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
      
      const yearlyParams = authenticatedUser.role === 'user' 
        ? [threeYearsAgo, yearEnd, authenticatedUser.userId]
        : [threeYearsAgo, yearEnd];

      const yearlyResults = await prisma.$queryRawUnsafe(yearlyQuery, ...yearlyParams);

      // Process yearly data
      const yearlyData = [];
      for (let year = currentYear - 2; year <= currentYear; year++) {
        const yearResult = yearlyResults.find(r => Number(r.year) === year);
        
        yearlyData.push({
          label: year.toString(),
          revenue: yearResult ? Number(yearResult.total_revenue) : 0,
          revenueWithoutVAT: yearResult ? Number(yearResult.total_without_vat) : 0,
          vat: yearResult ? Number(yearResult.total_vat) : 0,
          transactionCount: yearResult ? Number(yearResult.transaction_count) : 0
        });
      }

      // Get last month's weekly data (optimized single query)
      const lastMonthStart = new Date(currentYear, currentDate.getMonth() - 1, 1);
      const lastMonthEnd = new Date(currentYear, currentDate.getMonth(), 0, 23, 59, 59);
      
      // Single query for last month weekly data
      const lastMonthWeeklyQuery = `
        SELECT 
          EXTRACT(WEEK FROM "paymentDate") as week_number,
          SUM(total) as total_revenue,
          SUM("totalWithoutVAT") as total_without_vat,
          SUM("totalVAT") as total_vat,
          COUNT(*) as transaction_count
        FROM "payment_webhooks"
        WHERE status = 'success'
        AND "revenuePaymentStatus" = 'recovered'
        AND "paymentDate" >= $1
        AND "paymentDate" <= $2
        ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
        GROUP BY EXTRACT(WEEK FROM "paymentDate")
        ORDER BY week_number
      `;

      const lastMonthWeeklyParams = authenticatedUser.role === 'user' 
        ? [lastMonthStart, lastMonthEnd, authenticatedUser.userId]
        : [lastMonthStart, lastMonthEnd];

      const lastMonthWeeklyResults = await prisma.$queryRawUnsafe(lastMonthWeeklyQuery, ...lastMonthWeeklyParams);
      
      // Build last month weekly data array
      const lastMonthData = lastMonthWeeklyResults.map((result, index) => ({
        label: `Week ${index + 1}`,
        revenue: Number(result.total_revenue) || 0,
        revenueWithoutVAT: Number(result.total_without_vat) || 0,
        vat: Number(result.total_vat) || 0,
        transactionCount: Number(result.transaction_count) || 0,
        week: index + 1
      }));

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

  // Helper function to get revenue period data (similar to getPeriodData)
  async getRevenuePeriodData(period, authenticatedUser) {
    try {
      let where = {};
      
      // If user role is 'user', only show their data
      if (authenticatedUser.role === 'user') {
        where.userId = authenticatedUser.userId;
      }

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      let data = [];
      
      switch (period) {
        case 'monthly':
          // Get last 6 months data
          for (let i = 5; i >= 0; i--) {
            const targetDate = new Date(currentYear, currentDate.getMonth() - i, 1);
            const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);
            
            // Get revenue data from PaymentWebhook table (only recovered customers)
            const revenueData = await prisma.paymentWebhook.aggregate({
              where: {
                ...where,
                paymentDate: { gte: startDate, lte: endDate },
                status: 'success',
                revenuePaymentStatus: 'recovered'  // Only recovered customers
              },
              _sum: {
                total: true,
                totalWithoutVAT: true,
                totalVAT: true
              },
              _count: {
                id: true
              }
            });
            
            data.push({
              label: targetDate.toLocaleString('default', { month: 'short' }),
              revenue: revenueData._sum.total || 0,
              revenueWithoutVAT: revenueData._sum.totalWithoutVAT || 0,
              vat: revenueData._sum.totalVAT || 0,
              transactionCount: revenueData._count.id || 0,
              month: targetDate.getMonth() + 1,
              year: targetDate.getFullYear()
            });
          }
          break;
          
        case 'weekly':
          // Get current month's weekly data - Calendar weeks (Sunday to Saturday)
          const currentMonthStart = new Date(currentYear, currentDate.getMonth(), 1);
          const currentMonthEnd = new Date(currentYear, currentDate.getMonth() + 1, 0, 23, 59, 59);
          
          const weeksInCurrentMonth = [];
          let currentWeekNumber = 1;
          
          // Find the first Sunday of the month or before the month starts
          let currentWeekStartDate = new Date(currentMonthStart);
          const currentFirstDayOfWeek = currentMonthStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
          
          // If month doesn't start on Sunday, go back to previous Sunday
          if (currentFirstDayOfWeek !== 0) {
            currentWeekStartDate.setDate(currentMonthStart.getDate() - currentFirstDayOfWeek);
          }
          
          while (currentWeekStartDate <= currentMonthEnd) {
            // Week runs from Sunday to Saturday
            let currentWeekEndDate = new Date(currentWeekStartDate);
            currentWeekEndDate.setDate(currentWeekStartDate.getDate() + 6);
            currentWeekEndDate.setHours(23, 59, 59, 999);
            
            // Only count weeks that have at least one day in the target month
            const weekHasDaysInMonth = (currentWeekStartDate <= currentMonthEnd) && 
                                     (currentWeekEndDate >= currentMonthStart);
            
            if (weekHasDaysInMonth) {
              // Limit dates to within the month for data query
              const queryStartDate = currentWeekStartDate < currentMonthStart ? currentMonthStart : currentWeekStartDate;
              const queryEndDate = currentWeekEndDate > currentMonthEnd ? currentMonthEnd : currentWeekEndDate;
              
              const revenueData = await prisma.paymentWebhook.aggregate({
                where: {
                  ...where,
                  paymentDate: { gte: queryStartDate, lte: queryEndDate },
                  status: 'success',
                  revenuePaymentStatus: 'recovered'  // Only recovered customers
                },
                _sum: {
                  total: true,
                  totalWithoutVAT: true,
                  totalVAT: true
                },
                _count: {
                  id: true
                }
              });
              
              weeksInCurrentMonth.push({
                label: `Week ${currentWeekNumber}`,
                revenue: revenueData._sum.total || 0,
                revenueWithoutVAT: revenueData._sum.totalWithoutVAT || 0,
                vat: revenueData._sum.totalVAT || 0,
                transactionCount: revenueData._count.id || 0,
                week: currentWeekNumber
              });
              
              currentWeekNumber++;
            }
            
            // Move to next Sunday
            currentWeekStartDate = new Date(currentWeekEndDate);
            currentWeekStartDate.setDate(currentWeekEndDate.getDate() + 1);
            currentWeekStartDate.setHours(0, 0, 0, 0);
          }
          
          data = weeksInCurrentMonth;
          break;
          
        case 'last-month':
          // Last month's weekly data - Calendar weeks (Sunday to Saturday)
          const lastMonthStart = new Date(currentYear, currentDate.getMonth() - 1, 1);
          const lastMonthEnd = new Date(currentYear, currentDate.getMonth(), 0, 23, 59, 59);
          
          const weeksInLastMonth = [];
          let lastMonthWeekNumber = 1;
          
          // Find the first Sunday of the month or before the month starts
          let lastMonthWeekStartDate = new Date(lastMonthStart);
          const lastMonthFirstDayOfWeek = lastMonthStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
          
          // If month doesn't start on Sunday, go back to previous Sunday
          if (lastMonthFirstDayOfWeek !== 0) {
            lastMonthWeekStartDate.setDate(lastMonthStart.getDate() - lastMonthFirstDayOfWeek);
          }
          
          while (lastMonthWeekStartDate <= lastMonthEnd) {
            // Week runs from Sunday to Saturday
            let lastMonthWeekEndDate = new Date(lastMonthWeekStartDate);
            lastMonthWeekEndDate.setDate(lastMonthWeekStartDate.getDate() + 6);
            lastMonthWeekEndDate.setHours(23, 59, 59, 999);
            
            // Only count weeks that have at least one day in the target month
            const weekHasDaysInMonth = (lastMonthWeekStartDate <= lastMonthEnd) && 
                                     (lastMonthWeekEndDate >= lastMonthStart);
            
            if (weekHasDaysInMonth) {
              // Limit dates to within the month for data query
              const queryStartDate = lastMonthWeekStartDate < lastMonthStart ? lastMonthStart : lastMonthWeekStartDate;
              const queryEndDate = lastMonthWeekEndDate > lastMonthEnd ? lastMonthEnd : lastMonthWeekEndDate;
              
              const revenueData = await prisma.paymentWebhook.aggregate({
                where: {
                  ...where,
                  paymentDate: { gte: queryStartDate, lte: queryEndDate },
                  status: 'success',
                  revenuePaymentStatus: 'recovered'  // Only recovered customers
                },
                _sum: {
                  total: true,
                  totalWithoutVAT: true,
                  totalVAT: true
                },
                _count: {
                  id: true
                }
              });
              
              weeksInLastMonth.push({
                label: `Week ${lastMonthWeekNumber}`,
                revenue: revenueData._sum.total || 0,
                revenueWithoutVAT: revenueData._sum.totalWithoutVAT || 0,
                vat: revenueData._sum.totalVAT || 0,
                transactionCount: revenueData._count.id || 0,
                week: lastMonthWeekNumber
              });
              
              lastMonthWeekNumber++;
            }
            
            // Move to next Sunday
            lastMonthWeekStartDate = new Date(lastMonthWeekEndDate);
            lastMonthWeekStartDate.setDate(lastMonthWeekEndDate.getDate() + 1);
            lastMonthWeekStartDate.setHours(0, 0, 0, 0);
          }
          
          data = weeksInLastMonth;
          break;
          
        case 'yearly':
          // Get yearly data for last 3 years (like QR analytics)
          for (let year = currentYear - 2; year <= currentYear; year++) {
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59);
            
            const revenueData = await prisma.paymentWebhook.aggregate({
              where: {
                ...where,
                paymentDate: { gte: startDate, lte: endDate },
                status: 'success',
                revenuePaymentStatus: 'recovered'  // Only recovered customers
              },
              _sum: {
                total: true,
                totalWithoutVAT: true,
                totalVAT: true
              },
              _count: {
                id: true
              }
            });
            
            data.push({
              label: year.toString(),
              revenue: revenueData._sum.total || 0,
              revenueWithoutVAT: revenueData._sum.totalWithoutVAT || 0,
              vat: revenueData._sum.totalVAT || 0,
              transactionCount: revenueData._count.id || 0
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

  // Get monthly LTV Count data (Total Days in Month / Payment Count per Customer) - OPTIMIZED
  getMonthlyLTVCount = async (req, res) => {
    try {
      const authenticatedUser = req.user;
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

      // Single optimized query to get all payment data for the year
      const paymentQuery = `
        SELECT 
          pw."customerId",
          c."customerFullName",
          EXTRACT(MONTH FROM pw."paymentDate") as month,
          COUNT(*) as "paymentCount"
        FROM "payment_webhooks" pw
        JOIN "customers" c ON pw."customerId" = c.id
        ${authenticatedUser.role === 'user' ? 'WHERE pw."userId" = $1' : 'WHERE 1=1'}
        AND pw.status = 'success'
        AND pw."paymentDate" >= ${authenticatedUser.role === 'user' ? '$2' : '$1'}
        AND pw."paymentDate" <= ${authenticatedUser.role === 'user' ? '$3' : '$2'}
        GROUP BY pw."customerId", c."customerFullName", EXTRACT(MONTH FROM pw."paymentDate")
        ORDER BY month, c."customerFullName"
      `;

      const queryParams = authenticatedUser.role === 'user' 
        ? [authenticatedUser.userId, yearStart, yearEnd]
        : [yearStart, yearEnd];

      const paymentData = await prisma.$queryRawUnsafe(paymentQuery, ...queryParams);

      // Process data by month
      const monthlyLTVData = [];
      
      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        const targetDate = new Date(currentYear, monthIndex, 1);
        const monthEnd = new Date(currentYear, monthIndex + 1, 0);
        const totalDaysInMonth = monthEnd.getDate();
        const monthNumber = monthIndex + 1;

        // Filter payments for this month
        const monthPayments = paymentData.filter(p => Number(p.month) === monthNumber);
        
        let monthlyCustomerLTVCounts = [];
        let totalLTVCount = 0;

        for (const payment of monthPayments) {
          const paymentCount = Number(payment.paymentCount);
          if (paymentCount > 0) {
            // Calculate LTV Count: Total Days in Month / Payment Count
            const customerLTVCount = totalDaysInMonth / paymentCount;
            totalLTVCount += customerLTVCount;

            monthlyCustomerLTVCounts.push({
              customerId: payment.customerId,
              customerName: payment.customerFullName,
              totalDaysInMonth: totalDaysInMonth,
              paymentCount: paymentCount,
              ltvCount: Math.round(customerLTVCount * 100) / 100
            });
          }
        }

        // Calculate average LTV Count for this month
        const averageLTVCount = monthlyCustomerLTVCounts.length > 0 
          ? totalLTVCount / monthlyCustomerLTVCounts.length 
          : 0;

        monthlyLTVData.push({
          month: targetDate.toLocaleString('default', { month: 'short' }),
          monthNumber: monthNumber,
          year: currentYear,
          totalDaysInMonth: totalDaysInMonth,
          customersWithPayments: monthlyCustomerLTVCounts.length,
          averageLTVCount: Math.round(averageLTVCount * 100) / 100,
          customerDetails: monthlyCustomerLTVCounts
        });
      }

      return res.json({
        success: true,
        data: {
          year: currentYear,
          monthlyLTVData: monthlyLTVData,
          summary: {
            totalMonths: monthlyLTVData.length,
            overallAverageLTV: monthlyLTVData.length > 0 
              ? Math.round((monthlyLTVData.reduce((sum, month) => sum + month.averageLTVCount, 0) / monthlyLTVData.length) * 100) / 100
              : 0
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
      if (authenticatedUser.role === 'user') {
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
          status: 'active',
        }
      });

      // At risk customers
      const atRiskCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: 'at_risk'
        }
      });

      // Lost customers
      const lostCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: 'lost'
        }
      });

      // Recovered customers
      const recoveredCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: 'recovered'
        }
      });

      // New customers
      const newCustomers = await prisma.customerUser.count({
        where: {
          ...where,
          status: 'new'
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
          role: 'admin'
        }
      });

      const totalBusinessOwners = await prisma.user.count({
        where: {
          role: 'user'
        }
      });

      const totalCustomers = await prisma.customers.count();

      const totalRevenue = await prisma.payment.aggregate({
        _sum: {
          amount: true
        }
      });

      const response = {
        success: true,
        data: {
          totalAdmins,
          totalBusinessOwners,
          totalCustomers,
          totalRevenue: totalRevenue._sum.amount || 0,
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
    const { month, year } = req.query;
    const currentDate = new Date();
    const targetMonth = month || currentDate.getMonth() + 1;
    const targetYear = year || currentDate.getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
    const prevStartDate = new Date(targetYear, targetMonth - 2, 1);
    const prevEndDate = new Date(targetYear, targetMonth - 1, 0, 23, 59, 59);

    const [recoveredCustomers, prevRecoveredCustomers, recoveredRevenue, prevRecoveredRevenue,
      lostRevenue, prevLostRevenue, customerLTV, prevCustomerLTV] = await Promise.all([
        prisma.customerUser.count({
          where: {
            status: 'recovered',
            updatedAt: { gte: startDate, lte: endDate }
          }
        }),
        prisma.customerUser.count({
          where: {
            status: 'recovered',
            updatedAt: { gte: prevStartDate, lte: prevEndDate }
          }
        }),
        prisma.payment.aggregate({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            user: {
              customerUsers: {
                some: { status: 'recovered' }
              }
            }
          },
          _sum: { amount: true }
        }),
        prisma.payment.aggregate({
          where: {
            createdAt: { gte: prevStartDate, lte: prevEndDate },
            user: {
              customerUsers: {
                some: { status: 'recovered' }
              }
            }
          },
          _sum: { amount: true }
        }),
        prisma.payment.aggregate({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            user: {
              customerUsers: {
                some: { status: 'lost' }
              }
            }
          },
          _sum: { amount: true }
        }),
        prisma.payment.aggregate({
          where: {
            createdAt: { gte: prevStartDate, lte: prevEndDate },
            user: {
              customerUsers: {
                some: { status: 'lost' }
              }
            }
          },
          _sum: { amount: true }
        }),
        prisma.payment.aggregate({
          where: { createdAt: { gte: startDate, lte: endDate } },
          _avg: { amount: true }
        }),
        prisma.payment.aggregate({
          where: { createdAt: { gte: prevStartDate, lte: prevEndDate } },
          _avg: { amount: true }
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
        value: recoveredRevenue._sum.amount || 0,
        change: calculatePercentageChange(
          recoveredRevenue._sum.amount || 0,
          prevRecoveredRevenue._sum.amount || 0
        ),
        trend: (recoveredRevenue._sum.amount || 0) >= (prevRecoveredRevenue._sum.amount || 0) ? 'up' : 'down'
      },
      lostRevenue: {
        value: lostRevenue._sum.amount || 0,
        change: calculatePercentageChange(
          lostRevenue._sum.amount || 0,
          prevLostRevenue._sum.amount || 0
        ),
        trend: (lostRevenue._sum.amount || 0) >= (prevLostRevenue._sum.amount || 0) ? 'up' : 'down'
      },
      customerLTV: {
        value: (customerLTV._avg.amount || 0).toFixed(1),
        change: calculatePercentageChange(
          customerLTV._avg.amount || 0,
          prevCustomerLTV._avg.amount || 0
        ),
        trend: (customerLTV._avg.amount || 0) >= (prevCustomerLTV._avg.amount || 0) ? 'up' : 'down'
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
        where: { status: 'active' }
      }),
      prisma.customerUser.count({
        where: { status: 'risk' || 'at_risk' || 'at risk' || 'risk' }
      }),
      prisma.customerUser.count({
        where: { status: 'lost' }
      }),
      prisma.customerUser.count({
        where: { status: 'recovered' }
      }),
      prisma.customerUser.count({
        where: { status: 'new' }
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
    const [totalAdmins, totalBusinessOwners, totalCustomers, totalRevenue] = await Promise.all([
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { role: 'user' } }),
      prisma.customers.count(),
      prisma.payment.aggregate({ _sum: { amount: true } })
    ]);

    return {
      totalAdmins,
      totalBusinessOwners,
      totalCustomers,
      totalRevenue: totalRevenue._sum.amount || 0,
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
          ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
          GROUP BY "qrCodeId"
        ) scan_stats ON qr.id = scan_stats."qrCodeId"
        ${authenticatedUser.role === 'user' ? 'WHERE qr."userId" = $' + (authenticatedUser.role === 'user' ? '3' : '1') : 'WHERE 1=1'}
        AND qr."createdAt" >= $1 AND qr."createdAt" <= $2
        ORDER BY qr."createdAt" DESC
      `;

      // Calculate date range for current month
      const startDate = new Date(currentYear, currentDate.getMonth(), 1);
      const endDate = new Date(currentYear, currentDate.getMonth() + 1, 0, 23, 59, 59);
      
      const qrParams = authenticatedUser.role === 'user' 
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
      if (authenticatedUser.role === 'user') {
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
      if (authenticatedUser.role === 'user') {
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
            ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(YEAR FROM "scanTime"), EXTRACT(MONTH FROM "scanTime")
            ORDER BY year, month
          `;
          
          const monthlyParams = authenticatedUser.role === 'user' 
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
              shareCount: monthResult ? Number(monthResult.share_count) : 0
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
            ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(QUARTER FROM "scanTime")
            ORDER BY quarter
          `;
          
          const quarterlyParams = authenticatedUser.role === 'user' 
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
            ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(YEAR FROM "scanTime")
            ORDER BY year
          `;
          
          const yearlyParams = authenticatedUser.role === 'user' 
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
            ${authenticatedUser.role === 'user' ? 'AND "userId" = $3' : ''}
            GROUP BY EXTRACT(DOW FROM "scanTime")
            ORDER BY day_of_week
          `;
          
          const weeklyParams = authenticatedUser.role === 'user' 
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