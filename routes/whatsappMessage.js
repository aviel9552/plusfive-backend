const express = require('express');
const router = express.Router();
const { getAllWhatsappMessages } = require('../controllers/whatsappMessageController');
const { authenticateToken } = require('../middleware/auth');

// Get all WhatsApp messages with pagination and filters
router.get('/', authenticateToken, getAllWhatsappMessages);

module.exports = router;
