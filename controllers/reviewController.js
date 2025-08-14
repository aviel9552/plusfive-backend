const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const WhatsAppService = require('../services/WhatsAppService');

// Initialize WhatsApp service
const whatsappService = new WhatsAppService();

// Send simple WhatsApp text message
const sendText = async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    // Validate required fields
    if (!phoneNumber || !message) {
      return errorResponse(res, 'Missing required fields: phoneNumber, message', 400);
    }

    // Send WhatsApp message
    const messageSent = await whatsappService.sendMessage(phoneNumber, message, 'text_message');
    
    if (messageSent) {
      return successResponse(res, {
        phoneNumber: phoneNumber,
        message: message,
        status: 'sent',
        message: 'WhatsApp message sent successfully'
      }, 'WhatsApp message sent successfully', 200);
    } else {
      return errorResponse(res, 'Failed to send WhatsApp message', 500);
    }

  } catch (error) {
    console.error('Send text message error:', error);
    return errorResponse(res, 'Failed to send WhatsApp message', 500);
  }
};

module.exports = {
  sendText
};
