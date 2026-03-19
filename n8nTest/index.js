const express = require('express');
const router = express.Router();
const {
  testAtRiskTrigger,
  testLostTrigger,
  testReviewTrigger,
  testRecoveredTrigger,
  testCustomTrigger
} = require('./controller');

// Test routes for n8n webhook integration
router.post('/at-risk', testAtRiskTrigger);
router.post('/lost', testLostTrigger);
router.post('/review', testReviewTrigger);
router.post('/recovered', testRecoveredTrigger);
router.post('/custom', testCustomTrigger);

module.exports = router;
