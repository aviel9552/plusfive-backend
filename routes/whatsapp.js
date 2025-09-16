const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../lib/utils');
const WhatsAppService = require('../services/WhatsAppService');
const RiskService = require('../services/Whatsapp/RiskService');
const LostService = require('../services/Whatsapp/LostService');
const ReviewService = require('../services/Whatsapp/ReviewService');

const whatsappService = new WhatsAppService();
const riskService = new RiskService();
const lostService = new LostService();
const reviewService = new ReviewService();

// Clear all conversation states (no auth required for testing)
router.delete('/debug/clear-all-conversations', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const result = await prisma.conversationState.deleteMany({});
    
    
    return res.json({
      success: true,
      message: `Cleared ${result.count} conversation states`,
      clearedCount: result.count
    });
  } catch (error) {
    console.error('Debug clear all conversations error:', error);
    return res.status(500).json({ error: 'Failed to clear conversation states' });
  }
});

// Debug route (no auth required)
router.get('/debug/conversations', async (req, res) => {
  try {
    const riskActiveConversations = riskService.getAllActiveConversations();
    const lostActiveConversations = lostService.getAllActiveConversations();
    const reviewActiveConversations = reviewService.getAllActiveConversations();
    
    const allRiskStates = {};
    const allLostStates = {};
    const allReviewStates = {};
    
    // Get all risk conversation states (for debugging)
    for (const [phone, state] of riskService.conversationStates.entries()) {
      allRiskStates[phone] = state;
    }
    
    // Get all lost conversation states (for debugging)
    for (const [phone, state] of lostService.conversationStates.entries()) {
      allLostStates[phone] = state;
    }
    
    // Get all review conversation states (for debugging)
    for (const [phone, state] of reviewService.conversationStates.entries()) {
      allReviewStates[phone] = state;
    }
    
    return res.json({
      success: true,
      summary: {
        totalActiveRiskConversations: riskActiveConversations.length,
        totalActiveLostConversations: lostActiveConversations.length,
        totalActiveReviewConversations: reviewActiveConversations.length,
        totalActiveConversations: riskActiveConversations.length + lostActiveConversations.length + reviewActiveConversations.length
      },
      risk: {
        activeConversations: riskActiveConversations,
        allConversationStates: allRiskStates,
        debug: {
          mapSize: riskService.conversationStates.size,
          mapKeys: Array.from(riskService.conversationStates.keys())
        }
      },
      lost: {
        activeConversations: lostActiveConversations,
        allConversationStates: allLostStates,
        debug: {
          mapSize: lostService.conversationStates.size,
          mapKeys: Array.from(lostService.conversationStates.keys())
        }
      },
      review: {
        activeConversations: reviewActiveConversations,
        allConversationStates: allReviewStates,
        debug: {
          mapSize: reviewService.conversationStates.size,
          mapKeys: Array.from(reviewService.conversationStates.keys())
        }
      }
    });
  } catch (error) {
    console.error('Debug conversations error:', error);
    return res.status(500).json({ error: 'Failed to get debug info' });
  }
});

