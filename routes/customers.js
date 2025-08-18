const express = require('express');
const router = express.Router();
const { getAllCustomers, getCustomersStatusCount } = require('../controllers/customersController');
const { authenticateToken } = require('../middleware/auth');

// All customer routes require authentication
router.use(authenticateToken);

// GET /api/customers - Get all customers with pagination, search, and reviews data
router.get('/', getAllCustomers);

// GET /api/customers/status-count - Get customer status counts for dashboard
router.get('/status-count', getCustomersStatusCount);

module.exports = router;
