const express = require('express');
const router = express.Router();
const { 
  createReferral, 
  getReferralStats, 
  getAllReferrals, 
  updateReferralStatus, 
  getReferralById,
  getUserReferrals
} = require('../controllers/referralController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/referrals - Create new referral
router.post('/', createReferral);

// GET /api/referrals/stats - Get user's referral statistics
router.get('/stats', authenticateToken, getReferralStats);

// GET /api/referrals/my - Get current user's referrals
router.get('/my', authenticateToken, getUserReferrals);

// GET /api/referrals/all - Get all referrals (admin only)
router.get('/all', authenticateToken, getAllReferrals);

// GET /api/referrals/:id - Get referral by ID
router.get('/:id', authenticateToken, getReferralById);

// PUT /api/referrals/:id/status - Update referral status (admin only)
router.put('/:id/status', authenticateToken, updateReferralStatus);

module.exports = router;
