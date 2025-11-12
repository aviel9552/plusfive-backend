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
 * @route   /api/cron-jobs/trigger
 * @desc    Trigger customer status update (cron or manual)
 * @access  Protected via CRON_SECRET
 */
router.all('/trigger', verifyCronSecret, cronJobController.triggerStatusUpdate);

module.exports = router;
