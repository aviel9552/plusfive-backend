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
    
    // Check if business exists in User table
    let existingUser = null;
    if (webhookData.BusinessName) {
      existingUser = await prisma.user.findFirst({
        where: {
          businessName: webhookData.BusinessName
        },
        select: {
          id: true,
          businessName: true
        }
      });
    }
    
    let userId;
    
    // If business doesn't exist, create new user
    if (!existingUser) {
      const newUser = await prisma.user.create({
        data: {
          businessName: webhookData.BusinessName || null,
          role: 'user', // Default role for business
          isActive: true
        }
      });
      userId = newUser.id;
      console.log('New business user created:', newUser.id);
    } else {
      userId = existingUser.id;
      console.log('Existing business user found:', existingUser.id);
    }
    
         // Helper function to parse date safely
     const parseDateSafely = (dateString) => {
       if (!dateString) return null;
       
       try {
         // Handle format: "12/08/2025 19:30"
         const [datePart, timePart] = dateString.split(' ');
         const [day, month, year] = datePart.split('/');
         
         // Create date in format: YYYY-MM-DD HH:MM:SS
         const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart || '00:00'}:00`;
         
         const parsedDate = new Date(formattedDate);
         
         // Check if date is valid
         if (isNaN(parsedDate.getTime())) {
           console.log('Invalid date format:', dateString);
           return null;
         }
         
         return parsedDate;
       } catch (error) {
         console.log('Date parsing error:', error, 'for date:', dateString);
         return null;
       }
     };
     
     // Now add customer data to Customers table with user reference
     const customerData = {
       firstName: webhookData.CustomerFullName ? webhookData.CustomerFullName.split(' ')[0] : null,
       lastName: webhookData.CustomerFullName ? webhookData.CustomerFullName.split(' ').slice(1).join(' ') : null,
       customerPhone: webhookData.CustomerPhone || null,
       appointmentCount: webhookData.AppointmentCount || 0,
       customerFullName: webhookData.CustomerFullName || null,
       selectedServices: webhookData.SelectedServices || null,
       endDate: parseDateSafely(webhookData.EndDate),
       duration: webhookData.Duration || null,
       startDate: parseDateSafely(webhookData.StartDate),
       businessId: webhookData.BusinessId || null,
       userId: userId // Reference to User table
     };
    
    const newCustomer = await prisma.customers.create({
      data: customerData
    });
    
    console.log('New customer created:', newCustomer.id);
    
    // Log the webhook data
    console.log('Appointment webhook received:', {
      id: webhookLog.id,
      data: webhookData,
      userId: userId,
      customerId: newCustomer.id
    });
    
    return successResponse(res, {
      webhookId: webhookLog.id,
      userId: userId,
      customerId: newCustomer.id,
      message: 'Appointment webhook processed and customer created successfully',
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
