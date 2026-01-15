const express = require('express');
const router = express.Router();
const { 
  getAllCustomers, 
  getTenCustomers, 
  getCustomersStatusCount, 
  getCustomerById,
  addCustomer, 
  updateCustomer, 
  removeCustomer, 
  removeMultipleCustomers, 
  bulkImportCustomers 
} = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All customer routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/customers - Get all customers with pagination, search, and reviews data
router.get('/', getAllCustomers);

// GET /api/customers/ten - Get latest 10 customers without pagination
router.get('/ten', getTenCustomers);

// GET /api/customers/status-count - Get customer status counts for dashboard
router.get('/status-count', getCustomersStatusCount);

// GET /api/customers/:id - Get customer by ID with detailed information
router.get('/:id', getCustomerById);

// POST, PUT, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/customers - Add new customer
router.post('/', checkSubscription, addCustomer);

// POST /api/customers/bulk-import - Bulk import customers from CSV data
router.post('/bulk-import', checkSubscription, bulkImportCustomers);

// PUT /api/customers/:id - Update customer information
router.put('/:id', checkSubscription, updateCustomer);

// DELETE /api/customers/bulk - Remove multiple customers from business owner's list
router.delete('/bulk', checkSubscription, removeMultipleCustomers);

// DELETE /api/customers/:id - Remove customer from business owner's list
router.delete('/:id', checkSubscription, removeCustomer);

module.exports = router;
