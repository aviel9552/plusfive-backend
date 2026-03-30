const express = require('express');
const router = express.Router();
const { authenticateCustomerToken } = require('../middleware/auth');
const {
  getCustomerDashboardOverview,
  getCustomerAppointments,
  getCustomerPayments,
  getCustomerWaitlist,
} = require('./controller');

router.use(authenticateCustomerToken);

// GET /api/customer-portal/overview?year=2026&month=3
router.get('/overview', getCustomerDashboardOverview);
// GET /api/customer-portal/appointments
router.get('/appointments', getCustomerAppointments);
// GET /api/customer-portal/payments
router.get('/payments', getCustomerPayments);
// GET /api/customer-portal/waitlist
router.get('/waitlist', getCustomerWaitlist);

module.exports = router;

