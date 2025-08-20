const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Helper function to format Israeli phone numbers
const formatIsraeliPhone = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove any existing country code or special characters
  let cleanPhone = phoneNumber.toString().replace(/[\s\-\(\)\+]/g, '');
  
  // If phone already starts with 972, just add +
  if (cleanPhone.startsWith('972')) {
    return `+${cleanPhone}`;
  }
  
  // If phone starts with 0, remove it and add +972
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }
  
  // Add Israel country code +972
  return `+972${cleanPhone}`;
};

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
      const formattedPhone = formatIsraeliPhone(webhookData.CustomerPhone);
      console.log('📞 Phone number formatting:', {
        original: webhookData.CustomerPhone,
        formatted: formattedPhone
      });
      const newCustomer = await prisma.customers.create({
        data: {
          firstName: webhookData.CustomerFullName ? webhookData.CustomerFullName.split(' ')[0] : null,
          lastName: webhookData.CustomerFullName ? webhookData.CustomerFullName.split(' ').slice(1).join(' ') : null,
          customerPhone: formattedPhone,
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
     const formattedPhoneForAppointment = formatIsraeliPhone(webhookData.CustomerPhone);
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
       customerPhone: formattedPhoneForAppointment,
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



// Handle incoming WhatsApp messages from 360dialog
const handleWhatsAppIncomingMessage = async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Import services for handling different conversation types
    const RiskService = require('../services/Whatsapp/RiskService');
    const LostService = require('../services/Whatsapp/LostService');
    const ReviewService = require('../services/Whatsapp/ReviewService');
    const { PrismaClient } = require('@prisma/client');
    const riskService = new RiskService();
    const lostService = new LostService();
    const reviewService = new ReviewService();
    const prisma = new PrismaClient();
    
    // Log the complete webhook payload for debugging
    console.log('📩 WhatsApp Incoming Webhook:', JSON.stringify(webhookData, null, 2));
    
    // Check if it's a message webhook
    if (webhookData.entry && webhookData.entry.length > 0) {
      const entry = webhookData.entry[0];
      const changes = entry.changes;
      
      if (changes && changes.length > 0) {
        const change = changes[0];
        const value = change.value;
        
        // Check for incoming messages
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            const from = message.from; // Sender's phone number
            const messageId = message.id;
            const timestamp = message.timestamp;
            
            // Extract message content based on type
            let messageContent = '';
            let messageType = message.type;
            
            switch (messageType) {
              case 'text':
                messageContent = message.text.body;
                break;
              case 'button':
                messageContent = message.button.text;
                break;
              case 'interactive':
                if (message.interactive.type === 'button_reply') {
                  // For rating buttons, use the button ID (e.g., rating_5) for easier processing
                  const buttonId = message.interactive.button_reply.id;
                  const buttonTitle = message.interactive.button_reply.title;
                  messageContent = buttonId.startsWith('rating_') ? buttonId : buttonTitle;
                } else if (message.interactive.type === 'list_reply') {
                  messageContent = message.interactive.list_reply.title;
                }
                break;
              default:
                messageContent = `Unsupported message type: ${messageType}`;
            }
            
            console.log('🔥 Processed WhatsApp Message:', {
              from: from,
              messageId: messageId,
              type: messageType,
              content: messageContent,
              timestamp: new Date(parseInt(timestamp) * 1000).toISOString()
            });
            
            // Try to find customer by phone number (try both with and without +)
            let existingCustomer = await prisma.customers.findFirst({
              where: {
                customerPhone: from
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
              }
            });
            
            // If not found, try with + prefix
            if (!existingCustomer) {
              const phoneWithPlus = `+${from}`;
              existingCustomer = await prisma.customers.findFirst({
                where: {
                  customerPhone: phoneWithPlus
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
                }
              });
              console.log('🔍 Trying with +:', phoneWithPlus);
            }
            
            if (existingCustomer) {
              console.log('✅ Customer found:', {
                customerId: existingCustomer.id,
                customerName: existingCustomer.customerFullName,
                businessOwner: existingCustomer.user?.businessName
              });
              
              // Check if message content is a rating (1-5)
              const rating = parseInt(messageContent);
              if (rating >= 1 && rating <= 5) {
                console.log('⭐ Rating detected:', rating);
                
                // Store rating in Review table
                const newReview = await prisma.review.create({
                  data: {
                    rating: rating,
                    message: `WhatsApp Rating: ${messageContent}`,
                    customerId: existingCustomer.id,
                    userId: existingCustomer.userId,
                    whatsappMessageId: messageId,
                    messageStatus: 'received'
                  }
                });
                
                console.log('💾 Rating saved to database:', newReview.id);
              }
              
              // ===== HEBREW CONVERSATION FLOWS (AT-RISK, LOST & REVIEW CUSTOMERS) =====
              // Check if this is part of a review conversation (HIGHEST PRIORITY - for ratings)
              const reviewConversationState = await reviewService.getConversationState(from);
              // Check if this is part of an at-risk conversation
              const riskConversationState = await riskService.getConversationState(from);
              // Check if this is part of a lost customer conversation
              const lostConversationState = await lostService.getConversationState(from);
              
              // Check conversation status to determine priority (but only if conversation is NOT ended)
              if (reviewConversationState && reviewConversationState.status === 'at_review' && !reviewConversationState.conversationEnded) {
                console.log('🎯 Found active review conversation for', from);
                console.log('📊 Review conversation state:', reviewConversationState);
                
                try {
                  // Get business owner info for potential alert
                  const businessOwnerPhone = existingCustomer.user?.whatsappNumber || existingCustomer.user?.phoneNumber || null;
                  
                  const reviewResult = await reviewService.handleIncomingMessage(
                    from, 
                    messageContent, 
                    existingCustomer.customerFullName,
                    existingCustomer.businessName || existingCustomer.user?.businessName,
                    existingCustomer.selectedServices || 'Service details not available',
                    'Last payment amount', // You can enhance this
                    businessOwnerPhone
                  );
                  
                  console.log('🤖 Review service response:', reviewResult);
                  
                  if (reviewResult.action !== 'no_active_conversation') {
                    console.log('✅ Review conversation step completed:', reviewResult.type || reviewResult.action);
                    
                    // Extract and save rating to database if provided
                    const rating = reviewService.extractRating(messageContent);
                    if (rating !== null) {
                      console.log(`⭐ Review rating received: ${rating}/5`);
                      
                      // Update existing review record or create new one
                      const recentReview = await prisma.review.findFirst({
                        where: { 
                          customerId: existingCustomer.id, 
                          rating: 0 // Placeholder rating
                        },
                        orderBy: { createdAt: 'desc' }
                      });
                      
                      if (recentReview) {
                        await prisma.review.update({
                          where: { id: recentReview.id },
                          data: { 
                            rating: rating,
                            message: `Customer rated ${rating}/5 via WhatsApp button`,
                            status: rating >= 4 ? 'positive' : 'needs_attention',
                            messageStatus: 'responded'
                          }
                        });
                        console.log('💾 Review rating updated in database:', recentReview.id);
                      } else {
                        // Create new review record
                        const newReview = await prisma.review.create({
                          data: {
                            customerId: existingCustomer.id,
                            userId: existingCustomer.userId,
                            rating: rating,
                            message: `Customer rated ${rating}/5 via WhatsApp button (direct response)`,
                            status: rating >= 4 ? 'positive' : 'needs_attention',
                            messageStatus: 'responded'
                          }
                        });
                        console.log('💾 New review rating saved to database:', newReview.id);
                      }
                    }
                  }
                } catch (reviewError) {
                  console.error('❌ Error handling review conversation:', reviewError);
                }
              } else if (riskConversationState && riskConversationState.status === 'at_risk' && !riskConversationState.conversationEnded) {
                console.log('🎯 Found active at-risk conversation for', from);
                console.log('📊 Risk conversation state:', riskConversationState);
                
                try {
                  const riskResult = await riskService.handleIncomingMessage(
                    from, 
                    messageContent, 
                    existingCustomer.customerFullName
                  );
                  
                  console.log('🤖 Risk service response:', riskResult);
                  
                  if (riskResult.action !== 'no_active_conversation') {
                    console.log('✅ At-risk conversation step completed:', riskResult.type || riskResult.action);
                  }
                } catch (riskError) {
                  console.error('❌ Error handling at-risk conversation:', riskError);
                }
              } else if (lostConversationState && lostConversationState.status === 'at_lost' && !lostConversationState.conversationEnded) {
                console.log('🎯 Found active lost customer conversation for', from);
                console.log('📊 Lost conversation state:', lostConversationState);
                
                try {
                  const lostResult = await lostService.handleIncomingMessage(
                    from, 
                    messageContent, 
                    existingCustomer.customerFullName
                  );
                  
                  console.log('🤖 Lost service response:', lostResult);
                  
                  if (lostResult.action !== 'no_active_conversation') {
                    console.log('✅ Lost customer conversation step completed:', lostResult.type || lostResult.action);
                  }
                } catch (lostError) {
                  console.error('❌ Error handling lost customer conversation:', lostError);
                }

              } else {
                // Check if there are ended conversations
                const hasEndedReview = reviewConversationState && reviewConversationState.conversationEnded;
                const hasEndedRisk = riskConversationState && riskConversationState.conversationEnded;
                const hasEndedLost = lostConversationState && lostConversationState.conversationEnded;
                
                if (hasEndedReview || hasEndedRisk || hasEndedLost) {
                  console.log('🏁 Message ignored - conversation already ended for', from, {
                    endedReview: hasEndedReview,
                    endedRisk: hasEndedRisk,
                    endedLost: hasEndedLost,
                    customerMessage: messageContent
                  });
                } else {
                  console.log('ℹ️ No active conversation (risk, lost or review) for', from);
                }
              }
              
              // Store the message in a general log (you can create a new table for this)
              console.log('💬 Message from customer:', {
                customer: existingCustomer.customerFullName,
                business: existingCustomer.user?.businessName,
                message: messageContent,
                type: messageType,
                hasAtRiskConversation: !!riskConversationState,
                hasLostConversation: !!lostConversationState,
                hasReviewConversation: !!reviewConversationState,
                activeConversationType: riskConversationState ? 'at-risk' : 
                                       lostConversationState ? 'lost' : 
                                       reviewConversationState ? 'review' : 'none'
              });
              
            } else {
              console.log('❌ Customer not found for phone:', from);
            }
          }
        }
        
        // Check for message status updates (delivered, read, etc.)
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            console.log('📋 Message Status Update:', {
              messageId: status.id,
              status: status.status,
              timestamp: new Date(parseInt(status.timestamp) * 1000).toISOString(),
              recipientId: status.recipient_id
            });
          }
        }
      }
    }
    
    // Always respond with 200 to acknowledge webhook
    return res.status(200).json({ message: 'Webhook received successfully' });
    
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    return res.status(500).json({ error: 'Failed to process WhatsApp webhook' });
  }
};

// Webhook verification for 360dialog (required for webhook setup)
const verifyWhatsAppWebhook = async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Verify token (you can set this in your 360dialog webhook settings)
    const VERIFY_TOKEN = 'plusfive_webhook_token_2025';
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WhatsApp Webhook verified successfully');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ WhatsApp Webhook verification failed');
      return res.status(403).json({ error: 'Verification failed' });
    }
  } catch (error) {
    console.error('❌ WhatsApp webhook verification error:', error);
    return res.status(500).json({ error: 'Verification error' });
  }
};

module.exports = {
  handleAppointmentWebhook,
  handlePaymentCheckoutWebhook,
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus,
  handleWhatsAppIncomingMessage,
  verifyWhatsAppWebhook
};
