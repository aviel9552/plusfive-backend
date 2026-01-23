const express = require('express');
const router = express.Router();
const {
  getAllWaitlist,
  getWaitlistById,
  createWaitlist,
  updateWaitlist,
  deleteWaitlist,
} = require('../controllers/waitlistController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

router.use(authenticateToken);

// GET /api/waitlist - Get all waitlist entries for current user
router.get('/', getAllWaitlist);

// GET /api/waitlist/:id - Get waitlist entry by ID
router.get('/:id', getWaitlistById);

// POST /api/waitlist - Create waitlist entry (requires subscription)
router.post('/', checkSubscription, createWaitlist);

// PUT /api/waitlist/:id - Update waitlist entry (requires subscription)
router.put('/:id', checkSubscription, updateWaitlist);

// DELETE /api/waitlist/:id - Delete waitlist entry (requires subscription)
router.delete('/:id', checkSubscription, deleteWaitlist);

module.exports = router;
