const express = require('express');
const router = express.Router();
const { getAllWhatsappMessages, reportUsageToStripe1 } = require('./controller');
const { authenticateToken } = require('../middleware/auth');

// Get all WhatsApp messages with pagination and filters
router.get('/', authenticateToken, getAllWhatsappMessages);

router.post('/add', reportUsageToStripe1);

module.exports = router;
