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

    // Calculate totalAppointmentCount and get CustomerUser status for each customer
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

        return {
          ...customer,
          totalAppointmentCount: totalAppointments,
          customerStatus: customerUserStatus?.status || 'active' // Default to active if no status found
        };
      })
    );

    // Get total count for pagination
    const total = await prisma.customers.count({ where });

    return successResponse(res, {
      customers: customersWithTotalCount,  // ✅ totalAppointmentCount ke sath customers
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
