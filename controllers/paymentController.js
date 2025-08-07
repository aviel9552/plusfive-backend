const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Get all payments
const getAllPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const orderId = req.query.orderId;
    
    const skip = (page - 1) * limit;
    
    const where = {
      userId: req.user.userId,
      ...(status && { status }),
      ...(orderId && { orderId })
    };
    
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              amount: true,
              currency: true,
              description: true,
              status: true
            }
          }
        }
      }),
      prisma.payment.count({ where })
    ]);
    
    return successResponse(res, {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get payments error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Create new payment
const createPayment = async (req, res) => {
  try {
    // Check if order exists and belongs to user
    const order = await prisma.order.findFirst({
      where: {
        id: req.body.orderId,
        userId: req.user.userId
      }
    });
    
    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }
    
    // Create payment
    const payment = await prisma.payment.create({
      data: {
        orderId: req.body.orderId,
        userId: req.user.userId,
        amount: req.body.amount,
        currency: req.body.currency,
        paymentMethod: req.body.paymentMethod,
        transactionId: req.body.transactionId,
        metadata: req.body.metadata,
      },
      include: {
        order: {
          select: {
            id: true,
            amount: true,
            currency: true,
            description: true,
            status: true
          }
        }
      }
    });
    
    return successResponse(res, payment, 'Payment created successfully');
    
  } catch (error) {
    console.error('Create payment error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  getAllPayments,
  createPayment
}; 