const express = require('express');
const router = express.Router();
const {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  deleteMultipleSuppliers
} = require('../controllers/supplierController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All supplier routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/suppliers - Get all suppliers
router.get('/', getAllSuppliers);

// GET /api/suppliers/:id - Get supplier by ID
router.get('/:id', getSupplierById);

// POST, PUT, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/suppliers - Create new supplier
router.post('/', checkSubscription, createSupplier);

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', checkSubscription, updateSupplier);

// DELETE /api/suppliers/bulk/delete - Delete multiple suppliers (bulk delete)
// Note: This route must come before /:id to avoid route conflicts
router.delete('/bulk/delete', checkSubscription, deleteMultipleSuppliers);

// DELETE /api/suppliers/:id - Delete supplier (hard delete)
router.delete('/:id', checkSubscription, deleteSupplier);

module.exports = router;
