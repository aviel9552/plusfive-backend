const express = require('express');
const router = express.Router();
const { getAllCustomers, getTenCustomers, getCustomersStatusCount, getCustomerById } = require('../controllers/customersController');
const { addCustomer } = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All customer routes require authentication
router.use(authenticateToken);

// POST /api/customers - Add new customer (requires active subscription)
router.post('/', checkSubscription, addCustomer);

// GET /api/customers - Get all customers with pagination, search, and reviews data
router.get('/', getAllCustomers);

// GET /api/customers/ten - Get latest 10 customers without pagination
router.get('/ten', getTenCustomers);

// GET /api/customers/status-count - Get customer status counts for dashboard
router.get('/status-count', getCustomersStatusCount);

// GET /api/customers/:id - Get customer by ID with detailed information
router.get('/:id', getCustomerById);

module.exports = router;