// Send rating request by customer ID (no auth required for testing)
router.post('/review/send-rating', async (req, res) => {
  try {
    const { customerId } = req.body;
    
    if (!customerId) {
      return errorResponse(res, 'Missing required field: customerId', 400);
    }

    // Fetch customer details from database
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            businessName: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            whatsappNumber: true
          }
        }
      }
    });
    
    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }
    
    if (!customer.user) {
      return errorResponse(res, 'Business owner information not found for this customer', 404);
    }
    
    // Determine if this is a new or regular customer based on appointmentCount
    const isNewCustomer = customer.appointmentCount <= 1;
    
    let result;
    if (isNewCustomer) {
      // Send new customer rating request
      result = await reviewService.sendNewCustomerRatingRequest(
        customer.customerFullName,
        customer.user.businessName,
        customer.customerPhone
      );
    } else {
      // Send regular customer rating request (randomly choose v1 or v2)
      const useV1 = Math.random() < 0.5;
      if (useV1) {
        result = await reviewService.sendRegularCustomerRatingRequest1(
          customer.customerFullName,
          customer.user.businessName,
          customer.customerPhone
        );
      } else {
        result = await reviewService.sendRegularCustomerRatingRequest2(
          customer.customerFullName,
          customer.user.businessName,
          customer.customerPhone
        );
      }
    }
    
    // Store in database for tracking (using placeholder rating until customer responds)
    const reviewRecord = await prisma.review.create({
      data: {
        customerId: customer.id,
        userId: customer.userId,
        rating: 0, // Placeholder - will be updated when customer responds
        message: `Rating request sent to ${isNewCustomer ? 'new' : 'regular'} customer via WhatsApp`,
        status: 'sent',
        whatsappMessageId: result.whatsappResponse?.messages?.[0]?.id || null,
        messageStatus: 'sent'
      }
    });
    
    
    return successResponse(res, {
      ...result,
      customerDetails: {
        id: customer.id,
        name: customer.customerFullName,
        phone: customer.customerPhone,
        businessName: customer.user.businessName,
        isNewCustomer: isNewCustomer,
        appointmentCount: customer.appointmentCount
      },
      reviewRecordId: reviewRecord.id,
      databaseTracking: 'Review request saved to database for tracking'
    }, `Rating request sent successfully to ${isNewCustomer ? 'new' : 'regular'} customer`);
    
  } catch (error) {
    console.error('Send rating by customer ID error:', error);
    return errorResponse(res, 'Failed to send rating request', 500);
  }
});

// All WhatsApp routes require authentication
router.use(authenticateToken);

// Test basic WhatsApp connection
router.post('/test', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.testWhatsApp(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      messageSent: result,
      testType: 'basic_connection'
    }, 'WhatsApp test message sent successfully');
    
  } catch (error) {
    console.error('WhatsApp test error:', error);
    return errorResponse(res, 'Failed to send test message', 500);
  }
});

// Send NEW customer rating request
router.post('/rating/new-customer', async (req, res) => {
  try {
    const { customerName, businessName, phoneNumber } = req.body;
    
    if (!customerName || !businessName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, businessName, phoneNumber', 400);
    }

    const result = await whatsappService.sendNewCustomerRatingRequest(customerName, businessName, phoneNumber);
    
    return successResponse(res, {
      customerName,
      businessName,
      phoneNumber,
      messageType: 'new_customer_rating_request',
      whatsappResponse: result
    }, 'New customer rating request sent successfully');
    
  } catch (error) {
    console.error('New customer rating request error:', error);
    return errorResponse(res, 'Failed to send new customer rating request', 500);
  }
});

// Send REGULAR customer rating request
router.post('/rating/regular-customer', async (req, res) => {
  try {
    const { customerName, phoneNumber, variant = 1 } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const result = await whatsappService.sendRegularCustomerRatingRequest(customerName, phoneNumber, variant);
    
    return successResponse(res, {
      customerName,
      phoneNumber,
      variant,
      messageType: 'regular_customer_rating_request',
      whatsappResponse: result
    }, `Regular customer rating request sent successfully (variant ${variant})`);
    
  } catch (error) {
    console.error('Regular customer rating request error:', error);
    return errorResponse(res, 'Failed to send regular customer rating request', 500);
  }
});

// Send HIGH rating thank you (4-5 stars)
router.post('/rating/high-thank-you', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.sendHighRatingThankYou(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      messageType: 'high_rating_thank_you',
      ratingRange: '4-5 stars',
      whatsappResponse: result
    }, 'High rating thank you message sent successfully');
    
  } catch (error) {
    console.error('High rating thank you error:', error);
    return errorResponse(res, 'Failed to send high rating thank you', 500);
  }
});

// Send LOW rating thank you (1-3 stars) 
router.post('/rating/low-thank-you', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.sendLowRatingThankYou(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      messageType: 'low_rating_thank_you', 
      ratingRange: '1-3 stars',
      whatsappResponse: result
    }, 'Low rating thank you message sent successfully');
    
  } catch (error) {
    console.error('Low rating thank you error:', error);
    return errorResponse(res, 'Failed to send low rating thank you', 500);
  }
});

