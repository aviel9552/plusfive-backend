const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AdminDashboardController {
  // Get monthly performance metrics
  getMonthlyPerformance = async (req, res) => {
    try {

      const authenticatedUser = req.user;
      const where = {
        userId: authenticatedUser.userId // Filter by authenticated user only
      };

      let allCustomers;
      if (authenticatedUser.role === 'user') {
        // Get all customers for this user
        allCustomers = await prisma.customers.findMany({
          where,
          select: {
            id: true,
            userId: true
          }
        });
      } else {
        // Get all customers for all users
        allCustomers = await prisma.customers.findMany({
          select: {
            id: true,
            userId: true
          }
        });
      }

      // Initialize counters
      const statusCounts = {
        active: 0,
        at_risk: 0,
        lost: 0,
        recovered: 0,
        new: 0
      };

      // Get status for each customer from CustomerUser table
      for (const customer of allCustomers) {
        const customerUserStatus = await prisma.customerUser.findFirst({
          where: {
            customerId: customer.id,
            userId: customer.userId,
            isDeleted: false // Only count active relationships
          },
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            status: true
          }
        });

        const status = customerUserStatus?.status || 'active';
        if (statusCounts.hasOwnProperty(status)) {
          statusCounts[status]++;
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
      
      // Get monthly average rating data for current year
      const monthlyData = [];
      
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(currentYear, month, 1);
        const endDate = new Date(currentYear, month + 1, 0, 23, 59, 59);
        
        // Get reviews for this month (only rated reviews, not rating requests)
        const monthReviews = await prisma.review.findMany({
          where: {
            ...where,
            createdAt: { gte: startDate, lte: endDate },
            rating: { gt: 0 } // Only actual ratings, not rating requests (rating = 0)
          },
          select: {
            rating: true
          }
        });
        
        // Calculate average rating for this month
        let averageRating = 0;
        if (monthReviews.length > 0) {
          const totalRating = monthReviews.reduce((sum, review) => sum + review.rating, 0);
          averageRating = totalRating / monthReviews.length;
        }
        
        monthlyData.push({
          month: startDate.toLocaleString('default', { month: 'short' }),
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
          totalReviews: monthReviews.length,
          monthNumber: month + 1
        });
      }

      // Calculate overall statistics
      const allReviews = await prisma.review.findMany({
        where: {
          ...where,
          rating: { gt: 0 }
        },
        select: {
          rating: true
        }
      });

      const overallAverage = allReviews.length > 0 
        ? Math.round((allReviews.reduce((sum, review) => sum + review.rating, 0) / allReviews.length) * 10) / 10
        : 0;

      return res.json({
        success: true,
        data: {
          monthlyData: monthlyData,
          overallStats: {
            totalReviews: allReviews.length,
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

      // Get total revenue data
      const totalRevenueData = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          status: 'success'
        },
        _sum: {
          total: true
        },
        _count: {
          id: true
        }
      });

      // Get lost customers revenue and count
      const lostRevenueData = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          status: 'success',
          revenuePaymentStatus: 'lost'
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

      // Get recovered customers revenue and count
      const recoveredRevenueData = await prisma.paymentWebhook.aggregate({
        where: {
          ...where,
          status: 'success',
          revenuePaymentStatus: 'recovered'
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
      
      return res.json({
        success: true,
        data: {
          // Total data
          totalRevenue: totalRevenueData._sum.total || 0,
          totalCount: totalRevenueData._count.id || 0,
          
          // Recovered customers detailed breakdown
          totalRecoveredRevenue: recoveredRevenueData._sum.total || 0,
          totalWithoutVATRecoveredRevenue: recoveredRevenueData._sum.totalWithoutVAT || 0,
          totalVATRecoveredRevenue: recoveredRevenueData._sum.totalVAT || 0,
          recoveredCount: recoveredRevenueData._count.id || 0,
          
          // Lost customers detailed breakdown
          totalLostRevenue: lostRevenueData._sum.total || 0,
          totalWithoutVATLostRevenue: lostRevenueData._sum.totalWithoutVAT || 0,
          totalVATLostRevenue: lostRevenueData._sum.totalVAT || 0,
          lostCount: lostRevenueData._count.id || 0
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

  // Get Revenue Impact with filters (similar to getQRCodeAnalytics)
  getRevenueImpacts = async (req, res) => {
    try {
      const authenticatedUser = req.user;

      // Build where clause based on user role
      let where = {};
      if (authenticatedUser.role === 'user') {
        where.userId = authenticatedUser.userId;
      }

      // Get data for different periods (same as getQRCodeAnalytics)
      const monthlyData = await this.getRevenuePeriodData('monthly', authenticatedUser);
      const weeklyData = await this.getRevenuePeriodData('weekly', authenticatedUser);
      const lastMonthData = await this.getRevenuePeriodData('last-month', authenticatedUser);
      const yearlyData = await this.getRevenuePeriodData('yearly', authenticatedUser);

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
            
            // Get revenue data from PaymentWebhook table
            const revenueData = await prisma.paymentWebhook.aggregate({
              where: {
                ...where,
                paymentDate: { gte: startDate, lte: endDate },
                status: 'success'
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
          // Get last 4 weeks data
          for (let i = 3; i >= 0; i--) {
            const targetDate = new Date(currentDate.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
            const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - targetDate.getDay());
            const endDate = new Date(startDate.getTime() + (6 * 24 * 60 * 60 * 1000) + (23 * 60 * 60 * 1000) + (59 * 60 * 1000) + (59 * 1000));
            
            const revenueData = await prisma.paymentWebhook.aggregate({
              where: {
                ...where,
                paymentDate: { gte: startDate, lte: endDate },
                status: 'success'
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
              label: `Week ${4 - i}`,
              revenue: revenueData._sum.total || 0,
              revenueWithoutVAT: revenueData._sum.totalWithoutVAT || 0,
              vat: revenueData._sum.totalVAT || 0,
              transactionCount: revenueData._count.id || 0,
              week: 4 - i
            });
          }
          break;
          
        case 'last-month':
          // Last month's weekly data
          const lastMonthStart = new Date(currentYear, currentDate.getMonth() - 1, 1);
          const lastMonthEnd = new Date(currentYear, currentDate.getMonth(), 0, 23, 59, 59);
          
          // Get all weeks in last month
          const weeksInLastMonth = [];
          const tempDate = new Date(lastMonthStart);
          
          while (tempDate <= lastMonthEnd) {
            const weekStart = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate() - tempDate.getDay());
            const weekEnd = new Date(weekStart.getTime() + (6 * 24 * 60 * 60 * 1000) + (23 * 60 * 60 * 1000) + (59 * 60 * 1000) + (59 * 1000));
            
            // Check if this week is within last month
            if (weekStart >= lastMonthStart && weekEnd <= lastMonthEnd) {
              const weekNumber = Math.ceil((tempDate.getDate() - tempDate.getDay() + 1) / 7);
              
              const revenueData = await prisma.paymentWebhook.aggregate({
                where: {
                  ...where,
                  paymentDate: { gte: weekStart, lte: weekEnd },
                  status: 'success'
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
                label: `Week ${weekNumber}`,
                revenue: revenueData._sum.total || 0,
                revenueWithoutVAT: revenueData._sum.totalWithoutVAT || 0,
                vat: revenueData._sum.totalVAT || 0,
                transactionCount: revenueData._count.id || 0,
                week: weekNumber
              });
            }
            
            tempDate.setDate(tempDate.getDate() + 7);
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
                status: 'success'
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
              color: '#675DFF'
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
              color: '#DF64CC'
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
    const revenueData = [];

    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

      const monthRevenue = await prisma.payment.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate }
        },
        _sum: { amount: true }
      });

      revenueData.push({
        month: targetDate.toLocaleString('default', { month: 'long' }),
        revenue: monthRevenue._sum.amount || 0,
        year: targetDate.getFullYear()
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

  // Get QR Code Analytics with ScanCount and ShareCount
  getQRCodeAnalytics = async (req, res) => {
    try {
      const authenticatedUser = req.user;

      
      let where = {};
      
      // If user role is 'user', only show their data
      if (authenticatedUser.role === 'user') {
        where.userId = authenticatedUser.userId;
      }
      // If admin, show all data (where remains empty)
      
      // Use common helper function for date calculations
      const { startDate, endDate } = this.calculateDateRange('monthly');
      
      // Add date filter to where clause
      where.createdAt = {
        gte: startDate,
        lte: endDate
      };
      
      // Get QR code data with actual fields
      const qrCodeData = await prisma.qRCode.findMany({
        where,
        select: {
          id: true,
          name: true,
          url: true,
          qrData: true,
          qrCodeImage: true,
          messageForCustomer: true,
          directMessage: true,
          directUrl: true,
          messageUrl: true,
          isActive: true,
          scans: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              businessName: true,
              businessType: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Get scan and share data from QRCodeScan table for the date range
      const scanData = await prisma.qRCodeScan.findMany({
        where: {
          scanTime: {
            gte: startDate,
            lte: endDate
          },
          ...(authenticatedUser.role === 'user' && { userId: authenticatedUser.userId })
        },
        select: {
          qrCodeId: true,
          scanData: true,
          sharedata: true,
          scanTime: true
        }
      });

      // Calculate actual scan and share counts for each QR code
      const qrCodeStats = {};
      scanData.forEach(record => {
        if (!qrCodeStats[record.qrCodeId]) {
          qrCodeStats[record.qrCodeId] = { scans: 0, shares: 0 };
        }
        
        if (record.scanData && !record.sharedata) {
          qrCodeStats[record.qrCodeId].scans++;
        } else if (record.sharedata && !record.scanData) {
          qrCodeStats[record.qrCodeId].shares++;
        }
      });

      // Add stats to QR code data
      const qrCodeDataWithStats = qrCodeData.map(qr => ({
        ...qr,
        actualScans: qrCodeStats[qr.id]?.scans || 0,
        actualShares: qrCodeStats[qr.id]?.shares || 0
      }));
      
      // Calculate totals using actual data from QRCodeScan table
      const totalScans = Object.values(qrCodeStats).reduce((sum, stats) => sum + stats.scans, 0);
      const totalShares = Object.values(qrCodeStats).reduce((sum, stats) => sum + stats.shares, 0);
      const totalQRCodes = qrCodeData.length;
      
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
      
      // Get previous period data for comparison using common helper
      const previousData = await this.getPreviousPeriodData('monthly', startDate, where);
      
      // previousData already contains the data from helper function
      
      // Calculate percentage changes
      const calculatePercentageChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous * 100).toFixed(2);
      };
      
      // Get data for different periods
      const monthlyData = await this.getPeriodData('monthly', authenticatedUser);
      const quarterlyData = await this.getPeriodData('quarterly', authenticatedUser);
      const yearlyData = await this.getPeriodData('yearly', authenticatedUser);
      const weeklyData = await this.getPeriodData('thisWeek', authenticatedUser);

      const response = {
        success: true,
        data: {
          // period: 'monthly',
          // dateRange: {
          //   start: startDate.toISOString(),
          //   end: endDate.toISOString()
          // },
          // summary: {
          //   totalQRCodes,
          //   totalScans,
          //   totalShares,
          //   avgScans: parseFloat(avgScans),
          //   avgShares: parseFloat(avgShares)
          // },
          // topPerformers: {
          //   mostScanned: topScannedQR,
          //   mostShared: topSharedQR
          // },
          // qrCodes: qrCodeDataWithStats,
          // comparison: previousData ? {
          //   previousPeriod: {
          //     scans: previousData.scans,
          //     shares: previousData.shares,
          //     qrCodes: previousData.qrCodes
          //   },
          //   changes: {
          //     scansChange: calculatePercentageChange(totalScans, previousData.scans),
          //     sharesChange: calculatePercentageChange(totalShares, previousData.shares),
          //     qrCodesChange: calculatePercentageChange(totalQRCodes, previousData.qrCodes)
          //   }
          // } : null,
          // Frontend ke jaisa data structure
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

  // Helper function to get period data for frontend charts
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
          // Get last 6 months data
          for (let i = 5; i >= 0; i--) {
            const targetDate = new Date(currentYear, currentDate.getMonth() - i, 1);
            const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);
            
            // Get scan and share data from QRCodeScan table
            const scanData = await prisma.qRCodeScan.findMany({
              where: {
                ...where,
                scanTime: { gte: startDate, lte: endDate }
              },
              select: {
                scanData: true,
                sharedata: true
              }
            });
            
            // Calculate scan and share counts
            let scanCount = 0;
            let shareCount = 0;
            
            scanData.forEach(record => {
              if (record.scanData && !record.sharedata) {
                scanCount++;
              } else if (record.sharedata && !record.scanData) {
                shareCount++;
              }
            });
            
            data.push({
              label: targetDate.toLocaleString('default', { month: 'short' }),
              scanCount: scanCount,
              shareCount: shareCount
            });
          }
          break;
          
        case 'quarterly':
          // Get quarterly data for current year
          for (let quarter = 1; quarter <= 4; quarter++) {
            const quarterStartMonth = (quarter - 1) * 3;
            const startDate = new Date(currentYear, quarterStartMonth, 1);
            const endDate = new Date(currentYear, quarterStartMonth + 3, 0, 23, 59, 59);
            
            // Get scan and share data from QRCodeScan table
            const scanData = await prisma.qRCodeScan.findMany({
              where: {
                ...where,
                scanTime: { gte: startDate, lte: endDate }
              },
              select: {
                scanData: true,
                sharedata: true
              }
            });
            
            // Calculate scan and share counts
            let scanCount = 0;
            let shareCount = 0;
            
            scanData.forEach(record => {
              if (record.scanData && !record.sharedata) {
                scanCount++;
              } else if (record.sharedata && !record.scanData) {
                shareCount++;
              }
            });
            
            data.push({
              label: `Q${quarter}`,
              scanCount: scanCount,
              shareCount: shareCount
            });
          }
          break;
          
        case 'yearly':
          // Get last 3 years data
          for (let year = currentYear - 2; year <= currentYear; year++) {
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59);
            
            // Get scan and share data from QRCodeScan table
            const scanData = await prisma.qRCodeScan.findMany({
              where: {
                ...where,
                scanTime: { gte: startDate, lte: endDate }
              },
              select: {
                scanData: true,
                sharedata: true
              }
            });
            
            // Calculate scan and share counts
            let scanCount = 0;
            let shareCount = 0;
            
            scanData.forEach(record => {
              if (record.scanData && !record.sharedata) {
                scanCount++;
              } else if (record.sharedata && !record.scanData) {
                shareCount++;
              }
            });
            
            data.push({
              label: year.toString(),
              scanCount: scanCount,
              shareCount: shareCount
            });
          }
          break;
          
        case 'thisWeek':
          // Get current week data
          const weekStart = new Date(currentDate);
          weekStart.setDate(currentDate.getDate() - currentDate.getDay());
          weekStart.setHours(0, 0, 0, 0);
          
          const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          
          for (let i = 0; i < 7; i++) {
            const dayStart = new Date(weekStart);
            dayStart.setDate(weekStart.getDate() + i);
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);
            
            // Get scan and share data from QRCodeScan table
            const scanData = await prisma.qRCodeScan.findMany({
              where: {
                ...where,
                scanTime: { gte: dayStart, lte: dayEnd }
              },
              select: {
                scanData: true,
                sharedata: true
              }
            });
            
            // Calculate scan and share counts
            let scanCount = 0;
            let shareCount = 0;
            
            scanData.forEach(record => {
              if (record.scanData && !record.sharedata) {
                scanCount++;
              } else if (record.sharedata && !record.scanData) {
                shareCount++;
              }
            });
            
            data.push({
              label: weekDays[i],
              scanCount: scanCount,
              shareCount: shareCount
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
