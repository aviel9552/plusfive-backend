const express = require('express');
const router = express.Router();
const { getAutomations, upsertAutomations } = require('../controllers/automationsController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

router.use(authenticateToken);

// GET /api/automations - Get automations for logged-in user (view only, no subscription required)
router.get('/', getAutomations);

// PUT /api/automations - Create or update automations (subscription required)
router.put('/', checkSubscription, upsertAutomations);

module.exports = router;