// Send LOW rating alert to business owner
router.post('/rating/low-alert-business', async (req, res) => {
  try {
    const { 
      businessName, 
      customerName, 
      customerPhone, 
      customerService, 
      lastPayment, 
      rating, 
      businessOwnerPhone 
    } = req.body;
    
    if (!businessName || !customerName || !customerPhone || !rating || !businessOwnerPhone) {
      return errorResponse(res, 'Missing required fields: businessName, customerName, customerPhone, rating, businessOwnerPhone', 400);
    }

    const result = await whatsappService.sendLowRatingAlertToBusiness(
      businessName, 
      customerName, 
      customerPhone, 
      customerService || 'Not specified', 
      lastPayment || 'Not specified', 
      rating, 
      businessOwnerPhone
    );
    
    return successResponse(res, {
      businessName,
      customerName,
      customerPhone,
      rating,
      businessOwnerPhone,
      messageType: 'low_rating_business_alert',
      whatsappResponse: result
    }, 'Low rating business alert sent successfully');
    
  } catch (error) {
    console.error('Low rating business alert error:', error);
    return errorResponse(res, 'Failed to send low rating business alert', 500);
  }
});

// Send AT RISK customer message (Hebrew - Initial greeting)
router.post('/customer-status/at-risk-hebrew-initial', async (req, res) => {
  try {
    const { customerName, phoneNumber } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const result = await whatsappService.sendAtRiskMessageHebrew(customerName, phoneNumber);
    
    return successResponse(res, {
      customerName,
      phoneNumber,
      messageType: 'at_risk_hebrew_initial',
      customerStatus: 'at_risk',
      message: `היי ${customerName} מה קורה?`,
      whatsappResponse: result
    }, 'Hebrew at-risk initial message sent successfully');
    
  } catch (error) {
    console.error('Hebrew at-risk initial message error:', error);
    return errorResponse(res, 'Failed to send Hebrew at-risk initial message', 500);
  }
});

// Send AT RISK follow-up message (Hebrew)
router.post('/customer-status/at-risk-hebrew-followup', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.sendAtRiskFollowUpHebrew(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      messageType: 'at_risk_hebrew_followup',
      customerStatus: 'at_risk',
      message: 'לא ראינו אותך מלא זמן ואני רואה שלא קבעת תור עדיין, מוכן לרענון?',
      whatsappResponse: result
    }, 'Hebrew at-risk follow-up message sent successfully');
    
  } catch (error) {
    console.error('Hebrew at-risk follow-up error:', error);
    return errorResponse(res, 'Failed to send Hebrew at-risk follow-up', 500);
  }
});

// Send AT RISK YES response (Hebrew)
router.post('/customer-status/at-risk-hebrew-yes', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.sendAtRiskYesResponseHebrew(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      messageType: 'at_risk_hebrew_yes_response',
      customerStatus: 'at_risk',
      customerResponse: 'yes',
      message: 'אוקי אני אדאג שיחזרו אלייך במיידי',
      whatsappResponse: result
    }, 'Hebrew at-risk YES response sent successfully');
    
  } catch (error) {
    console.error('Hebrew at-risk YES response error:', error);
    return errorResponse(res, 'Failed to send Hebrew at-risk YES response', 500);
  }
});

// Send AT RISK NO response (Hebrew)
router.post('/customer-status/at-risk-hebrew-no', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.sendAtRiskNoResponseHebrew(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      messageType: 'at_risk_hebrew_no_response',
      customerStatus: 'at_risk',
      customerResponse: 'no',
      message: 'מה הסיבה?',
      whatsappResponse: result
    }, 'Hebrew at-risk NO response sent successfully');
    
  } catch (error) {
    console.error('Hebrew at-risk NO response error:', error);
    return errorResponse(res, 'Failed to send Hebrew at-risk NO response', 500);
  }
});

// Send AT RISK closure message (Hebrew)
router.post('/customer-status/at-risk-hebrew-closure', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.sendAtRiskClosureHebrew(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      messageType: 'at_risk_hebrew_closure',
      customerStatus: 'at_risk',
      message: 'אוקיי.. אם צריך עוד משהו אני כאן 😉',
      whatsappResponse: result
    }, 'Hebrew at-risk closure message sent successfully');
    
  } catch (error) {
    console.error('Hebrew at-risk closure error:', error);
    return errorResponse(res, 'Failed to send Hebrew at-risk closure message', 500);
  }
});

