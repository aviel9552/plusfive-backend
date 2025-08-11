const express = require('express');
const router = express.Router();
const { 
  addCustomer, 
  getMyCustomers, 
  updateCustomer, 
  removeCustomer, 
  getCustomerById, 
  recordCustomerVisit 
} = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/auth');

// All customer routes require authentication
router.use(authenticateToken);

// POST /api/customers - Add new customer to business owner's list
router.post('/', addCustomer);

// GET /api/customers - Get all customers of current business owner
router.get('/', getMyCustomers);

// GET /api/customers/:id - Get customer by ID
router.get('/:id', getCustomerById);

// PUT /api/customers/:id - Update customer information
router.put('/:id', updateCustomer);

// DELETE /api/customers/:id - Remove customer from business owner's list
router.delete('/:id', removeCustomer);

// POST /api/customers/:id/visit - Record customer visit
router.post('/:id/visit', recordCustomerVisit);

module.exports = router;
