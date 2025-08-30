const express = require('express');
const router = express.Router();
const { getAllTickets, createTicket, getTicketById, updateTicket, deleteTicket, sendSupportEmail } = require('../controllers/supportController');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { supportTicketCreateSchema, supportTicketUpdateSchema } = require('../lib/validations');

// GET /api/support - Get all support tickets
router.get('/', authenticateToken, getAllTickets);

// POST /api/support - Create new support ticket
// router.post('/', authenticateToken, validateRequest(supportTicketCreateSchema), createTicket);
router.post('/', authenticateToken, createTicket);

// POST /api/support/email - Send support email
router.post('/email', sendSupportEmail);

// GET /api/support/:id - Get support ticket by ID
router.get('/:id', authenticateToken, getTicketById);

// PUT /api/support/:id - Update support ticket
router.put('/:id', authenticateToken, validateRequest(supportTicketUpdateSchema), updateTicket);

// DELETE /api/support/:id - Delete support ticket
router.delete('/:id', authenticateToken, deleteTicket);

module.exports = router; 