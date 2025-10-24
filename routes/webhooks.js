const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  handleAppointmentWebhook,
  handleRatingWebhook,
  handlePaymentCheckoutWebhook,
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus,
  handleWhatsAppIncomingMessage,
  verifyWhatsAppWebhook
} = require('../controllers/webhookController');

// Webhook endpoints (no authentication required)
router.post('/appointment', handleAppointmentWebhook);
router.post('/rating', handleRatingWebhook);
router.post('/payment-checkout', handlePaymentCheckoutWebhook);

// WhatsApp webhook endpoints
router.get('/whatsapp', verifyWhatsAppWebhook);  // For webhook verification
router.post('/whatsapp', handleWhatsAppIncomingMessage);  // For incoming messages

// Admin endpoints (authentication required)
router.get('/logs', authenticateToken, getAllWebhookLogs);
router.get('/logs/:id', authenticateToken, getWebhookLogById);
router.patch('/logs/:id/status', authenticateToken, updateWebhookLogStatus);

module.exports = router;
