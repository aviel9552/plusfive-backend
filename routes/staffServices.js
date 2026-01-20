const express = require('express');
const router = express.Router();
const {
  addOrUpdateStaffService,
  removeStaffService,
  getStaffServices,
  getAvailableServicesForStaff
} = require('../controllers/staffServiceController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All staff service routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/staff/:staffId/services - Get all active services for a staff member
router.get('/:staffId/services', getStaffServices);

// GET /api/staff/:staffId/services/available - Get all available services (assigned and unassigned)
router.get('/:staffId/services/available', getAvailableServicesForStaff);

// POST, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/staff/:staffId/services - Add or update service for staff
router.post('/:staffId/services', checkSubscription, addOrUpdateStaffService);

// DELETE /api/staff/:staffId/services/:serviceId - Remove service from staff (soft delete)
router.delete('/:staffId/services/:serviceId', checkSubscription, removeStaffService);

module.exports = router;
