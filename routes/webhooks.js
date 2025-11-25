const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const {
  handleAppointmentWebhook,
  handleRatingWebhook,
  handlePaymentCheckoutWebhook,
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus,
  handleWhatsAppIncomingMessage,
  verifyWhatsAppWebhook,
  getAllPaymentWebhooks,
  getPaymentWebhookById,
  getPaymentWebhooksByCustomerId,
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByCustomerId,
  createWhatsappMessageWithValidation
} = require('../controllers/webhookController');

// Webhook endpoints (no authentication required)
// Note: Subscription checks are implemented in controllers - these endpoints will reject requests if user doesn't have active subscription
// Controllers handle subscription validation by finding user from business/customer data (no authentication required)
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

// Payment webhooks endpoints (authentication required)
router.get('/payment-webhooks', authenticateToken, getAllPaymentWebhooks);
router.get('/payment-webhooks/:id', authenticateToken, getPaymentWebhookById);
router.get('/payment-webhooks/customer/:customerId', authenticateToken, getPaymentWebhooksByCustomerId);

// Appointment endpoints (authentication required)
router.get('/appointments', authenticateToken, getAllAppointments);
router.get('/appointments/:id', authenticateToken, getAppointmentById);
router.get('/appointments/customer/:customerId', authenticateToken, getAppointmentsByCustomerId);

// WhatsApp message endpoint (authentication required) - Store with validation - requires subscription (checked in controller)
router.post('/whatsapp-message', authenticateToken, createWhatsappMessageWithValidation);

module.exports = router;