// Complete AT RISK Hebrew conversation flow (all steps)
router.post('/customer-status/at-risk-hebrew-full-flow', async (req, res) => {
  try {
    const { customerName, phoneNumber, delayBetweenMessages = 3000 } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const results = [];
    
    // Step 1: Initial greeting
    const initialResult = await whatsappService.sendAtRiskMessageHebrew(customerName, phoneNumber);
    results.push({ step: 1, type: 'initial', result: initialResult });
    
    // Step 2: Follow-up after delay
    setTimeout(async () => {
      const followupResult = await whatsappService.sendAtRiskFollowUpHebrew(phoneNumber);
      results.push({ step: 2, type: 'followup', result: followupResult });
    }, delayBetweenMessages);
    
    return successResponse(res, {
      customerName,
      phoneNumber,
      messageType: 'at_risk_hebrew_full_flow',
      customerStatus: 'at_risk',
      flowSteps: [
        '1. היי [customerName] מה קורה?',
        '2. לא ראינו אותך מלא זמן ואני רואה שלא קבעת תור עדיין, מוכן לרענון?',
        '3. [Waiting for customer response - Yes/No]',
        '4a. If YES: אוקי אני אדאג שיחזרו אלייך במיידי',
        '4b. If NO: מה הסיבה? -> אוקיי.. אם צריך עוד משהו אני כאן 😉'
      ],
      delayBetweenMessages,
      results: results
    }, 'Hebrew at-risk full conversation flow initiated successfully');
    
  } catch (error) {
    console.error('Hebrew at-risk full flow error:', error);
    return errorResponse(res, 'Failed to initiate Hebrew at-risk full flow', 500);
  }
});

// Send LOST customer message
router.post('/customer-status/lost', async (req, res) => {
  try {
    const { customerName, phoneNumber } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const result = await whatsappService.sendLostMessage(customerName, phoneNumber);
    
    return successResponse(res, {
      customerName,
      phoneNumber,
      messageType: 'lost_customer',
      customerStatus: 'lost',
      whatsappResponse: result
    }, 'Lost customer message sent successfully');
    
  } catch (error) {
    console.error('Lost customer message error:', error);
    return errorResponse(res, 'Failed to send lost customer message', 500);
  }
});

// Send RECOVERED customer notification to business owner
router.post('/customer-status/recovered', async (req, res) => {
  try {
    const { 
      businessName, 
      lastStatus, 
      customerName, 
      customerPhone, 
      futureAppointment, 
      businessOwnerPhone 
    } = req.body;
    
    if (!businessName || !lastStatus || !customerName || !customerPhone || !businessOwnerPhone) {
      return errorResponse(res, 'Missing required fields: businessName, lastStatus, customerName, customerPhone, businessOwnerPhone', 400);
    }

    const result = await whatsappService.sendRecoveredNotification(
      businessName, 
      lastStatus, 
      customerName, 
      customerPhone, 
      futureAppointment || 'Not specified', 
      businessOwnerPhone
    );
    
    return successResponse(res, {
      businessName,
      lastStatus,
      customerName,
      customerPhone,
      businessOwnerPhone,
      messageType: 'recovered_customer_notification',
      customerStatus: 'recovered',
      whatsappResponse: result
    }, 'Recovered customer notification sent successfully');
    
  } catch (error) {
    console.error('Recovered customer notification error:', error);
    return errorResponse(res, 'Failed to send recovered customer notification', 500);
  }
});

// Send recovered customer notification to business owner
router.post('/recovered/notify-business', authenticateToken, async (req, res) => {
  try {
    const { businessName, customerName, customerPhone, futureAppointment, customerService, businessOwnerPhone } = req.body;

    if (!businessName || !customerName || !customerPhone || !futureAppointment || !customerService || !businessOwnerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: businessName, customerName, customerPhone, futureAppointment, customerService, businessOwnerPhone'
      });
    }

    const whatsappService = new WhatsAppService();
    const result = await whatsappService.sendRecoveredCustomerTemplate(
      businessName,
      customerName,
      customerPhone,
      futureAppointment,
      customerService,
      businessOwnerPhone
    );

    res.json({
      success: true,
      message: 'Recovered customer notification sent successfully to business owner',
      data: {
        template: 'recovered_customer_template',
        businessName,
        customerName,
        customerPhone,
        futureAppointment,
        customerService,
        businessOwnerPhone,
        whatsappResponse: result
      }
    });

  } catch (error) {
    console.error('Error sending recovered customer notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send recovered customer notification',
      error: error.message
    });
  }
});

