const express = require('express');
const router = express.Router();
const { getClientPermissions, upsertClientPermissions } = require('../controllers/clientPermissionsController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

router.use(authenticateToken);

// GET /api/client-permissions - Get client permissions for logged-in user (view only, no subscription required)
router.get('/', getClientPermissions);

// PUT /api/client-permissions - Create or update client permissions (subscription required)
router.put('/', checkSubscription, upsertClientPermissions);

module.exports = router;
