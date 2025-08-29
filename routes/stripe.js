const express = require('express');
const router = express.Router();
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

// Public routes (no authentication required)
router.get('/prices', getPrices);
router.post('/webhook', handleWebhook);

// Protected routes (authentication required)
router.post('/checkout', authenticateToken, createCheckoutSession);
router.post('/customer-portal', authenticateToken, createCustomerPortalSession);
router.get('/subscription', authenticateToken, getSubscription);
router.post('/subscription/:subscriptionId/cancel', authenticateToken, cancelSubscription);
router.post('/subscription/:subscriptionId/reactivate', authenticateToken, reactivateSubscription);

// Payment method management routes
router.get('/payment-methods', authenticateToken, getPaymentMethods);
router.post('/payment-methods', authenticateToken, addPaymentMethod);
router.put('/payment-methods/:paymentMethodId', authenticateToken, updatePaymentMethod);
router.delete('/payment-methods/:paymentMethodId', authenticateToken, removePaymentMethod);

module.exports = router;
