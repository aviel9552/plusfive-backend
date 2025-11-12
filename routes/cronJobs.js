const express = require('express');
const router = express.Router();
const cronJobController = require('../controllers/cronJobController');

const verifyCronSecret = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret configured, allow (useful for local dev)
  if (!cronSecret) {
    return next();
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (token !== cronSecret) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized cron request'
    });
  }

  return next();
};

/**
 * @route   POST /api/cron-jobs/trigger
 * @desc    Manually trigger customer status update (for testing)
 * @access  Protected via CRON_SECRET
 */
router.post('/trigger', verifyCronSecret, cronJobController.triggerStatusUpdate);

module.exports = router;
