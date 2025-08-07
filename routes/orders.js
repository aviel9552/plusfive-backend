const express = require('express');
const router = express.Router();
const { getAllOrders, createOrder, getOrderById, updateOrder, deleteOrder } = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { orderCreateSchema, orderUpdateSchema } = require('../lib/validations');

// GET /api/orders - Get all orders
router.get('/', authenticateToken, getAllOrders);

// POST /api/orders - Create new order
router.post('/', authenticateToken, validateRequest(orderCreateSchema), createOrder);

// GET /api/orders/:id - Get order by ID
router.get('/:id', authenticateToken, getOrderById);

// PUT /api/orders/:id - Update order
router.put('/:id', authenticateToken, validateRequest(orderUpdateSchema), updateOrder);

// DELETE /api/orders/:id - Delete order
router.delete('/:id', authenticateToken, deleteOrder);

module.exports = router; 