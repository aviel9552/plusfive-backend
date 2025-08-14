const express = require('express');
const router = express.Router();
const { sendText } = require('../controllers/reviewController');

// Send simple WhatsApp text message
router.post('/send-text', sendText);

module.exports = router;
