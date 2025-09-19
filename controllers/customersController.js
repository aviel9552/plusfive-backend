const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const CustomerStatusService = require('../services/CustomerStatusService');

// Initialize CustomerStatusService
const customerStatusService = new CustomerStatusService();

// Get all customers with search (no pagination - frontend will handle)
const getAllCustomers = async (req, res) => {
  try {
    const { search, businessId } = req.query;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Build where clause - Always filter by authenticated user's ID
    const where = {
      userId: authenticatedUserId // Filter by authenticated user only
    };
    
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { customerFullName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { selectedServices: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (businessId) {
      where.businessId = parseInt(businessId);
    }

    // Get all customers (no pagination) and include user data
    const customers = await prisma.customers.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            businessType: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate totalAppointmentCount, get CustomerUser status and reviews for each customer
    const customersWithTotalCount = await Promise.all(
      customers.map(async (customer) => {
        // Get total appointments count
        const totalAppointments = await prisma.appointment.count({
          where: {
            customerId: customer.id
          }
        });

        // Get customer status from CustomerUser table (same logic as getCustomersStatusCount)
        const customerUserStatus = await prisma.customerUser.findFirst({
          where: {
            customerId: customer.id,
            userId: customer.userId,
            isDeleted: false // Only active relationships
          },
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            status: true
          }
        });

        const realTimeStatus = customerUserStatus?.status || 'active';

        // Get all reviews for this customer that match with the business owner (userId)
        const customerReviews = await prisma.review.findMany({
          where: {
            customerId: customer.id,
            userId: customer.userId // Match with business owner
          },
          include: {
            user: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        // Calculate review statistics for this customer with specific userId
        const reviewStats = await prisma.review.aggregate({
          where: { 
            customerId: customer.id,
            userId: customer.userId // Match with business owner
          },
          _avg: { rating: true },
          _count: { rating: true },
          _min: { rating: true },
          _max: { rating: true }
        });

        // Get latest review rating (most recent one) for "Last" star display
        const latestReview = customerReviews.length > 0 ? customerReviews[0] : null;
        const lastRating = latestReview ? latestReview.rating : 0;

        // Get latest appointment updatedAt only
        const lastVisit = await prisma.appointment.findFirst({
          where: {
            customerId: customer.id,
            userId: customer.userId // Match with business owner
          },
          orderBy: { updatedAt: 'desc' }, // Latest updated appointment
          select: {
            updatedAt: true // Only updatedAt field
          }
        });

        // Get payment data from PaymentWebhook table
        const paymentData = await prisma.paymentWebhook.findMany({
          where: {
            customerId: customer.id,
            userId: customer.userId, // Match with business owner
            status: 'success' // Only successful payments
          },
          orderBy: { paymentDate: 'desc' }, // Order by payment date
          select: {
            total: true,
            paymentDate: true,
            status: true
          }
        });

        // Calculate total paid amount and last payment
        const totalPaidAmount = paymentData.reduce((sum, payment) => sum + payment.total, 0);
        const lastPayment = paymentData.length > 0 ? paymentData[0] : null;

        return {
          ...customer,
          totalAppointmentCount: totalAppointments,
          customerStatus: realTimeStatus || 'active', // Use real-time calculated status
          reviews: customerReviews,
          lastRating: lastRating, // Latest review rating for "Last: X ⭐" display
          lastVisit: lastPayment?.paymentDate || null, // Only updatedAt field
          // Payment data
          totalPaidAmount: totalPaidAmount, // Total amount paid by customer
          lastPaymentAmount: lastPayment?.total || 0, // Last payment amount
          lastPaymentDate: lastPayment?.paymentDate || null, // Last payment date
          paymentCount: paymentData.length, // Total number of payments
          reviewStatistics: {
            totalReviews: reviewStats._count.rating || 0,
            averageRating: reviewStats._avg.rating ? parseFloat(reviewStats._avg.rating.toFixed(2)) : 0,
            minRating: reviewStats._min.rating || 0,
            maxRating: reviewStats._max.rating || 0,
            lastRating: lastRating // Also include in statistics for easy access
          }
        };
      })
    );

    // Get total count for reference
    const total = await prisma.customers.count({ where });

    return successResponse(res, {
      customers: customersWithTotalCount,  // ✅ customers with totalAppointmentCount and payment data
      total: total // Total count for frontend reference
    }, 'Customers retrieved successfully');

  } catch (error) {
    console.error('Get customers error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get ten customers without pagination
const getTenCustomers = async (req, res) => {
  try {
    const { businessId } = req.query;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Build where clause - Always filter by authenticated user's ID
    const where = {
      userId: authenticatedUserId // Filter by authenticated user only
    };

    if (businessId) {
      where.businessId = parseInt(businessId);
    }

    // Get total count first to check how many customers exist
    const totalCustomersCount = await prisma.customers.count({ where });
    
    // Get customers (either 10 or all if less than 10 exist)
    const takeLimit = Math.min(10, totalCustomersCount);
    const customers = await prisma.customers.findMany({
      where,
      take: takeLimit,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            businessType: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate totalAppointmentCount, get CustomerUser status and reviews for each customer
    const customersWithTotalCount = await Promise.all(
      customers.map(async (customer) => {
        // Get total appointments count
        const totalAppointments = await prisma.appointment.count({
          where: {
            customerId: customer.id
          }
        });

        // Get CustomerUser status (latest active status)
        const customerUserStatus = await prisma.customerUser.findFirst({
          where: {
            customerId: customer.id,
            isDeleted: false // Only get active relationships
          },
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            status: true
          }
        });

        // Get all reviews for this customer that match with the business owner (userId)
        const customerReviews = await prisma.review.findMany({
          where: {
            customerId: customer.id,
            userId: customer.userId // Match with business owner
          },
          include: {
            user: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        // Calculate review statistics for this customer with specific userId
        const reviewStats = await prisma.review.aggregate({
          where: { 
            customerId: customer.id,
            userId: customer.userId // Match with business owner
          },
          _avg: { rating: true },
          _count: { rating: true },
          _min: { rating: true },
          _max: { rating: true }
        });

        // Get latest review rating (most recent one) for "Last" star display
        const latestReview = customerReviews.length > 0 ? customerReviews[0] : null;
        const lastRating = latestReview ? latestReview.rating : 0;

        // Get latest appointment updatedAt only
        const lastVisit = await prisma.appointment.findFirst({
          where: {
            customerId: customer.id,
            userId: customer.userId // Match with business owner
          },
          orderBy: { updatedAt: 'desc' }, // Latest updated appointment
          select: {
            updatedAt: true // Only updatedAt field
          }
        });

        // Get payment data from PaymentWebhook table
        const paymentData = await prisma.paymentWebhook.findMany({
          where: {
            customerId: customer.id,
            userId: customer.userId, // Match with business owner
            status: 'success' // Only successful payments
          },
          orderBy: { paymentDate: 'desc' }, // Order by payment date
          select: {
            total: true,
            paymentDate: true,
            status: true
          }
        });

        // Calculate total paid amount and last payment
        const totalPaidAmount = paymentData.reduce((sum, payment) => sum + payment.total, 0);
        const lastPayment = paymentData.length > 0 ? paymentData[0] : null;

        return {
          ...customer,
          totalAppointmentCount: totalAppointments,
          customerStatus: customerUserStatus?.status || 'active', // Default to active if no status found
          reviews: customerReviews,
          lastRating: lastRating, // Latest review rating for "Last: X ⭐" display
          lastVisit: lastPayment?.paymentDate || null, // Only updatedAt field
          // Payment data
          totalPaidAmount: totalPaidAmount, // Total amount paid by customer
          lastPaymentAmount: lastPayment?.total || 0, // Last payment amount
          lastPaymentDate: lastPayment?.paymentDate || null, // Last payment date
          paymentCount: paymentData.length, // Total number of payments
          reviewStatistics: {
            totalReviews: reviewStats._count.rating || 0,
            averageRating: reviewStats._avg.rating ? parseFloat(reviewStats._avg.rating.toFixed(2)) : 0,
            minRating: reviewStats._min.rating || 0,
            maxRating: reviewStats._max.rating || 0,
            lastRating: lastRating // Also include in statistics for easy access
          }
        };
      })
    );

    return successResponse(res, {
      customers: customersWithTotalCount,
      total: customersWithTotalCount.length,
      totalAvailable: totalCustomersCount,
      remaining: Math.max(0, totalCustomersCount - customersWithTotalCount.length),
      message: totalCustomersCount >= 10 
        ? 'Latest 10 customers retrieved successfully' 
        : `Only ${totalCustomersCount} customers found (less than 10)`
    }, totalCustomersCount >= 10 ? 'Latest 10 customers retrieved successfully' : `Only ${totalCustomersCount} customers found`);

  } catch (error) {
    console.error('Get ten customers error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get customer status counts for dashboard
const getCustomersStatusCount = async (req, res) => {
  try {
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Build where clause - Always filter by authenticated user's ID
    const where = {
      userId: authenticatedUserId // Filter by authenticated user only
    };

    // Get all customers for this user
    const allCustomers = await prisma.customers.findMany({
      where,
      select: {
        id: true,
        userId: true
      }
    });

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

    // Calculate total
    const total = allCustomers.length;

    return successResponse(res, {
      statusCounts,
      total,
      breakdown: {
        active: {
          count: statusCounts.active,
          percentage: total > 0 ? ((statusCounts.active / total) * 100).toFixed(1) : 0
        },
        at_risk: {
          count: statusCounts.at_risk,
          percentage: total > 0 ? ((statusCounts.at_risk / total) * 100).toFixed(1) : 0
        },
        lost: {
          count: statusCounts.lost,
          percentage: total > 0 ? ((statusCounts.lost / total) * 100).toFixed(1) : 0
        },
        recovered: {
          count: statusCounts.recovered,
          percentage: total > 0 ? ((statusCounts.recovered / total) * 100).toFixed(1) : 0
        },
        new: {
          count: statusCounts.new,
          percentage: total > 0 ? ((statusCounts.new / total) * 100).toFixed(1) : 0
        }
      }
    }, 'Customer status counts retrieved successfully');

  } catch (error) {
    console.error('Get customer status counts error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get customer by ID with detailed information
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    if (!id) {
      return errorResponse(res, 'Customer ID is required', 400);
    }

    // Build where clause - Always filter by authenticated user's ID
    const where = { 
      id,
      userId: authenticatedUserId // Filter by authenticated user only
    };

    // Get customer by ID with user data
    const customer = await prisma.customers.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true
          }
        }
      }
    });
    
    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Get total appointments count
    const totalAppointments = await prisma.appointment.count({
      where: {
        customerId: customer.id
      }
    });

    // Get all appointments for this customer
    const appointments = await prisma.appointment.findMany({
      where: {
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      orderBy: { createdAt: 'desc' },
      take: 10 // Latest 10 appointments
    });

    // Get CustomerUser status (latest active status)
    const customerUserStatus = await prisma.customerUser.findFirst({
      where: {
        customerId: customer.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Get all reviews for this customer that match with the business owner (userId)
    const customerReviews = await prisma.review.findMany({
      where: {
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate review statistics for this customer with specific userId
    const reviewStats = await prisma.review.aggregate({
      where: { 
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      _avg: { rating: true },
      _count: { rating: true },
      _min: { rating: true },
      _max: { rating: true },
      _sum: { rating: true }
    });

    // Get latest review rating (most recent one) for "Last" star display
    const latestReview = customerReviews.length > 0 ? customerReviews[0] : null;
    const lastRating = latestReview ? latestReview.rating : 0;

    // Get latest appointment updatedAt only
    const lastVisit = await prisma.appointment.findFirst({
      where: {
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      orderBy: { updatedAt: 'desc' }, // Latest updated appointment
      select: {
        updatedAt: true,
        startDate: true,
        endDate: true,
        selectedServices: true
      }
    });

    // Get payment webhooks for this customer
    const paymentHistory = await prisma.paymentWebhook.findMany({
      where: {
        customerId: customer.id,
        userId: customer.userId
      },
      orderBy: { createdAt: 'desc' },
      take: 10 // Latest 10 payments
    });

    // Calculate total spent
    const totalSpentResult = await prisma.paymentWebhook.aggregate({
      where: {
        customerId: customer.id,
        userId: customer.userId,
        status: 'success'
      },
      _sum: { total: true }
    });

    const customerWithDetails = {
      ...customer,
      totalAppointmentCount: totalAppointments,
      customerStatus: customerUserStatus?.status || 'active',
      customerStatusDetails: customerUserStatus,
      reviews: customerReviews,
      lastRating: lastRating,
      lastVisit: lastVisit?.updatedAt || null,
      lastAppointmentDetails: lastVisit,
      appointments: appointments,
      paymentHistory: paymentHistory,
      totalSpent: totalSpentResult._sum.total || 0,
      reviewStatistics: {
        totalReviews: reviewStats._count.rating || 0,
        averageRating: reviewStats._avg.rating ? parseFloat(reviewStats._avg.rating.toFixed(2)) : 0,
        minRating: reviewStats._min.rating || 0,
        maxRating: reviewStats._max.rating || 0,
        totalRatingSum: reviewStats._sum.rating || 0,
        lastRating: lastRating
      }
    };

    return successResponse(res, {
      customer: customerWithDetails
    }, 'Customer details retrieved successfully');

  } catch (error) {
    console.error('Get customer by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  getAllCustomers,
  getTenCustomers,
  getCustomersStatusCount,
  getCustomerById
};