// Check WhatsApp number status
router.post('/check-number', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await whatsappService.checkNumberStatus(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      numberStatus: result
    }, 'WhatsApp number status checked successfully');
    
  } catch (error) {
    console.error('Check number status error:', error);
    return errorResponse(res, 'Failed to check number status', 500);
  }
});

// Send custom message (for general testing)
router.post('/send-custom', async (req, res) => {
  try {
    const { phoneNumber, message, messageType = 'custom' } = req.body;
    
    if (!phoneNumber || !message) {
      return errorResponse(res, 'Missing required fields: phoneNumber, message', 400);
    }

    const result = await whatsappService.sendMessage(phoneNumber, message, messageType);
    
    return successResponse(res, {
      phoneNumber,
      message,
      messageType,
      whatsappResponse: result
    }, 'Custom message sent successfully');
    
  } catch (error) {
    console.error('Custom message error:', error);
    return errorResponse(res, 'Failed to send custom message', 500);
  }
});

// ==================== RISK SERVICE ROUTES ====================

// Start at-risk conversation - Step 1: Initial greeting
router.post('/risk/start-conversation', async (req, res) => {
  try {
    const { customerName, phoneNumber } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const result = await riskService.sendInitialGreeting(customerName, phoneNumber);
    
    return successResponse(res, result, 'At-risk conversation started successfully');
    
  } catch (error) {
    console.error('Risk conversation start error:', error);
    return errorResponse(res, 'Failed to start at-risk conversation', 500);
  }
});

// Send follow-up message - Step 2
router.post('/risk/send-followup', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await riskService.sendFollowUpMessage(phoneNumber);
    
    return successResponse(res, result, 'Risk follow-up message sent successfully');
    
  } catch (error) {
    console.error('Risk follow-up error:', error);
    return errorResponse(res, 'Failed to send risk follow-up message', 500);
  }
});

// Send YES response - Step 3a
router.post('/risk/send-yes-response', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await riskService.sendYesResponse(phoneNumber);
    
    return successResponse(res, result, 'Risk YES response sent successfully');
    
  } catch (error) {
    console.error('Risk YES response error:', error);
    return errorResponse(res, 'Failed to send risk YES response', 500);
  }
});

// Send NO response - Step 3b
router.post('/risk/send-no-response', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await riskService.sendNoResponse(phoneNumber);
    
    return successResponse(res, result, 'Risk NO response sent successfully');
    
  } catch (error) {
    console.error('Risk NO response error:', error);
    return errorResponse(res, 'Failed to send risk NO response', 500);
  }
});

// Send closure message - Step 4
router.post('/risk/send-closure', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const result = await riskService.sendClosureMessage(phoneNumber);
    
    return successResponse(res, result, 'Risk closure message sent successfully');
    
  } catch (error) {
    console.error('Risk closure error:', error);
    return errorResponse(res, 'Failed to send risk closure message', 500);
  }
});

// Handle incoming message (simulate webhook processing)
router.post('/risk/handle-message', async (req, res) => {
  try {
    const { phoneNumber, messageContent, customerName } = req.body;
    
    if (!phoneNumber || !messageContent) {
      return errorResponse(res, 'Missing required fields: phoneNumber, messageContent', 400);
    }

    const result = await riskService.handleIncomingMessage(phoneNumber, messageContent, customerName);
    
    return successResponse(res, result, 'Risk message handled successfully');
    
  } catch (error) {
    console.error('Risk message handling error:', error);
    return errorResponse(res, 'Failed to handle risk message', 500);
  }
});

// Start at-risk conversation (API sends only initial message, webhook handles rest)
router.post('/risk/start-conversation-auto', async (req, res) => {
  try {
    const { customerName, phoneNumber } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const result = await riskService.startAtRiskConversation(customerName, phoneNumber);
    
    return successResponse(res, result, 'At-risk conversation started - webhook will handle responses automatically');
    
  } catch (error) {
    console.error('At-risk conversation error:', error);
    return errorResponse(res, 'Failed to start at-risk conversation', 500);
  }
});

