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
    // Check if customer exists in Customers table
    let existingCustomer = null;
    if (webhookData.EmployeeId) {
      existingCustomer = await prisma.customers.findFirst({
        where: {
          employeeId: webhookData.EmployeeId
        },
        select: {
          id: true,
          employeeId: true
        }
      });
    }
      
      let userId;
      let customerId;
    
    // If business doesn't exist, return error - User must exist first
    if (!existingUser) {
      return errorResponse(res, `Business '${webhookData.BusinessName}' does not exist. Please create user first.`, 400);
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
    // If customer doesn't exist, create new customer
    if (!existingCustomer) {
      const newCustomer = await prisma.customers.create({
        data: {
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
          employeeId: webhookData.EmployeeId || null,
          businessName: webhookData.BusinessName || null,
          userId: userId // Reference to User table
        }
      });
      customerId = newCustomer.id;
      console.log('New customer created:', newCustomer.id);
    } else {
      customerId = existingCustomer.id;
      console.log('Existing customer found:', existingCustomer.id);
    }
     
     
     // Now add appointment data to Appointment table
     const appointmentData = {
       source: webhookData.Source || null,
       endDate: parseDateSafely(webhookData.EndDate),
       duration: webhookData.Duration || null,
       startDate: parseDateSafely(webhookData.StartDate),
       businessId: webhookData.BusinessId || null,
       byCustomer: webhookData.ByCustomer || false,
       createDate: parseDateSafely(webhookData.CreateDate),
       employeeId: webhookData.EmployeeId || null,
       businessName: webhookData.BusinessName || null,
       employeeName: webhookData.EmployeeName || null,
       customerPhone: webhookData.CustomerPhone || null,
       appointmentCount: webhookData.AppointmentCount || 0,
       customerFullName: webhookData.CustomerFullName || null,
       selectedServices: webhookData.SelectedServices || null,
       customerId: customerId, // Reference to newly created customer
       userId: userId // Reference to User table
     };
     
     const newAppointment = await prisma.appointment.create({
       data: appointmentData
     });
     
           // Check if CustomerUser record already exists (customerId + userId combination)
      let existingCustomerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: customerId,
          userId: userId
        }
      });

      let customerUserId;
      
      if (existingCustomerUser) {
        // Update existing record status to 'active'
        const updatedCustomerUser = await prisma.customerUser.update({
          where: {
            id: existingCustomerUser.id
          },
          data: {
            status: 'active'
          }
        });
        customerUserId = updatedCustomerUser.id;
        console.log('Existing CustomerUser record updated:', updatedCustomerUser.id);
      } else {
        // Check if customerId exists but with different userId
        const customerWithDifferentUser = await prisma.customerUser.findFirst({
          where: {
            customerId: customerId
          }
        });

        if (customerWithDifferentUser) {
          // Customer exists with different user, create new record with status 'new'
          const newCustomerUser = await prisma.customerUser.create({
            data: {
              customerId: customerId,
              userId: userId,
              status: 'new'
            }
          });
          customerUserId = newCustomerUser.id;
          console.log('New CustomerUser record created (different user):', newCustomerUser.id);
        } else {
          // First time customer-user relation, create with status 'new'
          const newCustomerUser = await prisma.customerUser.create({
            data: {
              customerId: customerId,
              userId: userId,
              status: 'new'
            }
          });
          customerUserId = newCustomerUser.id;
          console.log('New CustomerUser record created (first time):', newCustomerUser.id);
        }
      }
    
         console.log('New customer created:', customerId);
     console.log('New appointment created:', newAppointment.id);
     console.log('New customer-user relation created:', customerUserId);
     
     // Log the webhook data
     console.log('Appointment webhook received:', {
       id: webhookLog.id,
       data: webhookData,
       userId: userId,
       customerId: customerId,
       appointmentId: newAppointment.id,
       customerUserId: customerUserId
     });
    
         return successResponse(res, {
       webhookId: webhookLog.id,
       userId: userId,
       customerId: customerId,
       appointmentId: newAppointment.id,
       customerUserId: customerUserId,
       message: 'Appointment webhook processed successfully - Customer, Appointment and Customer-User relation created',
       data: webhookData
     }, 'Appointment webhook processed successfully', 201);
    
  } catch (error) {
    console.error('Appointment webhook error:', error);
    return errorResponse(res, 'Failed to process appointment webhook', 500);
  }
};

  // Handle payment checkout webhook - store data in both WebhookPaymentLog and PaymentWebhook tables
  const handlePaymentCheckoutWebhook = async (req, res) => {
    try {
      const webhookData = req.body;
      console.log("webhookData ", webhookData);
      
      // Extract actual data from webhookData.data.data
      const actualData = webhookData.data?.data;
      console.log("Actual data from webhookData.data.data: ", actualData);
      
      if (!actualData) {
        return errorResponse(res, 'Invalid webhook data structure', 400);
      }
      
      // 1. Store in WebhookPaymentLog table (raw log data)
      const paymentLog = await prisma.webhookPaymentLog.create({
        data: {
          data: actualData,
          type: 'payment_checkout',
          createdDate: new Date()
        }
      });
      
      // 2. Find record where BusinessId AND EmployeeId both match (from Customers table)
      let userId = null;
      let customerId = null;
      
      console.log('🔍 Searching for customer with:', {
        BusinessId: actualData.BusinessId,
        EmployeeId: actualData.EmployeeId,
        Total: actualData.Total,
        TotalWithoutVAT: actualData.TotalWithoutVAT,
        TotalVAT: actualData.TotalVAT
      });
      
      if (actualData.BusinessId && actualData.EmployeeId) {
        const existingCustomer = await prisma.customers.findFirst({
          where: {
            AND: [
              { businessId: parseInt(actualData.BusinessId) },
              { employeeId: parseInt(actualData.EmployeeId) }
            ]
          },
          select: {
            id: true,
            businessId: true,
            employeeId: true,
            userId: true // select userId field as well
          }
        });
        
        if (existingCustomer) {
          // Customer found - both customerId and userId available from Customers table
          customerId = existingCustomer.id;
          userId = existingCustomer.userId; // userId field is present in Customers table
          
          console.log('✅ Customer found with both BusinessId and EmployeeId:', existingCustomer.id);
          console.log('✅ userId from Customers table:', userId);
          console.log('✅ customerId set to:', customerId);
        } else {
          console.log('❌ No customer found with both BusinessId and EmployeeId:', {
            businessId: actualData.BusinessId,
            employeeId: actualData.EmployeeId
          });
          
          // Debug: Check what's in Customers table
          const allCustomers = await prisma.customers.findMany({
            select: {
              id: true,
              businessId: true,
              employeeId: true
            }
          });
          console.log('🔍 All customers in table:', allCustomers);
        }
      } else {
        console.log('❌ Missing BusinessId or EmployeeId:', {
          businessId: actualData.BusinessId,
          employeeId: actualData.EmployeeId
        });
      }
      
      // 4. Store structured data in PaymentWebhook table with userId and customerId
      console.log('💰 Payment values to store:', {
        total: actualData.Total,
        totalWithoutVAT: actualData.TotalWithoutVAT,
        totalVAT: actualData.TotalVAT,
        parsedTotal: parseFloat(actualData.Total),
        parsedTotalWithoutVAT: parseFloat(actualData.TotalWithoutVAT),
        parsedTotalVAT: parseFloat(actualData.TotalVAT)
      });
      
      console.log('🔗 IDs for PaymentWebhook:', {
        userId: userId,
        customerId: customerId,
        businessId: actualData.BusinessId,
        employeeId: actualData.EmployeeId
      });
      
      const paymentWebhook = await prisma.paymentWebhook.create({
        data: {
          total: parseFloat(actualData.Total) || 0.00,
          totalWithoutVAT: parseFloat(actualData.TotalWithoutVAT) || 0.00,
          totalVAT: parseFloat(actualData.TotalVAT) || 0.00,
          employeeId: parseInt(actualData.EmployeeId) || null,
          businessId: parseInt(actualData.BusinessId) || null,
          customerId: customerId, // Reference to Customers table
          userId: userId, // Reference to User table
          paymentDate: new Date(),
          status: 'success'
        }
      });
      
      // Log the webhook data
      console.log('Payment checkout webhook received:', {
        logId: paymentLog.id,
        paymentId: paymentWebhook.id,
        userId: userId,
        customerId: customerId,
        data: actualData
      });
      
      return successResponse(res, {
        webhookId: paymentLog.id,
        paymentId: paymentWebhook.id,
        userId: userId,
        customerId: customerId,
        message: 'Payment checkout webhook received successfully',
        data: actualData
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
