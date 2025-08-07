const express = require('express');
const router = express.Router();
const { getAllPayments, createPayment } = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { paymentCreateSchema } = require('../lib/validations');

// GET /api/payments - Get all payments
router.get('/', authenticateToken, getAllPayments);

// POST /api/payments - Create new payment
router.post('/', authenticateToken, validateRequest(paymentCreateSchema), createPayment);

module.exports = router; 