// Get conversation state (for debugging)
router.get('/risk/conversation-state/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    const state = riskService.getConversationState(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      conversationState: state,
      hasActiveConversation: !!state
    }, 'Conversation state retrieved successfully');
    
  } catch (error) {
    console.error('Get conversation state error:', error);
    return errorResponse(res, 'Failed to get conversation state', 500);
  }
});

// Get all active conversations
router.get('/risk/active-conversations', async (req, res) => {
  try {
    const activeConversations = riskService.getAllActiveConversations();
    
    return successResponse(res, {
      totalActiveConversations: activeConversations.length,
      conversations: activeConversations
    }, 'Active conversations retrieved successfully');
    
  } catch (error) {
    console.error('Get active conversations error:', error);
    return errorResponse(res, 'Failed to get active conversations', 500);
  }
});

// Clear conversation state (for testing)
router.delete('/risk/conversation-state/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    const cleared = riskService.clearConversationState(phoneNumber);
    
    return successResponse(res, {
      phoneNumber,
      cleared,
      message: cleared ? 'Conversation state cleared' : 'No conversation state found'
    }, 'Conversation state clearing attempted');
    
  } catch (error) {
    console.error('Clear conversation state error:', error);
    return errorResponse(res, 'Failed to clear conversation state', 500);
  }
});

// Clear all conversation states
router.delete('/risk/all-conversation-states', async (req, res) => {
  try {
    const result = riskService.clearAllConversationStates();
    
    return successResponse(res, result, 'All conversation states cleared successfully');
    
  } catch (error) {
    console.error('Clear all conversation states error:', error);
    return errorResponse(res, 'Failed to clear all conversation states', 500);
  }
});

// ==================== LOST SERVICE ROUTES ====================

// Start lost customer conversation - Step 1: Initial greeting
router.post('/lost/start-conversation', async (req, res) => {
  try {
    const { customerName, phoneNumber } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const result = await lostService.sendInitialGreeting(customerName, phoneNumber);
    
    return successResponse(res, result, 'Lost customer conversation started successfully');
    
  } catch (error) {
    console.error('Lost conversation start error:', error);
    return errorResponse(res, 'Failed to start lost customer conversation', 500);
  }
});

// Start lost customer conversation (API sends only initial message, webhook handles rest)
router.post('/lost/start-conversation-auto', async (req, res) => {
  try {
    const { customerName, phoneNumber } = req.body;
    
    if (!customerName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, phoneNumber', 400);
    }

    const result = await lostService.startLostConversation(customerName, phoneNumber);
    
    return successResponse(res, result, 'Lost customer conversation started - webhook will handle responses automatically');
    
  } catch (error) {
    console.error('Lost customer conversation error:', error);
    return errorResponse(res, 'Failed to start lost customer conversation', 500);
  }
});

// Send lost customer follow-up message - Step 2
router.post('/lost/send-followup', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Missing required field: phoneNumber', 400);
    }

    const result = await lostService.sendFollowUpMessage(phoneNumber);
    
    return successResponse(res, result, 'Lost customer follow-up message sent successfully');
    
  } catch (error) {
    console.error('Lost follow-up message error:', error);
    return errorResponse(res, 'Failed to send lost customer follow-up message', 500);
  }
});

// Send lost customer YES response - Step 3a
router.post('/lost/send-yes-response', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Missing required field: phoneNumber', 400);
    }

    const result = await lostService.sendYesResponse(phoneNumber);
    
    return successResponse(res, result, 'Lost customer YES response sent successfully');
    
  } catch (error) {
    console.error('Lost YES response error:', error);
    return errorResponse(res, 'Failed to send lost customer YES response', 500);
  }
});

// Send lost customer NO response - Step 3b
router.post('/lost/send-no-response', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Missing required field: phoneNumber', 400);
    }

    const result = await lostService.sendNoResponse(phoneNumber);
    
    return successResponse(res, result, 'Lost customer NO response sent successfully');
    
  } catch (error) {
    console.error('Lost NO response error:', error);
    return errorResponse(res, 'Failed to send lost customer NO response', 500);
  }
});

// Send lost customer closure message - Step 4
router.post('/lost/send-closure', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Missing required field: phoneNumber', 400);
    }

    const result = await lostService.sendClosureMessage(phoneNumber);
    
    return successResponse(res, result, 'Lost customer closure message sent successfully');
    
  } catch (error) {
    console.error('Lost closure message error:', error);
    return errorResponse(res, 'Failed to send lost customer closure message', 500);
  }
});

