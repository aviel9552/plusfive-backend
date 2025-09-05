const express = require('express');
const router = express.Router();
const cronJobController = require('../controllers/cronJobController');

/**
 * @route   POST /api/cron-jobs/trigger
 * @desc    Manually trigger customer status update (for testing)
 * @access  Private (Admin/User)
 */
router.post('/trigger', cronJobController.triggerStatusUpdate);

module.exports = router;
