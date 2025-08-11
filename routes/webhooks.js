const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  handleAppointmentWebhook,
  handlePaymentCheckoutWebhook,
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus
} = require('../controllers/webhookController');

// Webhook endpoints (no authentication required)
router.post('/appointment', handleAppointmentWebhook);
router.post('/payment-checkout', handlePaymentCheckoutWebhook);

// Admin endpoints (authentication required)
router.get('/logs', authenticateToken, getAllWebhookLogs);
router.get('/logs/:id', authenticateToken, getWebhookLogById);
router.patch('/logs/:id/status', authenticateToken, updateWebhookLogStatus);

module.exports = router;