// Handle lost customer incoming message manually
router.post('/lost/handle-message', async (req, res) => {
  try {
    const { phoneNumber, messageContent, customerName } = req.body;
    
    if (!phoneNumber || !messageContent) {
      return errorResponse(res, 'Missing required fields: phoneNumber, messageContent', 400);
    }

    const result = await lostService.handleIncomingMessage(phoneNumber, messageContent, customerName);
    
    return successResponse(res, result, 'Lost customer message handled successfully');
    
  } catch (error) {
    console.error('Lost message handling error:', error);
    return errorResponse(res, 'Failed to handle lost customer message', 500);
  }
});

// Get all active lost conversations
router.get('/lost/active-conversations', async (req, res) => {
  try {
    const activeConversations = lostService.getAllActiveConversations();
    
    return successResponse(res, {
      totalActiveConversations: activeConversations.length,
      activeConversations: activeConversations
    }, 'Active lost conversations retrieved successfully');
    
  } catch (error) {
    console.error('Get active lost conversations error:', error);
    return errorResponse(res, 'Failed to get active lost conversations', 500);
  }
});

// Clear specific lost conversation state
router.delete('/lost/clear-conversation/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    const result = lostService.clearConversationState(phoneNumber);
    
    return successResponse(res, { cleared: result }, 'Lost conversation state cleared successfully');
    
  } catch (error) {
    console.error('Clear lost conversation state error:', error);
    return errorResponse(res, 'Failed to clear lost conversation state', 500);
  }
});

// Clear all lost conversation states
router.delete('/lost/clear-all-conversations', async (req, res) => {
  try {
    const result = lostService.clearAllConversationStates();
    
    return successResponse(res, result, 'All lost conversation states cleared successfully');
    
  } catch (error) {
    console.error('Clear all lost conversation states error:', error);
    return errorResponse(res, 'Failed to clear all lost conversation states', 500);
  }
});

// ==================== REVIEW SERVICE ROUTES ====================

// Send new customer rating request
router.post('/review/send-new-customer-request', async (req, res) => {
  try {
    const { customerName, businessName, phoneNumber } = req.body;
    
    if (!customerName || !businessName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, businessName, phoneNumber', 400);
    }

    const result = await reviewService.sendNewCustomerRatingRequest(customerName, businessName, phoneNumber);
    
    return successResponse(res, result, 'New customer rating request sent successfully');
    
  } catch (error) {
    console.error('New customer rating request error:', error);
    return errorResponse(res, 'Failed to send new customer rating request', 500);
  }
});

// Send regular customer rating request - Version 1
router.post('/review/send-regular-customer-request-v1', async (req, res) => {
  try {
    const { customerName, businessName, phoneNumber } = req.body;
    
    if (!customerName || !businessName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, businessName, phoneNumber', 400);
    }

    const result = await reviewService.sendRegularCustomerRatingRequest1(customerName, businessName, phoneNumber);
    
    return successResponse(res, result, 'Regular customer rating request (v1) sent successfully');
    
  } catch (error) {
    console.error('Regular customer rating request v1 error:', error);
    return errorResponse(res, 'Failed to send regular customer rating request v1', 500);
  }
});

// Send regular customer rating request - Version 2
router.post('/review/send-regular-customer-request-v2', async (req, res) => {
  try {
    const { customerName, businessName, phoneNumber } = req.body;
    
    if (!customerName || !businessName || !phoneNumber) {
      return errorResponse(res, 'Missing required fields: customerName, businessName, phoneNumber', 400);
    }

    const result = await reviewService.sendRegularCustomerRatingRequest2(customerName, businessName, phoneNumber);
    
    return successResponse(res, result, 'Regular customer rating request (v2) sent successfully');
    
  } catch (error) {
    console.error('Regular customer rating request v2 error:', error);
    return errorResponse(res, 'Failed to send regular customer rating request v2', 500);
  }
});

// Send high rating thank you (4-5 stars)
router.post('/review/send-high-rating-thank-you', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Missing required field: phoneNumber', 400);
    }

    const result = await reviewService.sendHighRatingThankYou(phoneNumber);
    
    return successResponse(res, result, 'High rating thank you sent successfully');
    
  } catch (error) {
    console.error('High rating thank you error:', error);
    return errorResponse(res, 'Failed to send high rating thank you', 500);
  }
});

