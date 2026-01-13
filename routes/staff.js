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

// All staff routes require authentication
router.use(authenticateToken);

// GET /api/staff - Get all staff for logged-in user
router.get('/', getAllStaff);

// GET /api/staff/:id - Get staff by ID
router.get('/:id', getStaffById);

// POST /api/staff - Create new staff
router.post('/', createStaff);

// PUT /api/staff/:id - Update staff
router.put('/:id', updateStaff);

// DELETE /api/staff/:id - Delete staff (soft delete)
router.delete('/:id', deleteStaff);

// DELETE /api/staff/bulk - Delete multiple staff (bulk delete)
router.delete('/bulk/delete', deleteMultipleStaff);

module.exports = router;
