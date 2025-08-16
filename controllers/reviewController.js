const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const WhatsAppService = require('../services/WhatsAppService');

// Initialize WhatsApp service
const whatsappService = new WhatsAppService();

// Send simple WhatsApp text message
const sendText = async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    // Validate required fields
    if (!phoneNumber || !message) {
      return errorResponse(res, 'Missing required fields: phoneNumber, message', 400);
    }

    // Send WhatsApp message
    const messageSent = await whatsappService.sendMessage(phoneNumber, message, 'text_message');

    if (messageSent) {
      return successResponse(res, {
        phoneNumber: phoneNumber,
        message: message,
        status: 'sent',
        message: 'WhatsApp message sent successfully'
      }, 'WhatsApp message sent successfully', 200);
    } else {
      return errorResponse(res, 'Failed to send WhatsApp message', 500);
    }

  } catch (error) {
    console.error('Send text message error:', error);
    return errorResponse(res, 'Failed to send WhatsApp message', 500);
  }
};

// Send rating request based on customer type
const sendRatingRequest = async (req, res) => {
  try {
    const { customerId, customerType = 'regular', useAlt = false } = req.body;

    if (!customerId) {
      return errorResponse(res, 'Missing required field: customerId', 400);
    }

    // Get customer details
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            businessName: true,
            phoneNumber: true
          }
        }
      }
    });
    console.log('customer', customer);

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    if (!customer.customerPhone) {
      return errorResponse(res, 'Customer phone number not found', 400);
    }

    // Get review link from environment with customer and user IDs
    const baseUrl = process.env.FRONTEND_URL;
    const reviewLink = `${baseUrl}/reviews?customerId=${customer.id}&userId=${customer.userId}`;

    // Send template message with fallback to text
    let result;

    try {
      if (customerType === 'new') {
        // Try new customer template first with review link
        result = await whatsappService.sendNewCustomerRatingWithLink(
          customer.customerFullName || customer.firstName || 'Customer',
          customer.businessName || customer.user?.businessName || 'Business',
          customer.customerPhone,
          reviewLink
        );
      } else {
        // Try regular customer template first with review link
        result = await whatsappService.sendRegularCustomerRatingWithLink(
          customer.customerFullName || customer.firstName || 'Customer',
          customer.customerPhone,
          reviewLink,
          useAlt
        );
      }
    } catch (templateError) {
      console.log('Template failed, falling back to text message:', templateError.message);

      // Fallback to simple text message if template fails
      let message;
      if (customerType === 'new') {
        message = `היי ${customer.customerFullName || customer.firstName || 'Customer'}, זו עדי מ${customer.businessName || customer.user?.businessName || 'Business'}

אשמח לדעת איך הייתה החוויה שלך בין 1-5?

לביקורת מפורטת לחץ כאן:
${reviewLink}`;
      } else {
        if (useAlt) {
          message = `היי ${customer.customerFullName || customer.firstName || 'Customer'} מה קורה?

אשמח לדעת איך הייתה החוויה בין 1-5?

לביקורת מפורטת לחץ כאן:
${reviewLink}`;
        } else {
          message = `היי ${customer.customerFullName || customer.firstName || 'Customer'} מה קורה?

נו אז איך הייתה החוויה שלך הפעם בין 1-5?

לביקורת מפורטת לחץ כאן:
${reviewLink}`;
        }
      }

      result = await whatsappService.sendMessage(
        customer.customerPhone,
        message,
        'rating_request'
      );
    }

    return successResponse(res, {
      customerId: customer.id,
      customerName: customer.customerFullName,
      phoneNumber: customer.customerPhone,
      customerType,
      templateUsed: customerType === 'new' ? 'new_customer_rating' : (useAlt ? 'regular_customer_rating_alt' : 'regular_customer_rating'),
      whatsappResponse: result
    }, 'Rating request sent successfully', 200);

  } catch (error) {
    console.error('Send rating request error:', error);
    return errorResponse(res, 'Failed to send rating request', 500);
  }
};

