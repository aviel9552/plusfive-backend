const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Get all orders
const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    
    const skip = (page - 1) * limit;
    
    const where = {
      userId: req.user.userId,
      ...(status && { status })
    };
    
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentMethod: true,
              createdAt: true
            }
          }
        }
      }),
      prisma.order.count({ where })
    ]);
    
    return successResponse(res, {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get orders error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Create new order
const createOrder = async (req, res) => {
  try {
    const order = await prisma.order.create({
      data: {
        userId: req.user.userId,
        amount: req.body.amount,
        currency: req.body.currency,
        description: req.body.description,
        metadata: req.body.metadata,
      },
      include: {
        payments: true
      }
    });
    
    return successResponse(res, order, 'Order created successfully');
    
  } catch (error) {
    console.error('Create order error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }
    
    return successResponse(res, order);
    
  } catch (error) {
    console.error('Get order error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Update order
const updateOrder = async (req, res) => {
  try {
    // Check if order exists and belongs to user
    const existingOrder = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });
    
    if (!existingOrder) {
      return errorResponse(res, 'Order not found', 404);
    }
    
    // Update order
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    return successResponse(res, order, 'Order updated successfully');
    
  } catch (error) {
    console.error('Update order error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Delete order
const deleteOrder = async (req, res) => {
  try {
    // Check if order exists and belongs to user
    const existingOrder = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });
    
    if (!existingOrder) {
      return errorResponse(res, 'Order not found', 404);
    }
    
    // Delete order (this will also delete related payments due to cascade)
    await prisma.order.delete({
      where: { id: req.params.id }
    });
    
    return successResponse(res, null, 'Order deleted successfully');
    
  } catch (error) {
    console.error('Delete order error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  getAllOrders,
  createOrder,
  getOrderById,
  updateOrder,
  deleteOrder
}; 