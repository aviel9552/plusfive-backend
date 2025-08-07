const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Get all support tickets
const getAllTickets = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const priority = req.query.priority;
    const category = req.query.category;
    
    const skip = (page - 1) * limit;
    
    const where = {
      userId: req.user.userId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(category && { category })
    };
    
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.supportTicket.count({ where })
    ]);
    
    return successResponse(res, {
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get support tickets error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Create new support ticket
const createTicket = async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user.userId,
        subject: req.body.subject,
        description: req.body.description,
        priority: req.body.priority,
        category: req.body.category,
      }
    });
    
    return successResponse(res, ticket, 'Support ticket created successfully');
    
  } catch (error) {
    console.error('Create support ticket error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get ticket by ID
const getTicketById = async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });
    
    if (!ticket) {
      return errorResponse(res, 'Support ticket not found', 404);
    }
    
    return successResponse(res, ticket);
    
  } catch (error) {
    console.error('Get support ticket error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Update ticket
const updateTicket = async (req, res) => {
  try {
    // Check if ticket exists and belongs to user
    const existingTicket = await prisma.supportTicket.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });
    
    if (!existingTicket) {
      return errorResponse(res, 'Support ticket not found', 404);
    }
    
    // Update ticket
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: req.body
    });
    
    return successResponse(res, ticket, 'Support ticket updated successfully');
    
  } catch (error) {
    console.error('Update support ticket error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Delete ticket
const deleteTicket = async (req, res) => {
  try {
    // Check if ticket exists and belongs to user
    const existingTicket = await prisma.supportTicket.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });
    
    if (!existingTicket) {
      return errorResponse(res, 'Support ticket not found', 404);
    }
    
    // Delete ticket
    await prisma.supportTicket.delete({
      where: { id: req.params.id }
    });
    
    return successResponse(res, null, 'Support ticket deleted successfully');
    
  } catch (error) {
    console.error('Delete support ticket error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  getAllTickets,
  createTicket,
  getTicketById,
  updateTicket,
  deleteTicket
}; 