// Send low rating thank you (1-3 stars)
router.post('/review/send-low-rating-thank-you', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return errorResponse(res, 'Missing required field: phoneNumber', 400);
    }

    const result = await reviewService.sendLowRatingThankYou(phoneNumber);
    
    return successResponse(res, result, 'Low rating thank you sent successfully');
    
  } catch (error) {
    console.error('Low rating thank you error:', error);
    return errorResponse(res, 'Failed to send low rating thank you', 500);
  }
});

// Send business owner alert for low rating
router.post('/review/send-business-alert', async (req, res) => {
  try {
    const { businessOwnerPhone, businessName, customerName, customerPhone, serviceDetails, lastPayment, rating } = req.body;
    
    if (!businessOwnerPhone || !businessName || !customerName || !customerPhone || !rating) {
      return errorResponse(res, 'Missing required fields: businessOwnerPhone, businessName, customerName, customerPhone, rating', 400);
    }

    const result = await reviewService.sendBusinessOwnerAlert(
      businessOwnerPhone, 
      businessName, 
      customerName, 
      customerPhone, 
      serviceDetails || 'Service details not provided', 
      lastPayment || 'Payment amount not provided', 
      rating
    );
    
    return successResponse(res, result, 'Business owner alert sent successfully');
    
  } catch (error) {
    console.error('Business owner alert error:', error);
    return errorResponse(res, 'Failed to send business owner alert', 500);
  }
});

// Handle review incoming message manually
router.post('/review/handle-message', async (req, res) => {
  try {
    const { phoneNumber, messageContent, customerName, businessName, serviceDetails, lastPayment, businessOwnerPhone } = req.body;
    
    if (!phoneNumber || !messageContent) {
      return errorResponse(res, 'Missing required fields: phoneNumber, messageContent', 400);
    }

    const result = await reviewService.handleIncomingMessage(
      phoneNumber, 
      messageContent, 
      customerName, 
      businessName, 
      serviceDetails, 
      lastPayment, 
      businessOwnerPhone
    );
    
    return successResponse(res, result, 'Review message handled successfully');
    
  } catch (error) {
    console.error('Review message handling error:', error);
    return errorResponse(res, 'Failed to handle review message', 500);
  }
});

// Test rating extraction
router.post('/review/test-rating-extraction', async (req, res) => {
  try {
    const { messageContent } = req.body;
    
    if (!messageContent) {
      return errorResponse(res, 'Missing required field: messageContent', 400);
    }

    const rating = reviewService.extractRating(messageContent);
    
    return successResponse(res, {
      messageContent,
      extractedRating: rating,
      isValidRating: rating !== null && rating >= 1 && rating <= 5
    }, 'Rating extraction test completed');
    
  } catch (error) {
    console.error('Rating extraction test error:', error);
    return errorResponse(res, 'Failed to test rating extraction', 500);
  }
});

// Get all active review conversations
router.get('/review/active-conversations', async (req, res) => {
  try {
    const activeConversations = reviewService.getAllActiveConversations();
    
    return successResponse(res, {
      totalActiveConversations: activeConversations.length,
      activeConversations: activeConversations
    }, 'Active review conversations retrieved successfully');
    
  } catch (error) {
    console.error('Get active review conversations error:', error);
    return errorResponse(res, 'Failed to get active review conversations', 500);
  }
});

// Clear specific review conversation state
router.delete('/review/clear-conversation/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    const result = reviewService.clearConversationState(phoneNumber);
    
    return successResponse(res, { cleared: result }, 'Review conversation state cleared successfully');
    
  } catch (error) {
    console.error('Clear review conversation state error:', error);
    return errorResponse(res, 'Failed to clear review conversation state', 500);
  }
});

// Clear all review conversation states
router.delete('/review/clear-all-conversations', async (req, res) => {
  try {
    const result = reviewService.clearAllConversationStates();
    
    return successResponse(res, result, 'All review conversation states cleared successfully');
    
  } catch (error) {
    console.error('Clear all review conversation states error:', error);
    return errorResponse(res, 'Failed to clear all review conversation states', 500);
  }
});

module.exports = router;
