const express = require('express');
const router = express.Router();
const { getAllCustomers, getCustomersStatusCount, getCustomerById } = require('../controllers/customersController');
const { authenticateToken } = require('../middleware/auth');

// All customer routes require authentication
router.use(authenticateToken);

// GET /api/customers - Get all customers with pagination, search, and reviews data
router.get('/', getAllCustomers);

// GET /api/customers/status-count - Get customer status counts for dashboard
router.get('/status-count', getCustomersStatusCount);

// GET /api/customers/:id - Get customer by ID with detailed information
router.get('/:id', getCustomerById);

module.exports = router;
