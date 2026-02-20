const express = require('express');
const router = express.Router();
const { getClientPermissions, upsertClientPermissions } = require('../controllers/clientPermissionsController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/client-permissions - Get client permissions for logged-in user
router.get('/', getClientPermissions);

// PUT /api/client-permissions - Create or update client permissions for logged-in user
router.put('/', upsertClientPermissions);

module.exports = router;
