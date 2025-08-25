const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AdminDashboardController {
  // Get monthly performance metrics
  async getMonthlyPerformance(req, res) {
    try {
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
  async getRevenueImpact(req, res) {
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

  // Get customer status breakdown
  async getCustomerStatusBreakdown(req, res) {
    try {
      const totalCustomers = await prisma.customers.count();

      // Active customers (have made payments in last 3 months through their business owners)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      // const activeCustomers = await prisma.customers.count({
      //   where: {
      //     user: {
      //       payments: {
      //         some: {
      //           createdAt: {
      //             gte: threeMonthsAgo
      //           }
      //         }
      //       }
      //     }
      //   }
      // });
      const activeCustomers = await prisma.customerUser.count({
        where: {
          status: 'active',
        }
      });

      // At risk customers
      const atRiskCustomers = await prisma.customerUser.count({
        where: {
          status: 'risk'
        }
      });

      // Lost customers
      const lostCustomers = await prisma.customerUser.count({
        where: {
          status: 'lost'
        }
      });

      // Recovered customers
      const recoveredCustomers = await prisma.customerUser.count({
        where: {
          status: 'recovered'
        }
      });

      // New customers
      const newCustomers = await prisma.customerUser.count({
        where: {
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
  async getAdminSummary(req, res) {
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
  async getDashboardOverview(req, res) {
    try {
      const [monthlyPerformance, revenueImpact, customerStatus, adminSummary] = await Promise.all([
        this.getMonthlyPerformanceData(req),
        this.getRevenueImpactData(req),
        this.getCustomerStatusData(req),
        this.getAdminSummaryData(req)
      ]);

      res.json({
        success: true,
        data: {
          monthlyPerformance,
          revenueImpact,
          customerStatus,
          adminSummary
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
        where: { status: 'risk' }
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
}

module.exports = new AdminDashboardController();
