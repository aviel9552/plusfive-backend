const express = require('express');
const router = express.Router();
const { 
  sendText, 
  sendRatingRequest, 
  processRating,
  handleButtonInteraction,
  addReview
} = require('../controllers/reviewController');

// Send simple WhatsApp text message
router.post('/send-text', sendText);

// Send rating request to customer
router.post('/send-rating-request', sendRatingRequest);

// Process customer rating response
router.post('/process-rating', processRating);

// Handle WhatsApp button interactions (webhook)
router.post('/whatsapp-webhook', handleButtonInteraction);

// Add review API
router.post('/add', addReview);

module.exports = router;
