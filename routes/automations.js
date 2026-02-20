const express = require('express');
const router = express.Router();
const { getAutomations, upsertAutomations } = require('../controllers/automationsController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/automations - Get automations for logged-in user
router.get('/', getAutomations);

// PUT /api/automations - Create or update automations for logged-in user
router.put('/', upsertAutomations);

module.exports = router;
