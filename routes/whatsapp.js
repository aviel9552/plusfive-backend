const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../lib/utils');
const WhatsAppService = require('../services/WhatsAppService');

const whatsappService = new WhatsAppService();

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

// Debug route (no auth required) - Note: Conversation state debugging removed (now handled by N8N)
router.get('/debug/conversations', async (req, res) => {
  return res.json({
    success: true,
    summary: {
      totalActiveConversations: 0,
      note: 'Conversation flows are now handled by N8N'
    }
  });
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

// ==================== RATING & MESSAGING ROUTES REMOVED ====================
// Note: All WhatsApp message sending (ratings, at-risk, lost, etc.) now handled by N8N only

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

// ==================== RISK & LOST SERVICE ROUTES REMOVED ====================
// Note: RiskService and LostService have been removed - conversation flows are now handled by N8N only

module.exports = router;
