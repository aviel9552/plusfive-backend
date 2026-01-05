const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');

/**
 * IMPORTANT:
 * - Webhook endpoints must NEVER be blocked by auth/subscription middleware.
 * - Webhook handlers themselves should ALWAYS respond 200 quickly (even if user is inactive),
 *   and internally mark the event as "pending/skipped" for later replay when the user becomes active.
 *
 * This router keeps inbound webhooks public, and keeps admin/data endpoints protected.
 */

const {
  // Inbound (public) webhooks
  handleAppointmentWebhook,
  handleRatingWebhook,
  handlePaymentCheckoutWebhook,
  handleWhatsAppIncomingMessage,
  verifyWhatsAppWebhook,

  // Admin (protected)
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus,
  getAllPaymentWebhooks,
  getPaymentWebhookById,
  getPaymentWebhooksByCustomerId,
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByCustomerId,
  createWhatsappMessageWithValidation,
} = require('../controllers/webhookController');

/* -------------------- PUBLIC WEBHOOK ENDPOINTS -------------------- */
/**
 * Calmark → Plusfive
 * These MUST stay public. Do NOT add authenticateToken/checkSubscription here.
 * The controller must:
 * 1) Log inbound immediately
 * 2) Return 200 even if subscription inactive (store as pending/skipped)
 */
router.post('/appointment', handleAppointmentWebhook);
router.post('/rating', handleRatingWebhook);
router.post('/payment-checkout', handlePaymentCheckoutWebhook);

/**
 * WhatsApp webhooks
 */
router.get('/whatsapp', verifyWhatsAppWebhook); // verification
router.post('/whatsapp', handleWhatsAppIncomingMessage); // incoming messages

/* -------------------- PROTECTED ADMIN/DATA ENDPOINTS -------------------- */
/**
 * Logs
 */
router.get('/logs', authenticateToken, getAllWebhookLogs);
router.get('/logs/:id', authenticateToken, getWebhookLogById);
router.patch('/logs/:id/status', authenticateToken, updateWebhookLogStatus);

/**
 * Payment webhook records
 */
router.get('/payment-webhooks', authenticateToken, getAllPaymentWebhooks);
router.get('/payment-webhooks/:id', authenticateToken, getPaymentWebhookById);
router.get(
  '/payment-webhooks/customer/:customerId',
  authenticateToken,
  getPaymentWebhooksByCustomerId
);

/**
 * Appointments
 */
router.get('/appointments', authenticateToken, getAllAppointments);
router.get('/appointments/:id', authenticateToken, getAppointmentById);
router.get(
  '/appointments/customer/:customerId',
  authenticateToken,
  getAppointmentsByCustomerId
);

/**
 * WhatsApp message (manual store) - protected
 * Note: subscription validation can stay inside controller for this one.
 */
router.post(
  '/whatsapp-message',
  authenticateToken,
  createWhatsappMessageWithValidation
);

module.exports = router;
