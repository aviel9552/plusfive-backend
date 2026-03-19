const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const nodemailer = require('nodemailer');
const { getConfig } = require('../config');

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
    const { subject, description, priority, category, email } = req.body;
    
    // Create ticket in database
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user.userId,
        subject: subject,
        description: description,
        priority: priority,
        category: category,
      }
    });
    
    // Send email notification if email is provided
    if (email) {
      try {
        // Call existing sendSupportEmail function
        await sendSupportEmail(req, res);
        // sendSupportEmail already sends response, so we don't need to send another one
        return; // Exit early since response already sent
      } catch (emailError) {
        console.error('Failed to send support ticket email:', emailError);
        // If email fails, still send success response for ticket creation
        return successResponse(res, {
          ticket,
          emailSent: false,
          message: 'Support ticket created successfully but email failed'
        }, 'Support ticket created successfully but email failed');
      }
    }
    
    // Only send response if no email was provided
    return successResponse(res, {
      ticket,
      emailSent: false,
      message: 'Support ticket created successfully (no email provided)'
    }, 'Support ticket created successfully');
    
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

// Send support email
const sendSupportEmail = async (req, res) => {
  try {
    const { email, subject, description } = req.body;
    
    // Validate required fields
    if (!email || !subject || !description) {
      return errorResponse(res, 'Email, subject, and description are required', 400);
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 'Invalid email format', 400);
    }
    
    // Create email transporter
    const config = getConfig();
    const transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.auth.user,
        pass: config.email.auth.pass
      }
    });
    
    // Prepare email content with beautiful template
    const emailSubject = `Support Ticket: ${subject}`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Support Ticket</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Support Ticket Details</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px;">
            <h3 style="color: #667eea; margin-top: 0;">Subject</h3>
            <p style="color: #333; font-size: 16px; margin: 0;">${subject}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px;">
            <h3 style="color: #667eea; margin-top: 0;">Description</h3>
            <p style="color: #333; line-height: 1.6; margin: 0;">${description}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px;">
            <h3 style="color: #667eea; margin-top: 0;">Submitted by</h3>
            <p style="color: #333; margin: 0;">${email}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px;">
            <h3 style="color: #667eea; margin-top: 0;">Date</h3>
            <p style="color: #333; margin: 0;">${new Date().toLocaleString()}</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; text-align: center;">
            <p style="color: #333; font-weight: bold; margin: 0;">Our team will review your ticket and get back to you soon!</p>
            <p style="color: #666; margin: 10px 0 0 0;">Thank you for contacting our support team.</p>
          </div>
        </div>
      </div>
    `;
    
    // Send email
    const mailOptions = {
      from: `"${config.email.fromName || 'PlusFive Support'}" <${config.email.auth.user}>`,
      to: email,
      subject: emailSubject,
      html: emailBody
    };
    
    const result = await transporter.sendMail(mailOptions);
    
    return successResponse(res, {
      message: 'Support email sent successfully',
      email,
      subject,
      description,
      sentAt: new Date()
    }, 'Support email sent successfully');
    
  } catch (error) {
    console.error('Send support email error:', error);
    return errorResponse(res, 'Failed to send support email', 500);
  }
};

module.exports = {
  getAllTickets,
  createTicket,
  getTicketById,
  updateTicket,
  deleteTicket,
  sendSupportEmail
}; 