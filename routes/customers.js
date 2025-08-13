const express = require('express');
const router = express.Router();
const { getAllCustomers } = require('../controllers/customersController');
const { authenticateToken } = require('../middleware/auth');

// All customer routes require authentication
router.use(authenticateToken);

// GET /api/customers - Get all customers with pagination and search
router.get('/', getAllCustomers);

module.exports = router;
