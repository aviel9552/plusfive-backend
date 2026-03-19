const express = require('express');
const {
  getPublicBusinessBySlug,
  createPublicAppointmentBySlug,
  getPublicAppointmentsBySlug,
} = require('./controller');

const router = express.Router();

// Public business page data (no auth)
router.get('/business/:slug', getPublicBusinessBySlug);
router.get('/business/:slug/appointments', getPublicAppointmentsBySlug);
router.post('/business/:slug/appointments', createPublicAppointmentBySlug);

module.exports = router;
