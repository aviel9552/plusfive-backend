const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Get all customers with pagination and search
const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, businessId, userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = {};
    
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

    if (userId) {
      where.userId = userId;
    }

    // Get customers with pagination and include user data
    const customers = await prisma.customers.findMany({
      where,
      skip,
      take: parseInt(limit),
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
            customerId: customer.id
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

        return {
          ...customer,
          totalAppointmentCount: totalAppointments,
          customerStatus: customerUserStatus?.status || 'active', // Default to active if no status found
          reviews: customerReviews,
          lastRating: lastRating, // Latest review rating for "Last: X ⭐" display
          lastVisit: lastVisit?.updatedAt || null, // Only updatedAt field
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

    // Get total count for pagination
    const total = await prisma.customers.count({ where });

    return successResponse(res, {
      customers: customersWithTotalCount,  // ✅ customers with totalAppointmentCount
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }, 'Customers retrieved successfully');

  } catch (error) {
    console.error('Get customers error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get customer status counts for dashboard
const getCustomersStatusCount = async (req, res) => {
  try {
    const { userId } = req.query;

    // Build where clause
    const where = {};
    if (userId) {
      where.userId = userId;
    }

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
      risk: 0,
      lost: 0,
      recovered: 0,
      new: 0
    };

    // Get status for each customer from CustomerUser table
    for (const customer of allCustomers) {
      const customerUserStatus = await prisma.customerUser.findFirst({
        where: {
          customerId: customer.id,
          userId: customer.userId
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
        risk: {
          count: statusCounts.risk,
          percentage: total > 0 ? ((statusCounts.risk / total) * 100).toFixed(1) : 0
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
    const { userId } = req.query; // Optional filter by userId

    if (!id) {
      return errorResponse(res, 'Customer ID is required', 400);
    }

    // Build where clause
    const where = { id };
    if (userId) {
      where.userId = userId;
    }

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
  getCustomersStatusCount,
  getCustomerById
};
