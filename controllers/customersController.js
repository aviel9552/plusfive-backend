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

    // Get total count for pagination
    const total = await prisma.customers.count({ where });

    return successResponse(res, {
      customers,
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

module.exports = {
  getAllCustomers
};
