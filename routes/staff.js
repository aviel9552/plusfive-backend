const express = require('express');
const router = express.Router();
const {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  deleteMultipleStaff,
  // Staff Operating Hours
  getStaffOperatingHours,
  upsertStaffOperatingHours,
  updateStaffOperatingHour,
  deleteStaffOperatingHour,
  deleteAllStaffOperatingHours
} = require('../controllers/staffController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const upload = require('../middleware/upload');

// All staff routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/staff - Get all staff for logged-in user
router.get('/', getAllStaff);

// ==================== Staff Operating Hours Routes (must come before /:id routes) ====================

// GET /api/staff/:staffId/operating-hours - Get operating hours for a staff member
router.get('/:staffId/operating-hours', getStaffOperatingHours);

// POST /api/staff/:staffId/operating-hours - Create or update all operating hours (bulk upsert)
router.post('/:staffId/operating-hours', checkSubscription, upsertStaffOperatingHours);

// PUT /api/staff/operating-hours/:id - Update a single operating hour entry
router.put('/operating-hours/:id', checkSubscription, updateStaffOperatingHour);

// DELETE /api/staff/operating-hours/:id - Delete a single operating hour entry
router.delete('/operating-hours/:id', checkSubscription, deleteStaffOperatingHour);

// DELETE /api/staff/:staffId/operating-hours - Delete all operating hours for a staff member
router.delete('/:staffId/operating-hours', checkSubscription, deleteAllStaffOperatingHours);

// POST, PUT, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/staff - Create new staff (with optional image upload)
router.post('/', checkSubscription, upload.single('image'), createStaff);

// GET /api/staff/:id - Get staff by ID (must come after operating-hours routes)
router.get('/:id', getStaffById);

// PUT /api/staff/:id - Update staff (with optional image upload)
router.put('/:id', checkSubscription, upload.single('image'), updateStaff);

// DELETE /api/staff/:id - Delete staff (soft delete)
router.delete('/:id', checkSubscription, deleteStaff);

// DELETE /api/staff/bulk - Delete multiple staff (bulk delete)
router.delete('/bulk/delete', checkSubscription, deleteMultipleStaff);

module.exports = router;
