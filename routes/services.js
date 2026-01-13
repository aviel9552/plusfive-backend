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

// All service routes require authentication
router.use(authenticateToken);

// GET /api/services - Get all services for logged-in user
router.get('/', getAllServices);

// GET /api/services/:id - Get service by ID
router.get('/:id', getServiceById);

// POST /api/services - Create new service
router.post('/', createService);

// PUT /api/services/:id - Update service
router.put('/:id', updateService);

// DELETE /api/services/:id - Delete service (soft delete)
router.delete('/:id', deleteService);

// DELETE /api/services/bulk/delete - Delete multiple services (bulk delete)
router.delete('/bulk/delete', deleteMultipleServices);

module.exports = router;
