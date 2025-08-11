const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Handle appointment webhook - store any data without validation
const handleAppointmentWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Store whatever data comes in request body
    const webhookLog = await prisma.webhookLog.create({
      data: {
        data: webhookData,
        type: 'appointment',
        status: 'pending'
      }
    });
    
    // Log the webhook data
    console.log('Appointment webhook received:', {
      id: webhookLog.id,
      data: webhookData
    });
    
    return successResponse(res, {
      webhookId: webhookLog.id,
      message: 'Appointment webhook received successfully',
      data: webhookData
    }, 'Appointment webhook processed successfully', 201);
    
  } catch (error) {
    console.error('Appointment webhook error:', error);
    return errorResponse(res, 'Failed to process appointment webhook', 500);
  }
};

// Handle payment checkout webhook - store any data without validation
const handlePaymentCheckoutWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Store whatever data comes in request body
    const webhookLog = await prisma.webhookLog.create({
      data: {
        data: webhookData,
        type: 'payment_checkout',
        status: 'pending'
      }
    });
    
    // Log the webhook data
    console.log('Payment checkout webhook received:', {
      id: webhookLog.id,
      data: webhookData
    });
    
    return successResponse(res, {
      webhookId: webhookLog.id,
      message: 'Payment checkout webhook received successfully',
      data: webhookData
    }, 'Payment checkout webhook processed successfully', 201);
    
  } catch (error) {
    console.error('Payment checkout webhook error:', error);
    return errorResponse(res, 'Failed to process payment checkout webhook', 500);
  }
};

// Get all webhook logs (admin only)
const getAllWebhookLogs = async (req, res) => {
  try {
    const { type, status, page = 1, limit = 50 } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build where clause
    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;
    
    // Get webhook logs with pagination
    const webhookLogs = await prisma.webhookLog.findMany({
      where,
      orderBy: { createdDate: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });
    
    // Get total count
    const totalCount = await prisma.webhookLog.count({ where });
    
    return successResponse(res, {
      webhookLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, 'Webhook logs retrieved successfully');
    
  } catch (error) {
    console.error('Get webhook logs error:', error);
    return errorResponse(res, 'Failed to retrieve webhook logs', 500);
  }
};

// Get webhook log by ID
const getWebhookLogById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const webhookLog = await prisma.webhookLog.findUnique({
      where: { id }
    });
    
    if (!webhookLog) {
      return errorResponse(res, 'Webhook log not found', 404);
    }
    
    return successResponse(res, webhookLog, 'Webhook log retrieved successfully');
    
  } catch (error) {
    console.error('Get webhook log by ID error:', error);
    return errorResponse(res, 'Failed to retrieve webhook log', 500);
  }
};

// Update webhook log status
const updateWebhookLogStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['pending', 'processed', 'failed'].includes(status)) {
      return errorResponse(res, 'Invalid status. Must be pending, processed, or failed', 400);
    }
    
    const updatedWebhookLog = await prisma.webhookLog.update({
      where: { id },
      data: { status }
    });
    
    return successResponse(res, updatedWebhookLog, 'Webhook log status updated successfully');
    
  } catch (error) {
    console.error('Update webhook log status error:', error);
    return errorResponse(res, 'Failed to update webhook log status', 500);
  }
};

module.exports = {
  handleAppointmentWebhook,
  handlePaymentCheckoutWebhook,
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus
};
