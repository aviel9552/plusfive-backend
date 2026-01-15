const express = require('express');
const router = express.Router();
const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  deleteMultipleServices
} = require('../controllers/serviceController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All service routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/services - Get all services for logged-in user
router.get('/', getAllServices);

// GET /api/services/:id - Get service by ID
router.get('/:id', getServiceById);

// POST, PUT, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/services - Create new service
router.post('/', checkSubscription, createService);

// PUT /api/services/:id - Update service
router.put('/:id', checkSubscription, updateService);

// DELETE /api/services/:id - Delete service (soft delete)
router.delete('/:id', checkSubscription, deleteService);

// DELETE /api/services/bulk/delete - Delete multiple services (bulk delete)
router.delete('/bulk/delete', checkSubscription, deleteMultipleServices);

module.exports = router;