// Process rating response from customer
const processRating = async (req, res) => {
  try {
    const { customerId, rating, feedback = null } = req.body;

    if (!customerId || !rating) {
      return errorResponse(res, 'Missing required fields: customerId, rating', 400);
    }

    const ratingNumber = parseInt(rating);
    if (ratingNumber < 1 || ratingNumber > 5) {
      return errorResponse(res, 'Rating must be between 1 and 5', 400);
    }

    // Get customer and business details
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            businessName: true,
            phoneNumber: true
          }
        }
      }
    });

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Create review record
    const review = await prisma.review.create({
      data: {
        rating: ratingNumber,
        feedback: feedback,
        status: 'received',
        customerId: customerId,
        userId: customer.userId
      }
    });

    let responseMessage;

    if (ratingNumber >= 1 && ratingNumber <= 3) {
      // Low rating (1-3 stars) - Send alert to business owner

      try {
        // Try template message first, fallback to text
        await whatsappService.sendTemplateMessage(
          customer.customerPhone,
          'low_rating_response',
          'he',
          []
        );
      } catch (templateError) {
        // Fallback to text message
        await whatsappService.sendMessage(
          customer.customerPhone,
          'תודה על הביקורת, בזכות לקוחות כמוך יש לנו את האפשרות לשפר את השירות והחוייה ולשאוף תמיד לעלות ברמה.',
          'low_rating_response'
        );
      }

      // Send alert to business owner
      if (customer.user?.phoneNumber) {
        try {
          // Try template for business owner alert
          await whatsappService.sendTemplateMessage(
            customer.user.phoneNumber,
            'business_owner_alert',
            'he',
            [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: customer.businessName || customer.user?.businessName || 'Business' },
                  { type: 'text', text: customer.customerFullName || customer.firstName || 'Customer' },
                  { type: 'text', text: customer.customerPhone },
                  { type: 'text', text: ratingNumber.toString() },
                  { type: 'text', text: customer.selectedServices || 'Service not specified' }
                ]
              }
            ]
          );
        } catch (templateError) {
          // Fallback to text message
          await whatsappService.sendMessage(
            customer.user.phoneNumber,
            `🚨 התראת דירוג נמוך מ-${customer.businessName || customer.user?.businessName || 'Business'}

לקוח: ${customer.customerFullName || customer.firstName || 'Customer'}
טלפון: ${customer.customerPhone}
דירוג: ${ratingNumber}/5
שירות: ${customer.selectedServices || 'Service not specified'}

מומלץ ליצור קשר לחוויה מתקנת`,
            'low_rating_alert'
          );
        }
      }

      responseMessage = 'Low rating processed - Customer thanked and business owner alerted';

    } else if (ratingNumber >= 4 && ratingNumber <= 5) {
      // Good rating (4-5 stars) - Send thank you
      try {
        // Try template message first
        await whatsappService.sendTemplateMessage(
          customer.customerPhone,
          'thank_you_rating',
          'he',
          []
        );
      } catch (templateError) {
        // Fallback to text message
        await whatsappService.sendMessage(
          customer.customerPhone,
          'תודה על השיתוף פעולה 😉',
          'thank_you_rating'
        );
      }
      responseMessage = 'Good rating processed - Thank you message sent';
    }

    return successResponse(res, {
      reviewId: review.id,
      customerId: customer.id,
      customerName: customer.customerFullName,
      rating: ratingNumber,
      feedback: feedback,
      action: responseMessage
    }, 'Rating processed successfully', 201);

  } catch (error) {
    console.error('Process rating error:', error);
    return errorResponse(res, 'Failed to process rating', 500);
  }
};

// Handle WhatsApp button interactions
const handleButtonInteraction = async (req, res) => {
  try {
    const webhookData = req.body;

    console.log('=== WhatsApp Button Interaction ===');
    console.log('Webhook Data:', JSON.stringify(webhookData, null, 2));

    // Extract interaction data
    const entry = webhookData.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (value?.messages && value.messages.length > 0) {
      const message = value.messages[0];
      const from = message.from;

      // Check if it's an interactive button response
      if (message.type === 'interactive') {
        const buttonReply = message.interactive?.button_reply;

        if (buttonReply) {
          const buttonId = buttonReply.id;
          console.log('Button clicked:', buttonId);
          console.log('From number:', from);

          // Find customer by phone number (try multiple formats)
          let customer = await prisma.customers.findFirst({
            where: {
              customerPhone: `+${from}`
            }
          });

          // If not found, try without + prefix
          if (!customer) {
            customer = await prisma.customers.findFirst({
              where: {
                customerPhone: from
              }
            });
          }

          // If still not found, try with +972 prefix
          if (!customer) {
            customer = await prisma.customers.findFirst({
              where: {
                customerPhone: `+972${from.substring(3)}`
              }
            });
          }

          if (customer) {
            if (buttonId.startsWith('rating_')) {
              // Extract rating number
              const rating = parseInt(buttonId.replace('rating_', ''));

              // Process the rating
              await processRatingFromButton(customer.id, rating, from);

            } else if (buttonId === 'open_review_form') {
              // Send review form URL with better formatting
              const reviewLink = `${process.env.FRONTEND_URL}/reviews?customerId=${customer.id}&userId=${customer.userId}`;

              console.log('Sending review form link:', reviewLink);
              console.log('Customer found:', customer.id, customer.customerFullName);

              const whatsappService = new (require('../services/WhatsAppService'))();

              // Send a more attractive message with the link
              await whatsappService.sendMessage(
                from,
                `🌟 טופס ביקורת מפורט

📝 לביקורת מלאה ומפורטת, לחץ על הקישור הבא:

${reviewLink}

🔗 הקישור יפתח את טופס הביקורת במלואו`,
                'review_form_link'
              );

              console.log('Review form link sent successfully');
            }
          }
        }
      }
    }

    // WhatsApp requires 200 OK response
    return successResponse(res, { status: 'received' }, 'Webhook processed successfully', 200);

  } catch (error) {
    console.error('Button interaction error:', error);
    return successResponse(res, { status: 'received' }, 'Webhook processed', 200);
  }
};

