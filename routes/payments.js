const express = require('express');
const router = express.Router();
// const { getAllPayments, createPayment } = require('../controllers/paymentController'); // Removed - Payment/Order models no longer exist
const { 
  createCheckoutSession,
  getPrices,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  createCustomerPortalSession,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  removePaymentMethod,
  handleWebhook
} = require('../controllers/stripeController');
const { authenticateToken } = require('../middleware/auth');
// const { validateRequest } = require('../middleware/validation');
// const { paymentCreateSchema } = require('../lib/validations'); // Removed - Payment model no longer exists

// General payment routes (Removed - Payment/Order models no longer exist, using PaymentWebhook instead)
// router.get('/', authenticateToken, getAllPayments);
// router.post('/', authenticateToken, validateRequest(paymentCreateSchema), createPayment);

// Stripe subscription routes
router.post('/checkout', authenticateToken, createCheckoutSession);
router.get('/prices', getPrices);
router.get('/subscription', authenticateToken, getSubscription);
router.put('/subscription/:subscriptionId/cancel', authenticateToken, cancelSubscription);
router.put('/subscription/:subscriptionId/reactivate', authenticateToken, reactivateSubscription);
router.post('/portal', authenticateToken, createCustomerPortalSession);

// Payment method management routes
router.get('/payment-methods', authenticateToken, getPaymentMethods);
router.post('/payment-methods', authenticateToken, addPaymentMethod);
router.put('/payment-methods/:paymentMethodId', authenticateToken, updatePaymentMethod);
router.delete('/payment-methods/:paymentMethodId', authenticateToken, removePaymentMethod);

// Webhook (no authentication needed)
router.post('/webhook', handleWebhook);

module.exports = router; 