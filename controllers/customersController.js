const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const CustomerStatusService = require('../services/CustomerStatusService');

// Initialize CustomerStatusService
const customerStatusService = new CustomerStatusService();

// Get all customers with search (no pagination - frontend will handle) - OPTIMIZED
const getAllCustomers = async (req, res) => {
  try {
    const { search, businessId } = req.query;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Build search conditions for the SQL query
    let searchConditions = '';
    let queryParams = [authenticatedUserId];
    let paramIndex = 2;

    if (search) {
      searchConditions = `
        AND (
          c."firstName" ILIKE $${paramIndex} OR 
          c."lastName" ILIKE $${paramIndex} OR 
          c."customerFullName" ILIKE $${paramIndex} OR 
          c."customerPhone" ILIKE $${paramIndex} OR 
          c."selectedServices" ILIKE $${paramIndex}
        )
      `;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (businessId) {
      searchConditions += ` AND c."businessId" = $${paramIndex}`;
      queryParams.push(parseInt(businessId));
      paramIndex++;
    }

    // Single optimized query to get all customer data with aggregations
    const customersQuery = `
      SELECT 
        c.*,
        u."businessName" as "userBusinessName",
        u."businessType" as "userBusinessType",
        COALESCE(cu.status, 'active') as "customerStatus",
        COALESCE(appointment_counts.total, 0) as "totalAppointments",
        COALESCE(payment_data.total_paid, 0) as "totalPaidAmount",
        COALESCE(payment_data.last_payment_amount, 0) as "lastPaymentAmount",
        payment_data.last_payment_date as "lastPaymentDate",
        COALESCE(payment_data.payment_count, 0) as "paymentCount",
        COALESCE(review_stats.total_reviews, 0) as "totalReviews",
        COALESCE(review_stats.avg_rating, 0) as "averageRating",
        COALESCE(review_stats.min_rating, 0) as "minRating",
        COALESCE(review_stats.max_rating, 0) as "maxRating",
        review_stats.last_rating as "lastRating"
      FROM "customers" c
      LEFT JOIN "users" u ON c."userId" = u.id
      LEFT JOIN "customer_users" cu ON c.id = cu."customerId" 
        AND cu."userId" = c."userId" 
        AND cu."isDeleted" = false
      LEFT JOIN (
        SELECT 
          "customerId", 
          COUNT(*) as total
        FROM "appointments" 
        GROUP BY "customerId"
      ) appointment_counts ON c.id = appointment_counts."customerId"
      LEFT JOIN (
        SELECT 
          pw."customerId",
          SUM(pw.total) as total_paid,
          (SELECT pw2.total 
           FROM "payment_webhooks" pw2 
           WHERE pw2."customerId" = pw."customerId" 
           AND pw2.status = 'success'
           ORDER BY pw2."paymentDate" DESC, pw2."createdAt" DESC
           LIMIT 1) as last_payment_amount,
          MAX(pw."paymentDate") as last_payment_date,
          COUNT(*) as payment_count
        FROM "payment_webhooks" pw
        WHERE pw.status = 'success'
        GROUP BY pw."customerId"
      ) payment_data ON c.id = payment_data."customerId"
      LEFT JOIN (
        SELECT 
          "customerId",
          COUNT(*) as total_reviews,
          AVG(rating) as avg_rating,
          MIN(rating) as min_rating,
          MAX(rating) as max_rating,
          (SELECT rating FROM "reviews" r2 WHERE r2."customerId" = r."customerId" AND r2.status != 'sent' ORDER BY r2."createdAt" DESC LIMIT 1) as last_rating
        FROM "reviews" r
        WHERE status != 'sent'
        GROUP BY "customerId"
      ) review_stats ON c.id = review_stats."customerId"
      WHERE c."userId" = $1
      ${searchConditions}
      ORDER BY c."createdAt" DESC
    `;

    const customersData = await prisma.$queryRawUnsafe(customersQuery, ...queryParams);

    // Process the results - all data already fetched in single query
    const customersWithTotalCount = customersData.map((customer) => {
      return {
        // Basic customer data
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        customerPhone: customer.customerPhone,
        appointmentCount: customer.appointmentCount,
        customerFullName: customer.customerFullName,
        selectedServices: customer.selectedServices,
        endDate: customer.endDate,
        duration: customer.duration,
        startDate: customer.startDate,
        businessId: customer.businessId,
        employeeId: customer.employeeId,
        businessName: customer.businessName,
        profileImage: customer.profileImage,
        coverImage: customer.coverImage,
        documentImage: customer.documentImage,
        userId: customer.userId,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        
        // User data
        user: {
          id: customer.userId,
          businessName: customer.userBusinessName,
          businessType: customer.userBusinessType
        },
        
        // Aggregated data from joins
        totalAppointmentCount: Number(customer.totalAppointments),
        customerStatus: customer.customerStatus,
        lastRating: Number(customer.lastRating) || 0,
        lastVisit: customer.lastPaymentDate,
        
        // Payment data
        totalPaidAmount: Number(customer.totalPaidAmount),
        lastPaymentAmount: Number(customer.lastPaymentAmount),
        lastPaymentDate: customer.lastPaymentDate,
        paymentCount: Number(customer.paymentCount),
        
        // Review statistics
        reviews: [], // Empty array since we have aggregated stats
        reviewStatistics: {
          totalReviews: Number(customer.totalReviews),
          averageRating: customer.averageRating ? parseFloat(Number(customer.averageRating).toFixed(2)) : 0,
          minRating: Number(customer.minRating),
          maxRating: Number(customer.maxRating),
          lastRating: Number(customer.lastRating) || 0
        }
      };
    });

    // Get total count for reference
    const total = customersData.length;

    return successResponse(res, {
      customers: customersWithTotalCount,  // ✅ customers with totalAppointmentCount and payment data
      total: total // Total count for frontend reference
    }, 'Customers retrieved successfully');

  } catch (error) {
    console.error('Get customers error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get ten customers without pagination - OPTIMIZED
const getTenCustomers = async (req, res) => {
  try {
    const { businessId } = req.query;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Build search conditions for the SQL query
    let searchConditions = '';
    let queryParams = [authenticatedUserId];
    let paramIndex = 2;

    if (businessId) {
      searchConditions += ` AND c."businessId" = $${paramIndex}`;
      queryParams.push(parseInt(businessId));
      paramIndex++;
    }

    // Single optimized query to get top 10 customers with all data
    const customersQuery = `
      SELECT 
        c.*,
        u."businessName" as "userBusinessName",
        u."businessType" as "userBusinessType",
        COALESCE(cu.status, 'active') as "customerStatus",
        COALESCE(appointment_counts.total, 0) as "totalAppointments",
        COALESCE(payment_data.total_paid, 0) as "totalPaidAmount",
        COALESCE(payment_data.last_payment_amount, 0) as "lastPaymentAmount",
        payment_data.last_payment_date as "lastPaymentDate",
        COALESCE(payment_data.payment_count, 0) as "paymentCount",
        COALESCE(review_stats.total_reviews, 0) as "totalReviews",
        COALESCE(review_stats.avg_rating, 0) as "averageRating",
        COALESCE(review_stats.min_rating, 0) as "minRating",
        COALESCE(review_stats.max_rating, 0) as "maxRating",
        review_stats.last_rating as "lastRating"
      FROM "customers" c
      LEFT JOIN "users" u ON c."userId" = u.id
      LEFT JOIN "customer_users" cu ON c.id = cu."customerId" 
        AND cu."userId" = c."userId" 
        AND cu."isDeleted" = false
      LEFT JOIN (
        SELECT 
          "customerId", 
          COUNT(*) as total
        FROM "appointments" 
        GROUP BY "customerId"
      ) appointment_counts ON c.id = appointment_counts."customerId"
      LEFT JOIN (
        SELECT 
          pw."customerId",
          SUM(pw.total) as total_paid,
          (SELECT pw2.total 
           FROM "payment_webhooks" pw2 
           WHERE pw2."customerId" = pw."customerId" 
           AND pw2.status = 'success'
           ORDER BY pw2."paymentDate" DESC, pw2."createdAt" DESC
           LIMIT 1) as last_payment_amount,
          MAX(pw."paymentDate") as last_payment_date,
          COUNT(*) as payment_count
        FROM "payment_webhooks" pw
        WHERE pw.status = 'success'
        GROUP BY pw."customerId"
      ) payment_data ON c.id = payment_data."customerId"
      LEFT JOIN (
        SELECT 
          "customerId",
          COUNT(*) as total_reviews,
          AVG(rating) as avg_rating,
          MIN(rating) as min_rating,
          MAX(rating) as max_rating,
          (SELECT rating FROM "reviews" r2 WHERE r2."customerId" = r."customerId" AND r2.status != 'sent' ORDER BY r2."createdAt" DESC LIMIT 1) as last_rating
        FROM "reviews" r
        WHERE status != 'sent'
        GROUP BY "customerId"
      ) review_stats ON c.id = review_stats."customerId"
      WHERE c."userId" = $1
      ${searchConditions}
      ORDER BY c."createdAt" DESC
      LIMIT 10
    `;

    const customersData = await prisma.$queryRawUnsafe(customersQuery, ...queryParams);

    // Get total count for reference
    const totalCountQuery = `
      SELECT COUNT(*) as total
      FROM "customers" c
      WHERE c."userId" = $1
      ${searchConditions}
    `;

    const totalCountResult = await prisma.$queryRawUnsafe(totalCountQuery, ...queryParams);
    const totalCustomersCount = Number(totalCountResult[0]?.total) || 0;

    // Process the results - all data already fetched in single query
    const customersWithTotalCount = customersData.map((customer) => {
      return {
        // Basic customer data
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        customerPhone: customer.customerPhone,
        appointmentCount: customer.appointmentCount,
        customerFullName: customer.customerFullName,
        selectedServices: customer.selectedServices,
        endDate: customer.endDate,
        duration: customer.duration,
        startDate: customer.startDate,
        businessId: customer.businessId,
        employeeId: customer.employeeId,
        businessName: customer.businessName,
        profileImage: customer.profileImage,
        coverImage: customer.coverImage,
        documentImage: customer.documentImage,
        userId: customer.userId,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        
        // User data
        user: {
          id: customer.userId,
          businessName: customer.userBusinessName,
          businessType: customer.userBusinessType
        },
        
        // Aggregated data from joins
        totalAppointmentCount: Number(customer.totalAppointments),
        customerStatus: customer.customerStatus,
        lastRating: Number(customer.lastRating) || 0,
        lastVisit: customer.lastPaymentDate,
        
        // Payment data
        totalPaidAmount: Number(customer.totalPaidAmount),
        lastPaymentAmount: Number(customer.lastPaymentAmount),
        lastPaymentDate: customer.lastPaymentDate,
        paymentCount: Number(customer.paymentCount),
        
        // Review statistics
        reviews: [], // Empty array since we have aggregated stats
        reviewStatistics: {
          totalReviews: Number(customer.totalReviews),
          averageRating: customer.averageRating ? parseFloat(Number(customer.averageRating).toFixed(2)) : 0,
          minRating: Number(customer.minRating),
          maxRating: Number(customer.maxRating),
          lastRating: Number(customer.lastRating) || 0
        }
      };
    });

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

// Get customer status counts for dashboard - OPTIMIZED
const getCustomersStatusCount = async (req, res) => {
  try {
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Single optimized query to get status counts
    const statusCountsQuery = `
      SELECT 
        COALESCE(cu.status, 'active') as status,
        COUNT(*) as count
      FROM "customers" c
      LEFT JOIN "customer_users" cu ON c.id = cu."customerId" 
        AND cu."userId" = $1 
        AND cu."isDeleted" = false
      WHERE c."userId" = $1
      GROUP BY COALESCE(cu.status, 'active')
      ORDER BY status
    `;

    const statusResults = await prisma.$queryRawUnsafe(statusCountsQuery, authenticatedUserId);

    // Initialize counters
    const statusCounts = {
      active: 0,
      at_risk: 0,
      lost: 0,
      recovered: 0,
      new: 0
    };

    // Process results
    let total = 0;
    for (const result of statusResults) {
      const status = result.status;
      const count = Number(result.count);
      total += count;
      
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status] = count;
      }
    }

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

    // Get ALL appointments for this customer
    const appointments = await prisma.appointment.findMany({
      where: {
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      orderBy: { createdAt: 'desc' }
      // Removed take: 10 to get all appointments
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
        // userId: customer.userId // Match with business owner
      },
      orderBy: { updatedAt: 'desc' }, // Latest updated appointment
      select: {
        updatedAt: true,
        startDate: true,
        endDate: true,
        selectedServices: true
      }
    });

    // Get ALL payment webhooks for this customer
    const paymentHistory = await prisma.paymentWebhook.findMany({
      where: {
        customerId: customer.id,
        // userId: customer.userId
      },
      orderBy: { createdAt: 'desc' }
      // Removed take: 10 to get all records
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