// Process rating from button click
const processRatingFromButton = async (customerId, rating, phoneNumber) => {
  try {
    // Create review record
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            businessName: true,
            phoneNumber: true
          }
        }
      }
    });

    if (!customer) return;

    const review = await prisma.review.create({
      data: {
        rating: rating,
        feedback: null,
        status: 'received',
        customerId: customerId,
        userId: customer.userId
      }
    });

    const whatsappService = new (require('../services/WhatsAppService'))();

    if (rating >= 1 && rating <= 3) {
      // Low rating - Send thank you and alert business owner
      await whatsappService.sendMessage(
        phoneNumber,
        'תודה על הביקורת, בזכות לקוחות כמוך יש לנו את האפשרות לשפר את השירות והחוייה ולשאוף תמיד לעלות ברמה.',
        'low_rating_response'
      );

      // Alert business owner
      if (customer.user?.phoneNumber) {
        await whatsappService.sendMessage(
          customer.user.phoneNumber,
          `🚨 התראת דירוג נמוך מ-${customer.businessName}
לקוח: ${customer.customerFullName}
טלפון: ${customer.customerPhone}
דירוג: ${rating}/5
שירות: ${customer.selectedServices || 'לא צוין'}
מומלץ ליצור קשר לחוויה מתקנת`,
          'low_rating_alert'
        );
      }

    } else if (rating >= 4 && rating <= 5) {
      // Good rating - Send thank you
      await whatsappService.sendMessage(
        phoneNumber,
        'תודה על השיתוף פעולה 😉',
        'thank_you_rating'
      );
    }

    console.log(`Rating ${rating} processed for customer ${customerId}`);

  } catch (error) {
    console.error('Process rating from button error:', error);
  }
};

// Add review - Simple API
const addReview = async (req, res) => {
  try {
    const { customerId, userId, rating, message } = req.body;

    if (!customerId || !userId || !rating) {
      return errorResponse(res, 'Missing required fields: customerId, userId, rating', 400);
    }

    const ratingNumber = parseInt(rating);
    if (ratingNumber < 1 || ratingNumber > 5) {
      return errorResponse(res, 'Rating must be between 1 and 5', 400);
    }

    // Check if review already exists for this customer and user
    const existingReview = await prisma.review.findFirst({
      where: {
        customerId: customerId,
        userId: userId
      }
    });

    let review;
    let action;

    if (existingReview) {
      // Update existing review
      review = await prisma.review.update({
        where: { id: existingReview.id },
        data: {
          rating: ratingNumber,
          message: message || null,
          status: 'received',
          updatedAt: new Date()
        }
      });
      action = 'updated';
    } else {
      // Create new review
      review = await prisma.review.create({
        data: {
          rating: ratingNumber,
          message: message || null,
          status: 'received',
          customerId: customerId,
          userId: userId
        }
      });
      action = 'created';
    }

    return successResponse(res, {
      reviewId: review.id,
      customerId: customerId,
      userId: userId,
      rating: ratingNumber,
      message: message,
      action: action,
      status: 'success'
    }, `Review ${action} successfully`, action === 'created' ? 201 : 200);

  } catch (error) {
    console.error('Add review error:', error);
    return errorResponse(res, 'Failed to add review', 500);
  }
};

module.exports = {
  sendText,
  sendRatingRequest,
  processRating,
  handleButtonInteraction,
  addReview
};
