const express = require('express');
const {
  getPublicBusinessBySlug,
  createPublicAppointmentBySlug,
  getPublicAppointmentsBySlug,
  cancelPublicBookingBySlug,
} = require('./controller');

const router = express.Router();

// Public business page data (no auth)
router.get('/business/:slug', getPublicBusinessBySlug);
router.get('/business/:slug/appointments', getPublicAppointmentsBySlug);
router.post('/business/:slug/appointments', createPublicAppointmentBySlug);
router.patch('/business/:slug/bookings/:bookingId/cancel', cancelPublicBookingBySlug);

module.exports = router;
