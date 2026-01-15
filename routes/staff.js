const express = require('express');
const router = express.Router();
const {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  deleteMultipleStaff
} = require('../controllers/staffController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All staff routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/staff - Get all staff for logged-in user
router.get('/', getAllStaff);

// GET /api/staff/:id - Get staff by ID
router.get('/:id', getStaffById);

// POST, PUT, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/staff - Create new staff
router.post('/', checkSubscription, createStaff);

// PUT /api/staff/:id - Update staff
router.put('/:id', checkSubscription, updateStaff);

// DELETE /api/staff/:id - Delete staff (soft delete)
router.delete('/:id', checkSubscription, deleteStaff);

// DELETE /api/staff/bulk - Delete multiple staff (bulk delete)
router.delete('/bulk/delete', checkSubscription, deleteMultipleStaff);

module.exports = router;
