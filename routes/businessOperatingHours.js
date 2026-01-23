const express = require('express');
const router = express.Router();
const {
  getBusinessOperatingHours,
  upsertBusinessOperatingHours,
  updateBusinessOperatingHour,
  deleteBusinessOperatingHour,
  deleteAllBusinessOperatingHours
} = require('../controllers/businessOperatingHoursController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All routes require authentication
router.use(authenticateToken);

// GET /api/business-operating-hours - Get operating hours for the logged-in user
router.get('/', getBusinessOperatingHours);

// POST /api/business-operating-hours - Create or update all operating hours (bulk upsert)
router.post('/', checkSubscription, upsertBusinessOperatingHours);

// PUT /api/business-operating-hours/:id - Update a single operating hour entry
router.put('/:id', checkSubscription, updateBusinessOperatingHour);

// DELETE /api/business-operating-hours/:id - Delete a single operating hour entry
router.delete('/:id', checkSubscription, deleteBusinessOperatingHour);

// DELETE /api/business-operating-hours - Delete all operating hours for the business
router.delete('/', checkSubscription, deleteAllBusinessOperatingHours);

module.exports = router;
