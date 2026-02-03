const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { calculateRecurringDates: getRecurringDates } = require('../lib/recurrenceHelper');
const {
  filterRecurringDatesByAvailability,
  filterRecurringDatesByExistingAppointments,
} = require('../lib/availabilityHelper');
const N8nMessageService = require('../services/N8nMessageService');
const { createWhatsappMessageRecord } = require('./whatsappMessageController');
const { stripe } = require('../lib/stripe');
const { constants } = require('../config');

// Helper function to format Israeli phone numbers
const formatIsraeliPhone = (phoneNumber) => {
  if (!phoneNumber) return null;

  // Remove any existing country code or special characters
  let cleanPhone = phoneNumber.toString().replace(/[\s\-\(\)\+]/g, '');

  // If phone already starts with 972, just add +
  if (cleanPhone.startsWith('972')) {
    return `+${cleanPhone}`;
  }

  // If phone starts with 0, remove it and add +972
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  // Add Israel country code +972
  return `+972${cleanPhone}`;
};

// Helper function to check if user has active subscription
// Import reusable subscription check utility
const { checkUserSubscription } = require('../lib/subscriptionUtils');

// Handle appointment webhook - store any data without validation
const handleAppointmentWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    console.log('calmark webhookData', webhookData);

    // Check if business exists in User table FIRST - before ANY database operations
    let existingUser = null;
    if (webhookData.BusinessName) {
      console.log('Inside', webhookData.BusinessName);
      existingUser = await prisma.user.findFirst({
        where: {
          businessName: webhookData.BusinessName
        },
        select: {
          id: true,
          businessName: true
        }
      });
    }

  console.log('existingUser', existingUser);
    // If business doesn't exist, return error immediately - NO data should be stored
    if (!existingUser) {
      return errorResponse(res, `Business '${webhookData.BusinessName}' not found. Please create user first.`, 400);
    }

    // Check if user has active subscription - block data entry if subscription is not active
    // This check MUST happen BEFORE storing any data (webhook log, customer, appointment, etc.)
    const user = await prisma.user.findUnique({
      where: { id: existingUser.id },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        role: true,
        stripeSubscriptionId: true
      }
    });

    if (user) {
      const subscriptionCheck = await checkUserSubscription(user);
      if (!subscriptionCheck.hasActiveSubscription) {
        const errorMessage = subscriptionCheck.reason === 'Subscription expired'
          ? `Subscription expired. Business '${webhookData.BusinessName}' subscription has expired. Appointment webhook cannot be processed. Please renew to continue.`
          : `Active subscription required. Business '${webhookData.BusinessName}' does not have an active subscription. Appointment webhook cannot be processed.`;
        return errorResponse(res, errorMessage, 403);
      }
    }

    // Check if customer exists in Customers table
    let existingCustomer = null;

    // Check only by CustomerPhone
    if (webhookData.CustomerPhone) {
      const formattedPhone = formatIsraeliPhone(webhookData.CustomerPhone);

      existingCustomer = await prisma.customers.findFirst({
        where: {
          customerPhone: formattedPhone
        },
        select: {
          id: true,
          employeeId: true,
          customerFullName: true,
          customerPhone: true
        }
      });
    }

    let userId = existingUser.id;
    let customerId;


    // Helper function to parse date safely
    const parseDateSafely = (dateString) => {
      if (!dateString) return null;

      try {
        // Handle format: "12/08/2025 19:30"
        const [datePart, timePart] = dateString.split(' ');
        const [day, month, year] = datePart.split('/');

        // Create date in format: YYYY-MM-DD HH:MM:SS
        const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart || '00:00'}:00`;

        const parsedDate = new Date(formattedDate);

        // Check if date is valid
        if (isNaN(parsedDate.getTime())) {
          return null;
        }

        return parsedDate;
      } catch (error) {
        return null;
      }
    };
    // If customer doesn't exist, create new customer
    if (!existingCustomer) {
      const formattedPhone = formatIsraeliPhone(webhookData.CustomerPhone);
      const newCustomer = await prisma.customers.create({
        data: {
          firstName: webhookData.CustomerFullName ? webhookData.CustomerFullName.split(' ')[0] : null,
          lastName: webhookData.CustomerFullName ? webhookData.CustomerFullName.split(' ').slice(1).join(' ') : null,
          customerPhone: formattedPhone,
          email: webhookData.CustomerEmail || null,
          appointmentCount: webhookData.AppointmentCount || 0,
          customerFullName: webhookData.CustomerFullName || null,
          selectedServices: webhookData.SelectedServices || null,
          endDate: parseDateSafely(webhookData.EndDate),
          duration: webhookData.Duration || null,
          startDate: parseDateSafely(webhookData.StartDate),
          businessId: webhookData.BusinessId || null,
          employeeId: webhookData.EmployeeId || null,
          businessName: webhookData.BusinessName || null,
          userId: userId // Reference to User table
        }
      });
      customerId = newCustomer.id;
    } else {
      customerId = existingCustomer.id;
    }


    // Now add appointment data to Appointment table
    const appointmentData = {
      source: webhookData.Source || null,
      endDate: parseDateSafely(webhookData.EndDate),
      duration: webhookData.Duration || null,
      startDate: parseDateSafely(webhookData.StartDate),
      createDate: parseDateSafely(webhookData.CreateDate),
      customerId: customerId,
      userId: userId,
      customerNote: webhookData.CustomerNote || null,
      selectedServices: webhookData.SelectedServices || null
    };

    const newAppointment = await prisma.appointment.create({
      data: appointmentData
    });

    // Check if CustomerUser record already exists (customerId + userId combination)
    let existingCustomerUser = await prisma.customerUser.findFirst({
      where: {
        customerId: customerId,
        userId: userId
      }
    });

    let customerUserId;

    if (existingCustomerUser) {
      // Keep existing status - no status update on appointment webhook
      // Status updates (lost/risk to recovered, new to active) happen only on payment checkout webhook
      customerUserId = existingCustomerUser.id;
    } else {
      // Check if customerId exists but with different userId
      const customerWithDifferentUser = await prisma.customerUser.findFirst({
        where: {
          customerId: customerId
        }
      });

      if (customerWithDifferentUser) {
        // Customer exists with different user, create new record with status 'new'
        const newCustomerUser = await prisma.customerUser.create({
          data: {
            customerId: customerId,
            userId: userId,
            status: constants.CUSTOMER_STATUS.NEW
          }
        });
        customerUserId = newCustomerUser.id;

        // Create CustomerStatusLog for new customer status
        await prisma.customerStatusLog.create({
          data: {
            customerId: customerId,
            userId: userId,
            oldStatus: null, // First status entry
            newStatus: 'New',
            reason: 'New appointment booked'
          }
        });
      } else {
        // First time customer-user relation, create with status 'new'
        const newCustomerUser = await prisma.customerUser.create({
          data: {
            customerId: customerId,
            userId: userId,
            status: constants.CUSTOMER_STATUS.NEW
          }
        });
        customerUserId = newCustomerUser.id;

        // Create CustomerStatusLog for new customer status
        await prisma.customerStatusLog.create({
          data: {
            customerId: customerId,
            userId: userId,
            oldStatus: null, // First status entry
            newStatus: 'New',
            reason: 'New appointment booked'
          }
        });
      }
    }

    // Duplicate recovery notification code removed - already handled above



    return successResponse(res, {
      userId: userId,
      customerId: customerId,
      appointmentId: newAppointment.id,
      customerUserId: customerUserId,
      message: 'Appointment webhook processed successfully - Customer, Appointment and Customer-User relation created',
      data: webhookData
    }, 'Appointment webhook processed successfully', 201);

  } catch (error) {
    console.error('Appointment webhook error:', error);
    return errorResponse(res, 'Failed to process appointment webhook', 500);
  }
};

// Handle rating webhook - store customer rating data
const handleRatingWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    // Extract actual data
    const actualData = webhookData;

    if (!actualData) {
      return errorResponse(res, 'Invalid webhook data structure', 400);
    }

    // Validate RatingId/review_id before creating log (paymentId is optional fallback)
    if (!actualData.RatingId && !actualData.review_id && !actualData.paymentId) {
      return errorResponse(res, 'Rating ID, Review ID or Payment ID is required', 400);
    }

    // 2. Find customer by CustomerFullName or BusinessId + EmployeeId
    let userId = null;
    let customerId = null;

    // First try to find by CustomerFullName (exact match)
    if (actualData.CustomerFullName) {
      const existingCustomerByName = await prisma.customers.findFirst({
        where: {
          customerFullName: actualData.CustomerFullName
        },
        select: {
          id: true,
          businessId: true,
          employeeId: true,
          userId: true,
          customerFullName: true
        }
      });

      if (existingCustomerByName) {
        customerId = existingCustomerByName.id;
        userId = existingCustomerByName.userId;
      }
    }

    // If not found by name, try by BusinessId AND EmployeeId
    if (!customerId && actualData.BusinessId && actualData.EmployeeId) {
      console.log('Inside', actualData.BusinessId, actualData.EmployeeId);
      const existingCustomer = await prisma.customers.findFirst({
        where: {
          AND: [
            { businessId: parseInt(actualData.BusinessId) },
            { employeeId: parseInt(actualData.EmployeeId) }
          ]
        },
        select: {
          id: true,
          businessId: true,
          employeeId: true,
          userId: true
        }
      });
      console.log('existingCustomer', existingCustomer);
      if (existingCustomer) {
        customerId = existingCustomer.id;
        userId = existingCustomer.userId;
      }
    }

    // 3. Find review by RatingId, review_id OR paymentId (payment webhook ID)
    let existingReview = null;
    let reviewId = null;

    // Priority 1: If RatingId is provided, use it
    if (actualData.RatingId) {
      existingReview = await prisma.review.findUnique({
        where: { id: actualData.RatingId },
        select: { id: true, customerId: true, userId: true }
      });
      
      if (existingReview) {
        reviewId = existingReview.id;
        // Update customerId and userId from review if not already set
        if (!customerId && existingReview.customerId) {
          customerId = existingReview.customerId;
        }
        if (!userId && existingReview.userId) {
          userId = existingReview.userId;
        }
      }
    }

    // Priority 2: If review_id is provided and RatingId not found, use it
    if (!existingReview && actualData.review_id) {
      existingReview = await prisma.review.findUnique({
        where: { id: actualData.review_id },
        select: { id: true, customerId: true, userId: true }
      });
      
      if (existingReview) {
        reviewId = existingReview.id;
        // Update customerId and userId from review if not already set
        if (!customerId && existingReview.customerId) {
          customerId = existingReview.customerId;
        }
        if (!userId && existingReview.userId) {
          userId = existingReview.userId;
        }
      }
    }

    // Priority 3: If paymentId (payment webhook ID) is provided and RatingId/review_id not found, find review by paymentWebhookId
    if (!existingReview && actualData.paymentId) {
      existingReview = await prisma.review.findFirst({
        where: { paymentWebhookId: actualData.paymentId },
        select: { id: true, customerId: true, userId: true }
      });
      
      if (existingReview) {
        reviewId = existingReview.id;
        // Update customerId and userId from review if not already set
        if (!customerId && existingReview.customerId) {
          customerId = existingReview.customerId;
        }
        if (!userId && existingReview.userId) {
          userId = existingReview.userId;
        }
      }
    }

    // Validate that review was found
    if (!existingReview) {
      const errorMsg = actualData.RatingId || actualData.review_id || actualData.paymentId
        ? 'Invalid Rating ID, Review ID or Payment ID - review not found'
        : 'Either Rating ID, Review ID or Payment ID is required';
      return errorResponse(res, errorMsg, 404);
    }

    // Check if user has active subscription - block rating processing if subscription is not active
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionExpirationDate: true,
          role: true,
          stripeSubscriptionId: true
        }
      });

      if (user) {
        const subscriptionCheck = await checkUserSubscription(user);
        if (!subscriptionCheck.hasActiveSubscription) {
          const errorMessage = subscriptionCheck.reason === 'Subscription expired'
            ? 'Subscription expired. Rating cannot be processed. Please renew subscription to continue.'
            : 'Active subscription required. Rating cannot be processed without an active subscription.';
          return errorResponse(res, errorMessage, 403);
        }
      }
    }

    // 4. Store rating data in Review table (UPDATE existing review)
    if (actualData.Rating && reviewId) {
      console.log('Inside', customerId, actualData.Rating, 'Updating review ID:', reviewId);
      const review = await prisma.review.update({
        where: { id: reviewId }, // Use reviewId (already found from RatingId or paymentId)
        data: {
          rating: parseInt(actualData.Rating) || 0,
          message: actualData.Comment || actualData.Feedback || '',
          status: 'received', // received, processed, responded
          whatsappMessageId: actualData.WhatsappMessageId || null,
          messageStatus: 'received' // sent, delivered, read, failed
        }
      });
      reviewId = review.id;
    }

    return successResponse(res, {
      CustomerFullName: actualData.CustomerFullName || null,
      BusinessId: actualData.BusinessId ? parseInt(actualData.BusinessId) : null,
      EmployeeId: actualData.EmployeeId ? parseInt(actualData.EmployeeId) : null,
      Rating: actualData.Rating ? parseInt(actualData.Rating) : null,
      Comment: actualData.Comment || null,
      Feedback: actualData.Feedback || null,
      review_id: reviewId,
      customerId: customerId,
      userId: userId,
      ratingStored: reviewId ? true : false,
      message: 'Rating webhook processed successfully'
    }, 'Rating webhook processed successfully', 201);

  } catch (error) {
    console.error('Rating webhook error:', error);
    return errorResponse(res, 'Failed to process rating webhook', 500);
  }
};

// Handle payment checkout webhook - store data in both WebhookPaymentLog and PaymentWebhook tables
const handlePaymentCheckoutWebhook = async (req, res) => {
  try {
    const webhookData = req.body;

    // Extract actual data - webhookData is the actual data itself
    const actualData = webhookData;

    if (!actualData) {
      return errorResponse(res, 'Invalid webhook data structure', 400);
    }

    // FIRST: Find userId to check subscription BEFORE storing any data
    let userId = null;
    let customerId = null;

    // Try to find user by BusinessName first (if provided) to check subscription immediately
    if (actualData.BusinessName) {
      const existingUser = await prisma.user.findFirst({
        where: {
          businessName: actualData.BusinessName
        },
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionExpirationDate: true,
          role: true,
          stripeSubscriptionId: true
        }
      });

      if (existingUser) {
        userId = existingUser.id;
        
        // Check subscription immediately for this user BEFORE storing any data
        const subscriptionCheck = await checkUserSubscription(existingUser);
        if (!subscriptionCheck.hasActiveSubscription) {
          const errorMessage = subscriptionCheck.reason === 'Subscription expired'
            ? `Subscription expired. Business '${actualData.BusinessName}' subscription has expired. Payment webhook cannot be processed. Please renew to continue.`
            : `Active subscription required. Business '${actualData.BusinessName}' does not have an active subscription. Payment webhook cannot be processed.`;
          return errorResponse(res, errorMessage, 403);
        }
      }
    }

    // MANDATORY: Find customer ONLY by CustomerPhone - Payment will be stored ONLY if phone matches
    // CustomerPhone is REQUIRED and must match exactly in customers table
    if (!actualData.CustomerPhone) {
      return errorResponse(res, 'CustomerPhone is required. Cannot process payment webhook without customer phone number.', 400);
    }

    const formattedPhone = formatIsraeliPhone(actualData.CustomerPhone);
    
    // Find customer ONLY by phone number - no fallback searches
    const existingCustomerByPhone = await prisma.customers.findFirst({
      where: {
        customerPhone: formattedPhone
      },
      select: {
        id: true,
        businessId: true,
        employeeId: true,
        userId: true,
        customerFullName: true,
        customerPhone: true
      }
    });

    // If customer not found by phone, REJECT webhook - NO payment data will be stored
    if (!existingCustomerByPhone) {
      return errorResponse(res, `Customer not found. Payment webhook rejected because CustomerPhone '${actualData.CustomerPhone}' (formatted: '${formattedPhone}') does not exist in customers table. Payment will not be stored.`, 404);
    }

    // Customer found by phone - proceed with payment storage
    customerId = existingCustomerByPhone.id;
    if (!userId) {
      userId = existingCustomerByPhone.userId;
    }

    // If still no userId found, reject the webhook - NO data will be stored
    if (!userId) {
      return errorResponse(res, 'User not found. Cannot process payment webhook without valid user.', 404);
    }

    // MANDATORY FINAL subscription check - ALWAYS verify subscription for the userId that will be used
    // This ensures subscription is checked even if userId changed during customer lookup
    // OR if userId was found from customer lookup and BusinessName check was skipped
    const finalUserCheck = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        role: true,
        stripeSubscriptionId: true
      }
    });

    if (!finalUserCheck) {
      return errorResponse(res, 'User not found. Cannot process payment webhook without valid user.', 404);
    }

    // Block if user is not admin and subscription is not active - return early, NO data will be stored
    const subscriptionCheck = await checkUserSubscription(finalUserCheck);
    if (!subscriptionCheck.hasActiveSubscription) {
      const errorMessage = subscriptionCheck.reason === 'Subscription expired'
        ? 'Subscription expired. Payment cannot be processed. Please renew subscription to continue.'
        : 'Active subscription required. Payment cannot be processed without an active subscription.';
      return errorResponse(res, errorMessage, 403);
    }

    // NOW store in WebhookPaymentLog table (raw log data) - only AFTER subscription check passes
    // If subscription check fails, function returns early and this code never executes
    const paymentLog = await prisma.webhookPaymentLog.create({
      data: {
        data: webhookData,
        type: constants.WEBHOOK_TYPES.PAYMENT_CHECKOUT,
        createdDate: new Date()
      }
    });

    // 4. Get customer status from CustomerUser table before creating PaymentWebhook
    // Determine revenuePaymentStatus based on current status and what it will become after payment
    let revenuePaymentStatus = null;
    let previousStatus = null;
    if (customerId) {
      const customerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: customerId
        },
        select: {
          status: true
        }
      });

      if (customerUser && customerUser.status) {
        previousStatus = customerUser.status;
        
        // If customer is already recovered, payment is from recovered customer
        if (customerUser.status === constants.CUSTOMER_STATUS.RECOVERED) {
          revenuePaymentStatus = constants.CUSTOMER_STATUS.RECOVERED;
        }
        // If customer is lost/at_risk/risk, this payment will RECOVER them
        // So set revenuePaymentStatus = 'recovered' (this payment is recovery revenue)
        else if (customerUser.status === constants.CUSTOMER_STATUS.LOST || customerUser.status === constants.CUSTOMER_STATUS.AT_RISK || customerUser.status === constants.CUSTOMER_STATUS.RISK) {
          revenuePaymentStatus = constants.CUSTOMER_STATUS.RECOVERED; // This payment recovers the customer
        }
        // For other statuses (new, active), leave as null
      }
    }

    // 5. Store structured data in PaymentWebhook table with userId and customerId
    const paymentWebhook = await prisma.paymentWebhook.create({
      data: {
        total: parseFloat(actualData.Total) || 0.00,
        totalWithoutVAT: parseFloat(actualData.TotalWithoutVAT) || 0.00,
        totalVAT: parseFloat(actualData.TotalVAT) || 0.00,
        employeeId: parseInt(actualData.EmployeeId) || null,
        businessId: parseInt(actualData.BusinessId) || null,
        customerId: customerId, // Reference to Customers table
        userId: userId, // Reference to User table
        paymentDate: new Date(),
        status: 'success',
        customerOldStatus: previousStatus || null, // Previous customer status before payment
        revenuePaymentStatus: revenuePaymentStatus // Set based on CustomerUser status
      }
    });


    // Update CustomerUser status after payment
    // Handles: 'new' to 'active', 'lost'/'at_risk' to 'recovered'
    if (customerId && userId) {
      try {
        // Check if CustomerUser record exists
        const existingCustomerUser = await prisma.customerUser.findFirst({
          where: {
            customerId: customerId,
            userId: userId
          },
          select: {
            id: true,
            status: true
          }
        });

        if (existingCustomerUser) {
          // Use previousStatus from earlier query, or get from existingCustomerUser if not set
          const currentPreviousStatus = previousStatus || existingCustomerUser.status;
          let newStatus = null;
          let statusChangeReason = null;

          // Handle lost/at_risk to recovered
          if (currentPreviousStatus === constants.CUSTOMER_STATUS.LOST || currentPreviousStatus === constants.CUSTOMER_STATUS.AT_RISK || currentPreviousStatus === constants.CUSTOMER_STATUS.RISK) {
            newStatus = constants.CUSTOMER_STATUS.RECOVERED;
            statusChangeReason = `Payment received after being ${currentPreviousStatus === constants.CUSTOMER_STATUS.LOST ? 'lost' : 'at risk'}`;
          }
          // Handle new to active
          else if (currentPreviousStatus === constants.CUSTOMER_STATUS.NEW) {
            newStatus = constants.CUSTOMER_STATUS.ACTIVE;
            statusChangeReason = 'First payment received';
          }

          // Update status if there's a change
          if (newStatus) {
            await prisma.customerUser.update({
              where: {
                id: existingCustomerUser.id
              },
              data: {
                status: newStatus
              }
            });

            // Create CustomerStatusLog for status transition
            await prisma.customerStatusLog.create({
              data: {
                customerId: customerId,
                userId: userId,
                oldStatus: currentPreviousStatus === constants.CUSTOMER_STATUS.LOST ? 'Lost' : (currentPreviousStatus === constants.CUSTOMER_STATUS.AT_RISK || currentPreviousStatus === constants.CUSTOMER_STATUS.RISK ? 'Risk' : 'New'),
                newStatus: newStatus === constants.CUSTOMER_STATUS.RECOVERED ? 'Recovered' : 'Active',
                reason: statusChangeReason
              }
            });

            console.log(`✅ Customer status updated from '${currentPreviousStatus}' to '${newStatus}' after payment - Customer ID: ${customerId}`);

            // Send recovered customer notification if status changed to recovered
            if (newStatus === constants.CUSTOMER_STATUS.RECOVERED) {
              try {
                const businessOwner = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { phoneNumber: true, businessName: true, businessType: true, whatsappNumber: true }
                });

                if (businessOwner && (businessOwner.phoneNumber || businessOwner.whatsappNumber)) {
                  const customer = await prisma.customers.findUnique({
                    where: { id: customerId },
                    select: { customerFullName: true, customerPhone: true, selectedServices: true }
                  });

                  if (customer) {
                    // Use createWhatsappMessageRecord to ensure subscription check before sending notification
                    const whatsappMessageRecord = await createWhatsappMessageRecord(
                      customer.customerFullName,
                      customer.customerPhone,
                      'recovered',
                      userId
                    );

                    // Only trigger N8N notification if subscription check passed (record was created)
                    if (whatsappMessageRecord) {
                      const n8nService = new N8nMessageService();
                      const webhookParams = {
                        customerName: customer.customerFullName,
                        customerPhone: customer.customerPhone,
                        businessName: businessOwner.businessName || 'Business',
                        businessType: businessOwner.businessType || 'general',
                        customerService: customer.selectedServices || '',
                        businessOwnerPhone: businessOwner.phoneNumber,
                        lastVisitDate: new Date().toISOString().split('T')[0],
                        whatsappPhone: customer.customerPhone,
                        previousStatus: currentPreviousStatus
                      };

                      await n8nService.triggerRecoveredCustomerNotification(webhookParams);
                      console.log(`✅ N8n recovered customer notification triggered for: ${customer.customerFullName} (${currentPreviousStatus} → recovered)`);
                    } else {
                      console.log(`⚠️ Recovered customer notification not sent - Subscription check failed for user ${userId}`);
                    }
                  }
                }
              } catch (notificationError) {
                console.error('❌ Error triggering n8n recovered customer notification:', notificationError);
                // Don't fail the webhook if notification fails
              }
            }
          }
        }
      } catch (statusUpdateError) {
        console.error('❌ Error updating customer status after payment:', statusUpdateError);
        // Don't fail the webhook if status update fails
      }
    }

    // If customerId is found, trigger n8n review request
    if (customerId) {
      try {
        // Get customer details for n8n webhook
        const customer = await prisma.customers.findUnique({
          where: { id: customerId },
          include: {
            user: {
              select: {
                businessName: true,
                businessType: true,
                phoneNumber: true,
                whatsappNumber: true
              }
            }
          }
        });


        if (customer) {
          const n8nService = new N8nMessageService();
          
          // Determine if customer is new or active based on previous orders/payments
          const previousPayments = await prisma.paymentWebhook.count({
            where: {
              customerId: customerId,
              createdAt: {
                lt: new Date()
              }
            }
          });

          const customerStatus = previousPayments === 0 ? constants.CUSTOMER_STATUS.NEW : constants.CUSTOMER_STATUS.ACTIVE;

          const webhookParams = {
            customer_name: customer.customerFullName,
            customer_phone: customer.customerPhone,
            business_name: customer.user?.businessName || 'Business',
            business_type: customer.user?.businessType || 'general',
            customer_service: customer.selectedServices || '',
            business_owner_phone: customer.user?.phoneNumber,
            last_visit_date: new Date().toISOString().split('T')[0],
            whatsapp_phone: customer.customerPhone,
            customer_status: customerStatus
          };

          // Check if user has active subscription before sending review request WhatsApp message
          if (userId) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: {
                id: true,
                subscriptionStatus: true,
                subscriptionExpirationDate: true,
                role: true
              }
            });

            if (user && user.role !== constants.ROLES.ADMIN) {
              const subscriptionStatus = user.subscriptionStatus?.toLowerCase();
              
              // Block if subscription is not active
              if (!subscriptionStatus || 
                  subscriptionStatus === constants.SUBSCRIPTION_STATUS.PENDING || 
                  subscriptionStatus === constants.SUBSCRIPTION_STATUS.CANCELED || 
                  subscriptionStatus === constants.SUBSCRIPTION_STATUS.INACTIVE ||
                  subscriptionStatus === constants.SUBSCRIPTION_STATUS.EXPIRED) {
                console.error(`❌ Subscription check failed for user ${userId} - Status: ${subscriptionStatus} - Review request WhatsApp message NOT sent`);
                // Don't create review record or send message if subscription is not active
                return successResponse(res, {
                  webhookId: paymentLog.id,
                  paymentId: paymentWebhook.id,
                  message: 'Payment processed successfully, but review request not sent due to inactive subscription'
                }, 'Payment processed, but review request blocked due to inactive subscription', 200);
              }

              // Check expiration date
              if (user.subscriptionExpirationDate) {
                const now = new Date();
                const expirationDate = new Date(user.subscriptionExpirationDate);
                if (expirationDate < now) {
                  console.error(`❌ Subscription expired for user ${userId} - Review request WhatsApp message NOT sent`);
                  return successResponse(res, {
                    webhookId: paymentLog.id,
                    paymentId: paymentWebhook.id,
                    message: 'Payment processed successfully, but review request not sent due to expired subscription'
                  }, 'Payment processed, but review request blocked due to expired subscription', 200);
                }
              }
            }
          }

          // Create review record first, then trigger N8N with review_id
          // Note: WhatsApp messaging is handled by N8N only
          try {
            const reviewRecord = await prisma.review.create({
              data: {
                customerId: customerId,
                userId: userId,
                rating: 0, // Placeholder - will be updated when customer responds
                message: `Rating request sent via N8N after payment`,
                status: constants.REVIEW_STATUS.SENT, // sent, received, responded
                whatsappMessageId: null, // Will be updated by N8N if needed
                messageStatus: constants.WEBHOOK_STATUS.PENDING, // pending, sent, delivered, read
                paymentWebhookId: paymentWebhook.id // Link to payment webhook
              }
            });
            
            console.log(`✅ Review record created with ID: ${reviewRecord.id}`);
            
            // Store WhatsApp message record BEFORE triggering N8N
            // If subscription check fails, createWhatsappMessageRecord will return null
            const whatsappMessageRecord = await createWhatsappMessageRecord(
              customer.customerFullName,
              customer.customerPhone,
              'review_request',
              userId
            );

            // Only proceed with N8N trigger and Stripe reporting if WhatsApp message record was created
            // (which means subscription check passed)
            if (!whatsappMessageRecord) {
              console.log(`⚠️ Review request WhatsApp message not sent - Subscription check failed for user ${userId}`);
              // Don't trigger N8N or report to Stripe if subscription check failed
              return successResponse(res, {
                webhookId: paymentLog.id,
                paymentId: paymentWebhook.id,
                message: 'Payment processed successfully, but review request not sent due to inactive subscription'
              }, 'Payment processed, but review request blocked due to inactive subscription', 200);
            }
            
            // Report usage to Stripe meter (real-time reporting when payment received)
            // Using same logic as reportUsageForMonth cron job
            try {
              if (userId) {
                const userWithStripe = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { 
                    id: true, 
                    email: true, 
                    stripeSubscriptionId: true
                  }
                });

                if (userWithStripe && userWithStripe.stripeSubscriptionId) {
                  // Get subscription with expanded price and product (same as cron job)
                  const subscription = await stripe.subscriptions.retrieve(userWithStripe.stripeSubscriptionId, {
                    expand: ['items.data.price.product']
                  });
                  
                  // Find the metered subscription item (WhatsApp messages)
                  const meteredItem = subscription.items.data.find(item => 
                    item.price?.recurring?.usage_type === 'metered'
                  );

                  if (!meteredItem) {
                    console.log(`⚠️  No metered subscription item found for user ${userWithStripe.email} - skipping`);
                  } else {
                    // Get event name dynamically from price metadata, product metadata, or use default
                    // Priority: price.metadata.event_name > product.metadata.event_name > default "whatsapp_message"
                    let eventName = "whatsapp_message"; // Default fallback
                    
                    // Try to get event name from price metadata
                    if (meteredItem.price?.metadata?.event_name) {
                      eventName = meteredItem.price.metadata.event_name;
                      console.log(`📋 Event name from price metadata: ${eventName}`);
                    } 
                    // Try to get event name from product metadata
                    else if (meteredItem.price?.product) {
                      let product = meteredItem.price.product;
                      if (typeof product === 'string') {
                        try {
                          product = await stripe.products.retrieve(product);
                        } catch (error) {
                          console.error(`❌ Error fetching product for event name:`, error.message);
                        }
                      }
                      if (product && typeof product === 'object' && product.metadata?.event_name) {
                        eventName = product.metadata.event_name;
                        console.log(`📋 Event name from product metadata: ${eventName}`);
                      }
                    }
                    
                    console.log(`📋 Using event name: ${eventName}`);

                    // Get Stripe customer ID from subscription (same as cron job)
                    const stripeCustomerId = subscription.customer;
                    if (!stripeCustomerId) {
                      console.error(`❌ No customer ID found in subscription for user ${userWithStripe.email}`);
                    } else {
                      // Extract customer ID if it's an object
                      const customerId = typeof stripeCustomerId === 'string' 
                        ? stripeCustomerId 
                        : stripeCustomerId?.id;
                      
                      console.log(`📋 Stripe Customer ID: ${customerId}`);

                      // Create meter event for real-time usage tracking (same as cron job)
                      const usageEvent = await stripe.billing.meterEvents.create({
                        event_name: eventName,
                        payload: {
                          stripe_customer_id: customerId,
                          subscription_item: meteredItem.id,
                          value: 1, // One unit per message
                          timestamp: Math.floor(Date.now() / 1000) // Current timestamp
                        }
                      });

                      console.log(`✅ Real-time usage reported to Stripe meter: ${eventName} for user ${userWithStripe.email} (payment webhook)`);
                      console.log(`📋 Event ID: ${usageEvent.id}`);
                    }
                  }
                }
              }
            } catch (stripeError) {
              console.error('❌ Error reporting usage to Stripe (payment webhook):', stripeError.message);
              // Don't fail the webhook if Stripe reporting fails
            }
            
            // Trigger N8N with review_id - N8N will handle WhatsApp messaging
            await n8nService.triggerReviewRequest({
              ...webhookParams,
              review_id: reviewRecord.id, // ✅ Pass review ID to n8n
              payment_webhook_id: paymentWebhook.id // Also pass payment webhook ID
            });
            
            console.log(`✅ Review record, whatsappMessage record created, Stripe usage reported and N8N triggered with paymentWebhookId: ${paymentWebhook.id} and review_id: ${reviewRecord.id}`);
          } catch (reviewError) {
            console.error('❌ Error creating review record or triggering N8N:', reviewError);
            // Don't fail webhook if review record creation or N8N fails
          }
        }
      } catch (webhookError) {
        console.error('❌ Error triggering n8n review request after payment:', webhookError);
        // Don't fail the webhook if n8n fails
      }
    }

    return successResponse(res, {
      webhookId: paymentLog.id,
      paymentId: paymentWebhook.id,
      userId: userId,
      customerId: customerId,
      message: 'Payment checkout webhook received successfully',
      data: actualData,
      whatsappReviewSent: customerId ? true : false
    }, 'Payment checkout webhook processed successfully', 201);

  } catch (error) {
    console.error('Payment checkout webhook error:', error);
    return errorResponse(res, 'Failed to process payment checkout webhook', 500);
  }
};

// Create payment (authenticated users only) - similar to createAppointment
const createPayment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    const {
      customerId,
      customerPhone,
      total,
      totalWithoutVAT,
      totalVAT,
      employeeId,
      businessId,
      paymentDate
    } = req.body;

    // Validate required fields
    if (!customerId && !customerPhone) {
      return errorResponse(res, 'Either customerId or customerPhone is required', 400);
    }

    if (!total && total !== 0) {
      return errorResponse(res, 'Total amount is required', 400);
    }

    // Get customer data
    let finalCustomerId = customerId;
    let finalUserId = userId;

    // If customerPhone is provided but no customerId, find customer
    if (!finalCustomerId && customerPhone) {
      const formattedPhone = formatIsraeliPhone(customerPhone);
      
      // Find existing customer by phone
      let existingCustomer = await prisma.customers.findFirst({
        where: {
          customerPhone: formattedPhone
        }
      });

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
        finalUserId = existingCustomer.userId || userId;
      } else {
        return errorResponse(res, 'Customer not found. Please create customer first.', 404);
      }
    } else if (finalCustomerId) {
      // Verify customer exists and belongs to user
      const customer = await prisma.customers.findUnique({
        where: { id: finalCustomerId },
        select: { id: true, userId: true }
      });

      if (!customer) {
        return errorResponse(res, 'Customer not found', 404);
      }

      // Verify customer belongs to the same business (unless admin)
      if (userRole !== constants.ROLES.ADMIN && customer.userId !== userId) {
        return errorResponse(res, 'Customer does not belong to your business', 403);
      }

      finalUserId = customer.userId || userId;
    }

    // Check subscription for the user
    const user = await prisma.user.findUnique({
      where: { id: finalUserId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        role: true,
        stripeSubscriptionId: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    const subscriptionCheck = await checkUserSubscription(user);
    if (!subscriptionCheck.hasActiveSubscription) {
      const errorMessage = subscriptionCheck.reason === 'Subscription expired'
        ? 'Subscription expired. Payment cannot be processed. Please renew subscription to continue.'
        : 'Active subscription required. Payment cannot be processed without an active subscription.';
      return errorResponse(res, errorMessage, 403);
    }

    // Store in WebhookPaymentLog table (raw log data)
    const paymentLogData = {
      BusinessName: user.businessName || null,
      CustomerPhone: customerPhone ? formatIsraeliPhone(customerPhone) : null,
      Total: parseFloat(total) || 0.00,
      TotalWithoutVAT: parseFloat(totalWithoutVAT) || 0.00,
      TotalVAT: parseFloat(totalVAT) || 0.00,
      EmployeeId: employeeId ? parseInt(employeeId) : null,
      BusinessId: businessId ? parseInt(businessId) : null,
      PaymentDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString()
    };

    const paymentLog = await prisma.webhookPaymentLog.create({
      data: {
        data: paymentLogData,
        type: constants.WEBHOOK_TYPES.PAYMENT_CHECKOUT,
        createdDate: new Date()
      }
    });

    // Get customer status from CustomerUser table before creating PaymentWebhook
    let revenuePaymentStatus = null;
    let previousStatus = null;
    if (finalCustomerId) {
      const customerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: finalCustomerId,
          userId: finalUserId
        },
        select: {
          status: true
        }
      });

      if (customerUser && customerUser.status) {
        previousStatus = customerUser.status;
        
        // If customer is already recovered, payment is from recovered customer
        if (customerUser.status === constants.CUSTOMER_STATUS.RECOVERED) {
          revenuePaymentStatus = constants.CUSTOMER_STATUS.RECOVERED;
        }
        // If customer is lost/at_risk/risk, this payment will RECOVER them
        else if (customerUser.status === constants.CUSTOMER_STATUS.LOST || customerUser.status === constants.CUSTOMER_STATUS.AT_RISK || customerUser.status === constants.CUSTOMER_STATUS.RISK) {
          revenuePaymentStatus = constants.CUSTOMER_STATUS.RECOVERED; // This payment recovers the customer
        }
        // For other statuses (new, active), leave as null
      }
    }

    // Store structured data in PaymentWebhook table
    const paymentWebhook = await prisma.paymentWebhook.create({
      data: {
        total: parseFloat(total) || 0.00,
        totalWithoutVAT: parseFloat(totalWithoutVAT) || 0.00,
        totalVAT: parseFloat(totalVAT) || 0.00,
        employeeId: employeeId ? parseInt(employeeId) : null,
        businessId: businessId ? parseInt(businessId) : null,
        customerId: finalCustomerId,
        userId: finalUserId,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        status: 'success',
        customerOldStatus: previousStatus || null,
        revenuePaymentStatus: revenuePaymentStatus
      },
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            selectedServices: true,
            email: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        }
      }
    });

    // Update CustomerUser status after payment (same logic as webhook)
    if (finalCustomerId && finalUserId) {
      try {
        const existingCustomerUser = await prisma.customerUser.findFirst({
          where: {
            customerId: finalCustomerId,
            userId: finalUserId
          },
          select: {
            id: true,
            status: true
          }
        });

        if (existingCustomerUser) {
          const currentPreviousStatus = previousStatus || existingCustomerUser.status;
          let newStatus = null;
          let statusChangeReason = null;

          // Handle lost/at_risk to recovered
          if (currentPreviousStatus === constants.CUSTOMER_STATUS.LOST || currentPreviousStatus === constants.CUSTOMER_STATUS.AT_RISK || currentPreviousStatus === constants.CUSTOMER_STATUS.RISK) {
            newStatus = constants.CUSTOMER_STATUS.RECOVERED;
            statusChangeReason = `Payment received after being ${currentPreviousStatus === constants.CUSTOMER_STATUS.LOST ? 'lost' : 'at risk'}`;
          }
          // Handle new to active
          else if (currentPreviousStatus === constants.CUSTOMER_STATUS.NEW) {
            newStatus = constants.CUSTOMER_STATUS.ACTIVE;
            statusChangeReason = 'First payment received';
          }

          // Update status if there's a change
          if (newStatus) {
            await prisma.customerUser.update({
              where: {
                id: existingCustomerUser.id
              },
              data: {
                status: newStatus
              }
            });

            // Create CustomerStatusLog for status transition
            await prisma.customerStatusLog.create({
              data: {
                customerId: finalCustomerId,
                userId: finalUserId,
                oldStatus: currentPreviousStatus === constants.CUSTOMER_STATUS.LOST ? 'Lost' : (currentPreviousStatus === constants.CUSTOMER_STATUS.AT_RISK || currentPreviousStatus === constants.CUSTOMER_STATUS.RISK ? 'Risk' : 'New'),
                newStatus: newStatus === constants.CUSTOMER_STATUS.RECOVERED ? 'Recovered' : 'Active',
                reason: statusChangeReason
              }
            });

            console.log(`✅ Customer status updated from '${currentPreviousStatus}' to '${newStatus}' after payment - Customer ID: ${finalCustomerId}`);
          }
        }
      } catch (statusUpdateError) {
        console.error('❌ Error updating customer status after payment:', statusUpdateError);
        // Don't fail the payment if status update fails
      }
    }

    // Trigger review request if customerId is found (same logic as webhook)
    if (finalCustomerId) {
      try {
        const customer = await prisma.customers.findUnique({
          where: { id: finalCustomerId },
          include: {
            user: {
              select: {
                businessName: true,
                businessType: true,
                phoneNumber: true,
                whatsappNumber: true
              }
            }
          }
        });

        if (customer) {
          const n8nService = new N8nMessageService();
          
          // Determine if customer is new or active based on previous orders/payments
          const previousPayments = await prisma.paymentWebhook.count({
            where: {
              customerId: finalCustomerId,
              createdAt: {
                lt: new Date()
              }
            }
          });

          const customerStatus = previousPayments === 0 ? constants.CUSTOMER_STATUS.NEW : constants.CUSTOMER_STATUS.ACTIVE;

          const webhookParams = {
            customer_name: customer.customerFullName,
            customer_phone: customer.customerPhone,
            business_name: customer.user?.businessName || 'Business',
            business_type: customer.user?.businessType || 'general',
            customer_service: customer.selectedServices || '',
            business_owner_phone: customer.user?.phoneNumber,
            last_visit_date: new Date().toISOString().split('T')[0],
            whatsapp_phone: customer.customerPhone,
            customer_status: customerStatus
          };

          // Create review record first, then trigger N8N with review_id
          try {
            const reviewRecord = await prisma.review.create({
              data: {
                customerId: finalCustomerId,
                userId: finalUserId,
                rating: 0,
                message: `Rating request sent via N8N after payment`,
                status: 'sent',
                whatsappMessageId: null,
                messageStatus: constants.WEBHOOK_STATUS.PENDING,
                paymentWebhookId: paymentWebhook.id
              }
            });
            
            console.log(`✅ Review record created with ID: ${reviewRecord.id}`);
            
            // Store WhatsApp message record BEFORE triggering N8N
            const whatsappMessageRecord = await createWhatsappMessageRecord(
              customer.customerFullName,
              customer.customerPhone,
              'review_request',
              finalUserId
            );

            // Only proceed with N8N trigger and Stripe reporting if WhatsApp message record was created
            if (!whatsappMessageRecord) {
              console.log(`⚠️ Review request WhatsApp message not sent - Subscription check failed for user ${finalUserId}`);
              // Don't trigger N8N or report to Stripe if subscription check failed
            } else {
              // Report usage to Stripe meter (same logic as webhook)
              try {
                if (finalUserId) {
                  const userWithStripe = await prisma.user.findUnique({
                    where: { id: finalUserId },
                    select: { 
                      id: true, 
                      email: true, 
                      stripeSubscriptionId: true
                    }
                  });

                  if (userWithStripe && userWithStripe.stripeSubscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(userWithStripe.stripeSubscriptionId, {
                      expand: ['items.data.price.product']
                    });
                    
                    const meteredItem = subscription.items.data.find(item => 
                      item.price?.recurring?.usage_type === 'metered'
                    );

                    if (meteredItem) {
                      let eventName = "whatsapp_message";
                      
                      if (meteredItem.price?.metadata?.event_name) {
                        eventName = meteredItem.price.metadata.event_name;
                      } else if (meteredItem.price?.product) {
                        let product = meteredItem.price.product;
                        if (typeof product === 'string') {
                          try {
                            product = await stripe.products.retrieve(product);
                          } catch (error) {
                            console.error(`❌ Error fetching product for event name:`, error.message);
                          }
                        }
                        if (product && typeof product === 'object' && product.metadata?.event_name) {
                          eventName = product.metadata.event_name;
                        }
                      }

                      const stripeCustomerId = subscription.customer;
                      if (stripeCustomerId) {
                        const customerId = typeof stripeCustomerId === 'string' 
                          ? stripeCustomerId 
                          : stripeCustomerId?.id;
                        
                        const usageEvent = await stripe.billing.meterEvents.create({
                          event_name: eventName,
                          payload: {
                            stripe_customer_id: customerId,
                            subscription_item: meteredItem.id,
                            value: 1,
                            timestamp: Math.floor(Date.now() / 1000)
                          }
                        });

                        console.log(`✅ Real-time usage reported to Stripe meter: ${eventName} for user ${userWithStripe.email} (payment API)`);
                      }
                    }
                  }
                }
              } catch (stripeError) {
                console.error('❌ Error reporting usage to Stripe (payment API):', stripeError.message);
              }
              
              // Trigger N8N with review_id
              await n8nService.triggerReviewRequest({
                ...webhookParams,
                review_id: reviewRecord.id,
                payment_webhook_id: paymentWebhook.id
              });
              
              console.log(`✅ Review record, whatsappMessage record created, Stripe usage reported and N8N triggered with paymentWebhookId: ${paymentWebhook.id} and review_id: ${reviewRecord.id}`);
            }
          } catch (reviewError) {
            console.error('❌ Error creating review record or triggering N8N:', reviewError);
            // Don't fail payment if review record creation or N8N fails
          }
        }
      } catch (webhookError) {
        console.error('❌ Error triggering n8n review request after payment:', webhookError);
        // Don't fail the payment if n8n fails
      }
    }

    return successResponse(res, paymentWebhook, 'Payment created successfully', 201);

  } catch (error) {
    console.error('Create payment error:', error);
    return errorResponse(res, 'Failed to create payment', 500);
  }
};

// Get all payment webhooks
const getAllPaymentWebhooks = async (req, res) => {
  try {
    const { userId, customerId, status, page = 1, limit = 50 } = req.query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};
    if (userId) where.userId = userId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    // Get payment webhooks with pagination
    const paymentWebhooks = await prisma.paymentWebhook.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            selectedServices: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phoneNumber: true
          }
        },
        appointment: {
          select: {
            id: true,
            customerFullName: true,
            startDate: true,
            endDate: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    // Get total count
    const totalCount = await prisma.paymentWebhook.count({ where });

    return successResponse(res, {
      paymentWebhooks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, 'Payment webhooks retrieved successfully');

  } catch (error) {
    console.error('Get payment webhooks error:', error);
    return errorResponse(res, 'Failed to retrieve payment webhooks', 500);
  }
};

// Get payment webhook by ID
const getPaymentWebhookById = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentWebhook = await prisma.paymentWebhook.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            selectedServices: true,
            email: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phoneNumber: true,
            whatsappNumber: true
          }
        },
        appointment: {
          select: {
            id: true,
            customerFullName: true,
            startDate: true,
            endDate: true,
            duration: true,
            selectedServices: true
          }
        }
      }
    });

    if (!paymentWebhook) {
      return errorResponse(res, 'Payment webhook not found', 404);
    }

    return successResponse(res, paymentWebhook, 'Payment webhook retrieved successfully');

  } catch (error) {
    console.error('Get payment webhook by ID error:', error);
    return errorResponse(res, 'Failed to retrieve payment webhook', 500);
  }
};

// Get payment webhooks by customer ID
const getPaymentWebhooksByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = { customerId };
    if (status) where.status = status;

    // Get payment webhooks for this customer with pagination
    const paymentWebhooks = await prisma.paymentWebhook.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phoneNumber: true,
            whatsappNumber: true
          }
        },
        appointment: {
          select: {
            id: true,
            customerFullName: true,
            startDate: true,
            endDate: true,
            duration: true,
            selectedServices: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    // Get customer details
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        customerFullName: true,
        customerPhone: true,
        selectedServices: true,
        email: true,
        createdAt: true,
        appointmentCount: true
      }
    });

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Get total count
    const totalCount = await prisma.paymentWebhook.count({ where });

    // Calculate total revenue for this customer
    const totalRevenue = await prisma.paymentWebhook.aggregate({
      where: { customerId },
      _sum: { total: true },
      _count: { total: true }
    });

    return successResponse(res, {
      customer,
      paymentWebhooks,
      summary: {
        totalPayments: totalRevenue._count.total || 0,
        totalRevenue: totalRevenue._sum.total || 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, 'Payment webhooks retrieved successfully by customer ID');

  } catch (error) {
    console.error('Get payment webhooks by customer ID error:', error);
    return errorResponse(res, 'Failed to retrieve payment webhooks', 500);
  }
};

// Get all appointments
const getAllAppointments = async (req, res) => {
  try {
    const loggedInUserId = req.user.userId;
    const userRole = req.user.role;
    
    // Check if user is authenticated
    if (!loggedInUserId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    const { userId, customerId, staffId, start, end, page = 1, limit = 1000 } = req.query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};
    
    // Filter by userId - if admin with no userId = see all; admin with userId = filter; non-admin = own only
    if (userRole === constants.ROLES.ADMIN) {
      if (userId) where.userId = userId;
      // else: no userId filter = admin sees all appointments
    } else {
      where.userId = loggedInUserId;
    }
    
    if (customerId) where.customerId = customerId;
    // Filter by staffId (Staff relation)
    if (staffId) where.staffId = staffId;

    // Add date range filtering if provided
    // Filter by startDate range (appointments that overlap with the requested range)
    // An appointment overlaps if: startDate < end AND (endDate > start OR endDate is null)
    if (start && end) {
      where.AND = [
        {
          startDate: {
            lt: new Date(end) // Appointment starts before range ends
          }
        },
        {
          OR: [
            {
              endDate: {
                gt: new Date(start) // Appointment ends after range starts
              }
            },
            {
              endDate: null // Include appointments without endDate
            }
          ]
        }
      ];
    } else if (start) {
      // Only start date provided - get appointments after this date
      where.startDate = {
        gte: new Date(start)
      };
    } else if (end) {
      // Only end date provided - get appointments before this date
      where.startDate = {
        lte: new Date(end)
      };
    }

    // Get appointments with pagination
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            selectedServices: true,
            email: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phoneNumber: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            color: true
          }
        },
        payments: {
          select: {
            id: true,
            total: true,
            status: true,
            paymentDate: true
          }
        }
      },
      orderBy: { startDate: 'asc' }, // Order by startDate instead of createdAt
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    // Get total count
    const totalCount = await prisma.appointment.count({ where });

    return successResponse(res, {
      appointments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, 'Appointments retrieved successfully');

  } catch (error) {
    console.error('Get appointments error:', error);
    console.error('Error details:', error.message, error.stack);
    return errorResponse(res, `Failed to retrieve appointments: ${error.message}`, 500);
  }
};

// Get appointment by ID
const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            selectedServices: true,
            email: true,
            appointmentCount: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phoneNumber: true,
            whatsappNumber: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            color: true
          }
        },
        payments: {
          select: {
            id: true,
            total: true,
            totalWithoutVAT: true,
            totalVAT: true,
            status: true,
            revenuePaymentStatus: true,
            paymentDate: true,
            createdAt: true
          }
        },
        reviews: {
          select: {
            id: true,
            rating: true,
            message: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    if (!appointment) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    return successResponse(res, appointment, 'Appointment retrieved successfully');

  } catch (error) {
    console.error('Get appointment by ID error:', error);
    return errorResponse(res, 'Failed to retrieve appointment', 500);
  }
};

// Get appointments by customer ID
const getAppointmentsByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 50, userId } = req.query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = { customerId };
    if (userId) where.userId = userId;

    // Get appointments for this customer with pagination
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phoneNumber: true,
            whatsappNumber: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            color: true
          }
        },
        payments: {
          select: {
            id: true,
            total: true,
            status: true,
            revenuePaymentStatus: true,
            paymentDate: true
          }
        },
        reviews: {
          select: {
            id: true,
            rating: true,
            message: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    // Get customer details
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        customerFullName: true,
        customerPhone: true,
        selectedServices: true,
        email: true,
        createdAt: true,
        appointmentCount: true
      }
    });

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Get total count
    const totalCount = await prisma.appointment.count({ where });

    // Calculate statistics
    const totalAppointments = totalCount;
    const appointmentsWithPayments = await prisma.appointment.count({
      where: {
        customerId,
        payments: {
          some: {}
        }
      }
    });

    return successResponse(res, {
      customer,
      appointments,
      summary: {
        totalAppointments,
        appointmentsWithPayments,
        appointmentsWithoutPayments: totalAppointments - appointmentsWithPayments
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, 'Appointments retrieved successfully by customer ID');

  } catch (error) {
    console.error('Get appointments by customer ID error:', error);
    return errorResponse(res, 'Failed to retrieve appointments', 500);
  }
};

// Create appointment (authenticated users only)
const createAppointment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    const {
      customerId,
      customerPhone,
      customerFullName, // Used for customer lookup/creation only
      startDate,
      endDate,
      duration,
      staffId, // Staff table ID (String)
      serviceId, // Service table ID (String)
      selectedServices,
      source,
      recurringType,   // SERVICE TYPE: Every Day | Every Week | Every 2 Weeks | Every Month | Every 2 Months
      recurringDuration // REPEAT FOR: 1 Week | 2 Weeks | 1 Month | 2 Months
    } = req.body;

    // Validate required fields
    if (!customerId && !customerPhone) {
      return errorResponse(res, 'Either customerId or customerPhone is required', 400);
    }

    if (!startDate || !endDate) {
      return errorResponse(res, 'startDate and endDate are required', 400);
    }

    // When recurrence is in data (e.g. "Every Week" + "Month"), use recurring flow – one API for both create and recurring
    if (recurringType && recurringDuration && recurringType !== 'Regular Appointment') {
      return createRecurringAppointments(req, res);
    }

    // Helper function to parse date safely
    const parseDateSafely = (dateString) => {
      if (!dateString) return null;
      if (dateString instanceof Date) return dateString;
      
      try {
        const parsedDate = new Date(dateString);
        if (isNaN(parsedDate.getTime())) {
          return null;
        }
        return parsedDate;
      } catch (error) {
        return null;
      }
    };

    let finalCustomerId = customerId;
    let finalUserId = userId;

    // Get customer data to populate customerFullName
    let finalCustomerFullName = customerFullName || null;
    
    // If customerPhone is provided but no customerId, find or create customer
    if (!finalCustomerId && customerPhone) {
      const formattedPhone = formatIsraeliPhone(customerPhone);
      
      // Find existing customer by phone
      let existingCustomer = await prisma.customers.findFirst({
        where: {
          customerPhone: formattedPhone
        }
      });

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
        finalUserId = existingCustomer.userId || userId;
        // Use customer's full name if not provided in request
        if (!finalCustomerFullName && existingCustomer.customerFullName) {
          finalCustomerFullName = existingCustomer.customerFullName;
        }
      } else {
        // Create new customer if not found
        const nameParts = customerFullName ? customerFullName.split(' ') : ['', ''];
        const newCustomer = await prisma.customers.create({
          data: {
            firstName: nameParts[0] || null,
            lastName: nameParts.slice(1).join(' ') || null,
            customerPhone: formattedPhone,
            customerFullName: customerFullName || null,
            appointmentCount: 0,
            userId: userId
          }
        });
        finalCustomerId = newCustomer.id;
        finalUserId = userId;
        finalCustomerFullName = newCustomer.customerFullName;

        // Create CustomerUser relation
        await prisma.customerUser.create({
          data: {
            customerId: finalCustomerId,
            userId: userId,
            status: constants.CUSTOMER_STATUS.NEW
          }
        });

        // Create CustomerStatusLog
        await prisma.customerStatusLog.create({
          data: {
            customerId: finalCustomerId,
            userId: userId,
            oldStatus: null,
            newStatus: 'New',
            reason: 'New appointment created from calendar'
          }
        });
      }
    } else if (finalCustomerId && !finalCustomerFullName) {
      // If customerId is provided but customerFullName is not, fetch it from customer
      const customer = await prisma.customers.findUnique({
        where: { id: finalCustomerId },
        select: { customerFullName: true }
      });
      if (customer && customer.customerFullName) {
        finalCustomerFullName = customer.customerFullName;
      }
    }

    // Check subscription BEFORE processing appointment
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        role: true,
        stripeSubscriptionId: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    const subscriptionCheck = await checkUserSubscription(user);
    if (!subscriptionCheck.hasActiveSubscription) {
      const errorMessage = subscriptionCheck.reason === 'Subscription expired'
        ? 'Subscription expired. Appointment cannot be created. Please renew subscription to continue.'
        : 'Active subscription required. Appointment cannot be created without an active subscription.';
      return errorResponse(res, errorMessage, 403);
    }

    // Parse dates
    const parsedStartDate = parseDateSafely(startDate);
    const parsedEndDate = parseDateSafely(endDate);

    if (!parsedStartDate || !parsedEndDate) {
      return errorResponse(res, 'Invalid date format for startDate or endDate', 400);
    }

    // Validate staffId if provided
    let finalStaffId = staffId || null;
    if (finalStaffId) {
      const staffExists = await prisma.staff.findUnique({
        where: { id: finalStaffId },
        select: { id: true, businessId: true }
      });
      if (!staffExists) {
        return errorResponse(res, 'Staff not found', 404);
      }
      // Verify staff belongs to the same business
      if (staffExists.businessId !== userId) {
        return errorResponse(res, 'Staff does not belong to your business', 403);
      }
    }

    // Validate serviceId if provided
    let finalServiceId = serviceId || null;
    if (finalServiceId) {
      const serviceExists = await prisma.service.findUnique({
        where: { id: finalServiceId },
        select: { id: true, businessId: true }
      });
      if (!serviceExists) {
        return errorResponse(res, 'Service not found', 404);
      }
      // Verify service belongs to the same business
      if (serviceExists.businessId !== userId) {
        return errorResponse(res, 'Service does not belong to your business', 403);
      }
    }

    // Do not create appointment if staff or business are not available on this date/time
    const pad = (n) => String(n).padStart(2, '0');
    const startDateStr = `${parsedStartDate.getFullYear()}-${pad(parsedStartDate.getMonth() + 1)}-${pad(parsedStartDate.getDate())}`;
    const startTimeStr = `${pad(parsedStartDate.getHours())}:${pad(parsedStartDate.getMinutes())}`;
    const endTimeStr = `${pad(parsedEndDate.getHours())}:${pad(parsedEndDate.getMinutes())}`;
    const availableDates = await filterRecurringDatesByAvailability(
      [startDateStr],
      userId,
      finalStaffId,
      startTimeStr,
      endTimeStr,
      prisma
    );
    if (!availableDates || availableDates.length === 0) {
      return errorResponse(
        res,
        'Staff or business not available on this date/time. Please choose a day and time when both are open.',
        400
      );
    }

    // Create appointment (legacy fields removed - use relations)
    const appointmentData = {
      source: source || 'calendar',
      endDate: parsedEndDate,
      duration: duration || null,
      startDate: parsedStartDate,
      createDate: new Date(),
      customerId: finalCustomerId,
      userId: finalUserId,
      staffId: finalStaffId,
      serviceId: finalServiceId,
      selectedServices: selectedServices || null,
      recurringType: recurringType || null,
      recurringDuration: recurringDuration || null
    };

    const newAppointment = await prisma.appointment.create({
      data: appointmentData,
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            selectedServices: true,
            email: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            color: true
          }
        }
      }
    });

    // Update customer appointment count
    if (finalCustomerId) {
      await prisma.customers.update({
        where: { id: finalCustomerId },
        data: {
          appointmentCount: {
            increment: 1
          }
        }
      });
    }

    return successResponse(res, newAppointment, 'Appointment created successfully', 201);

  } catch (error) {
    console.error('Create appointment error:', error);
    return errorResponse(res, 'Failed to create appointment', 500);
  }
};

/**
 * Create recurring appointments – same validation as createAppointment, then uses
 * recurrenceHelper (calculateRecurringDates) and availabilityHelper (filterRecurringDatesByAvailability)
 * to create one appointment per available day (business + staff hours).
 * Called from createAppointment when recurringType + recurringDuration are in the request body.
 */
const createRecurringAppointments = async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    const {
      customerId,
      customerPhone,
      customerFullName,
      startDate,
      endDate,
      duration,
      staffId,
      serviceId,
      selectedServices,
      source,
      recurringType,
      recurringDuration,
    } = req.body;

    if (!recurringType || recurringType === 'Regular Appointment') {
      return errorResponse(res, 'recurringType is required for recurring (e.g. "Every Day", "Every Week").', 400);
    }
    if (!recurringDuration) {
      return errorResponse(res, 'recurringDuration is required (e.g. "1 Week", "1 Month").', 400);
    }
    if (!customerId && !customerPhone) {
      return errorResponse(res, 'Either customerId or customerPhone is required', 400);
    }
    if (!startDate || !endDate) {
      return errorResponse(res, 'startDate and endDate are required', 400);
    }

    const parseDateSafely = (dateString) => {
      if (!dateString) return null;
      if (dateString instanceof Date) return dateString;
      try {
        const parsed = new Date(dateString);
        return isNaN(parsed.getTime()) ? null : parsed;
      } catch (e) {
        return null;
      }
    };

    const firstStart = parseDateSafely(startDate);
    const firstEnd = parseDateSafely(endDate);
    if (!firstStart || !firstEnd) {
      return errorResponse(res, 'Invalid date format for startDate or endDate', 400);
    }

    const pad = (n) => String(n).padStart(2, '0');
    const startDateStr = `${firstStart.getFullYear()}-${pad(firstStart.getMonth() + 1)}-${pad(firstStart.getDate())}`;

    let dateStrings = getRecurringDates(recurringType, recurringDuration, startDateStr);
    if (!dateStrings || dateStrings.length === 0) {
      return errorResponse(res, 'No recurrence dates computed. Check recurringType and recurringDuration.', 400);
    }
    const allRequestedDates = [...dateStrings];

    // Resolve customer – same as createAppointment
    let finalCustomerId = customerId;
    let finalUserId = userId;
    if (!finalCustomerId && customerPhone) {
      const formattedPhone = formatIsraeliPhone(customerPhone);
      let existingCustomer = await prisma.customers.findFirst({
        where: { customerPhone: formattedPhone },
      });
      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
        finalUserId = existingCustomer.userId || userId;
      } else {
        const nameParts = customerFullName ? customerFullName.split(' ') : ['', ''];
        const newCustomer = await prisma.customers.create({
          data: {
            firstName: nameParts[0] || null,
            lastName: nameParts.slice(1).join(' ') || null,
            customerPhone: formattedPhone,
            customerFullName: customerFullName || null,
            appointmentCount: 0,
            userId: userId,
          },
        });
        finalCustomerId = newCustomer.id;
        finalUserId = userId;
        await prisma.customerUser.create({
          data: { customerId: finalCustomerId, userId, status: constants.CUSTOMER_STATUS.NEW },
        });
        await prisma.customerStatusLog.create({
          data: { customerId: finalCustomerId, userId, oldStatus: null, newStatus: 'New', reason: 'New appointment created from calendar' },
        });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true, subscriptionExpirationDate: true, role: true, stripeSubscriptionId: true },
    });
    if (!user) return errorResponse(res, 'User not found', 404);
    const subscriptionCheck = await checkUserSubscription(user);
    if (!subscriptionCheck.hasActiveSubscription) {
      const msg = subscriptionCheck.reason === 'Subscription expired'
        ? 'Subscription expired. Please renew to create appointments.'
        : 'Active subscription required.';
      return errorResponse(res, msg, 403);
    }

    let finalStaffId = staffId || null;
    if (finalStaffId) {
      const staffExists = await prisma.staff.findUnique({ where: { id: finalStaffId }, select: { id: true, businessId: true } });
      if (!staffExists) return errorResponse(res, 'Staff not found', 404);
      if (staffExists.businessId !== userId) return errorResponse(res, 'Staff does not belong to your business', 403);
    }

    let finalServiceId = serviceId || null;
    if (finalServiceId) {
      const serviceExists = await prisma.service.findUnique({ where: { id: finalServiceId }, select: { id: true, businessId: true } });
      if (!serviceExists) return errorResponse(res, 'Service not found', 404);
      if (serviceExists.businessId !== userId) return errorResponse(res, 'Service does not belong to your business', 403);
    }

    const startHours = firstStart.getHours();
    const startMinutes = firstStart.getMinutes();
    const endHours = firstEnd.getHours();
    const endMinutes = firstEnd.getMinutes();

    // Skip days when staff or business are unavailable (e.g. Staff Two inactive Sunday/Saturday);
    // create appointments only on remaining available days.
    const startTimeStr = `${String(startHours).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}`;
    const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    dateStrings = await filterRecurringDatesByAvailability(
      dateStrings,
      userId,
      finalStaffId,
      startTimeStr,
      endTimeStr,
      prisma
    );
    // Skip days where this staff already has an appointment at the same time (avoid double-booking)
    dateStrings = await filterRecurringDatesByExistingAppointments(
      dateStrings,
      finalStaffId,
      startHours,
      startMinutes,
      endHours,
      endMinutes,
      prisma
    );
    const datesThatWillGetAppointments = dateStrings || [];
    const datesThatWontGetAppointments = allRequestedDates.filter((d) => !datesThatWillGetAppointments.includes(d));

    if (!dateStrings || dateStrings.length === 0) {
      return errorResponse(
        res,
        'No available days in the recurrence range. Business or staff are not open at this time on any of the dates, or the requested slot is already booked.',
        400
      );
    }

    const includeRelations = {
      customer: { select: { id: true, customerFullName: true, customerPhone: true, selectedServices: true, email: true } },
      user: { select: { id: true, businessName: true, email: true } },
      staff: { select: { id: true, fullName: true, phone: true, email: true } },
      service: { select: { id: true, name: true, duration: true, price: true, color: true } },
    };

    const created = [];
    for (const dateStr of dateStrings) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const startDateForSlot = new Date(y, m - 1, d, startHours, startMinutes, 0, 0);
      const endDateForSlot = new Date(y, m - 1, d, endHours, endMinutes, 0, 0);

      const newAppointment = await prisma.appointment.create({
        data: {
          source: source || 'calendar',
          startDate: startDateForSlot,
          endDate: endDateForSlot,
          duration: duration || null,
          createDate: new Date(),
          customerId: finalCustomerId,
          userId: finalUserId,
          staffId: finalStaffId,
          serviceId: finalServiceId,
          selectedServices: selectedServices || null,
          recurringType: recurringType || null,
          recurringDuration: recurringDuration || null,
        },
        include: includeRelations,
      });
      created.push(newAppointment);
    }

    if (finalCustomerId) {
      await prisma.customers.update({
        where: { id: finalCustomerId },
        data: { appointmentCount: { increment: created.length } },
      });
    }

    return res.status(201).json({
      success: true,
      message: `Created ${created.length} recurring appointment(s)`,
      data: created,
      availableDates: dateStrings,
      skippedDates: datesThatWontGetAppointments,
      count: created.length,
    });
  } catch (error) {
    console.error('Create recurring appointments error:', error);
    return errorResponse(res, error.message || 'Failed to create recurring appointments', 500);
  }
};

// Update appointment (authenticated users only)
const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    const {
      customerId,
      startDate,
      endDate,
      duration,
      staffId,
      serviceId,
      selectedServices,
      source,
      customerNote
    } = req.body;

    // Check if appointment exists and belongs to user
    let appointment;
    if (userRole === constants.ROLES.ADMIN) {
      appointment = await prisma.appointment.findUnique({
        where: { id }
      });
    } else {
      appointment = await prisma.appointment.findFirst({
        where: {
          id,
          userId: userId
        }
      });
    }

    if (!appointment) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    // Helper function to parse date safely
    const parseDateSafely = (dateString) => {
      if (!dateString) return null;
      if (dateString instanceof Date) return dateString;
      
      try {
        const parsedDate = new Date(dateString);
        if (isNaN(parsedDate.getTime())) {
          return null;
        }
        return parsedDate;
      } catch (error) {
        return null;
      }
    };

    // Build update data
    const updateData = {};
    
    if (startDate !== undefined) {
      const parsedStartDate = parseDateSafely(startDate);
      if (parsedStartDate) {
        updateData.startDate = parsedStartDate;
      }
    }
    
    if (endDate !== undefined) {
      const parsedEndDate = parseDateSafely(endDate);
      if (parsedEndDate) {
        updateData.endDate = parsedEndDate;
      }
    }
    
    if (duration !== undefined) updateData.duration = duration;
    if (staffId !== undefined) updateData.staffId = staffId || null;
    if (serviceId !== undefined) updateData.serviceId = serviceId || null;
    if (selectedServices !== undefined) updateData.selectedServices = selectedServices || null;
    if (source !== undefined) updateData.source = source;
    if (customerNote !== undefined) updateData.customerNote = customerNote || null;

    // Update customer if customerId changed
    if (customerId !== undefined && customerId !== appointment.customerId) {
      updateData.customerId = customerId;
    }

    // Log update data for debugging
    if (Object.keys(updateData).length === 0) {
      return errorResponse(res, 'No fields to update', 400);
    }

    console.log('Updating appointment:', { id, updateData });

    // Update appointment
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            selectedServices: true,
            email: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    console.log('Appointment updated successfully:', { id, customerNote: updatedAppointment.customerNote });

    return successResponse(res, updatedAppointment, 'Appointment updated successfully');
  } catch (error) {
    console.error('Update appointment error:', error);
    // Provide more detailed error message
    const errorMessage = error.message || 'Failed to update appointment';
    return errorResponse(res, errorMessage, 500);
  }
};

// Update appointment status only (authenticated users only)
const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { appointmentStatus } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    const validStatuses = [
      constants.APPOINTMENT_STATUS.BOOKED,
      constants.APPOINTMENT_STATUS.CANCELLED,
      constants.APPOINTMENT_STATUS.SCHEDULED
    ];
    if (!appointmentStatus || typeof appointmentStatus !== 'string' || !validStatuses.includes(appointmentStatus)) {
      return errorResponse(res, 'Invalid appointmentStatus. Must be one of: booked, cancelled, scheduled', 400);
    }

    let appointment;
    if (userRole === constants.ROLES.ADMIN) {
      appointment = await prisma.appointment.findUnique({ where: { id } });
    } else {
      appointment = await prisma.appointment.findFirst({
        where: { id, userId }
      });
    }

    if (!appointment) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    const includeRelations = {
      customer: {
        select: {
          id: true,
          customerFullName: true,
          customerPhone: true,
          selectedServices: true,
          email: true
        }
      },
      user: {
        select: {
          id: true,
          businessName: true,
          email: true
        }
      },
      staff: {
        select: {
          id: true,
          fullName: true
        }
      },
      service: {
        select: {
          id: true,
          name: true,
          duration: true,
          price: true
        }
      }
    };

    let updatedAppointment;
    try {
      updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: { appointmentStatus },
        include: includeRelations
      });
    } catch (updateErr) {
      // Fallback: if Prisma client doesn't know appointmentStatus (e.g. old client cache), use raw SQL
      if (updateErr.message && updateErr.message.includes('Unknown argument `appointmentStatus`')) {
        await prisma.$executeRaw`
          UPDATE appointments
          SET "appointmentStatus" = ${appointmentStatus}::"AppointmentStatus", "updatedAt" = NOW()
          WHERE id = ${id}
        `;
        updatedAppointment = await prisma.appointment.findUnique({
          where: { id },
          include: includeRelations
        });
        if (!updatedAppointment) {
          return errorResponse(res, 'Appointment not found after update', 500);
        }
      } else {
        throw updateErr;
      }
    }

    return successResponse(res, updatedAppointment, 'Appointment status updated successfully');
  } catch (error) {
    console.error('Update appointment status error:', error);
    return errorResponse(res, error.message || 'Failed to update appointment status', 500);
  }
};

// Delete appointment (authenticated users only)
const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    // Check if appointment exists and belongs to user
    let appointment;
    if (userRole === constants.ROLES.ADMIN) {
      appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          customer: {
            select: {
              id: true
            }
          }
        }
      });
    } else {
      appointment = await prisma.appointment.findFirst({
        where: {
          id,
          userId: userId
        },
        include: {
          customer: {
            select: {
              id: true
            }
          }
        }
      });
    }

    if (!appointment) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    // Delete appointment
    await prisma.appointment.delete({
      where: { id }
    });

    // Decrement customer appointment count if customer exists
    if (appointment.customerId && appointment.customer) {
      await prisma.customers.update({
        where: { id: appointment.customerId },
        data: {
          appointmentCount: {
            decrement: 1
          }
        }
      });
    }

    return successResponse(res, { id, message: 'Appointment deleted successfully' }, 'Appointment deleted successfully');
  } catch (error) {
    console.error('Delete appointment error:', error);
    return errorResponse(res, 'Failed to delete appointment', 500);
  }
};



// Handle incoming WhatsApp messages from Meta/Facebook
const handleWhatsAppIncomingMessage = async (req, res) => {
  try {
    const webhookData = req.body;

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();



    // Check if it's a message webhook
    if (webhookData.entry && webhookData.entry.length > 0) {
      const entry = webhookData.entry[0];
      const changes = entry.changes;

      if (changes && changes.length > 0) {
        const change = changes[0];
        const value = change.value;

        // Check for incoming messages
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            const from = message.from; // Sender's phone number
            const messageId = message.id;
            const timestamp = message.timestamp;

            // Extract message content based on type
            let messageContent = '';
            let messageType = message.type;

            switch (messageType) {
              case 'text':
                messageContent = message.text.body;
                break;
              case 'button':
                messageContent = message.button.text;
                break;
              case 'interactive':
                if (message.interactive.type === 'button_reply') {
                  // For rating buttons, use the button ID (e.g., rating_5) for easier processing
                  const buttonId = message.interactive.button_reply.id;
                  const buttonTitle = message.interactive.button_reply.title;
                  messageContent = buttonId.startsWith('rating_') ? buttonId : buttonTitle;
                } else if (message.interactive.type === 'list_reply') {
                  messageContent = message.interactive.list_reply.title;
                }
                break;
              default:
                messageContent = `Unsupported message type: ${messageType}`;
            }



            // Try to find customer by phone number (try both with and without +)
            let existingCustomer = await prisma.customers.findFirst({
              where: {
                customerPhone: from
              },
              include: {
                user: {
                  select: {
                    id: true,
                    businessName: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            });

            // If not found, try with + prefix
            if (!existingCustomer) {
              const phoneWithPlus = `+${from}`;
              existingCustomer = await prisma.customers.findFirst({
                where: {
                  customerPhone: phoneWithPlus
                },
                include: {
                  user: {
                    select: {
                      id: true,
                      businessName: true,
                      firstName: true,
                      lastName: true
                    }
                  }
                }
              });

            }

            if (existingCustomer) {


              // Check if message content is a rating (1-5)
              const rating = parseInt(messageContent);
              if (rating >= 1 && rating <= 5) {

                // Store rating in Review table
                const newReview = await prisma.review.create({
                  data: {
                    rating: rating,
                    message: `WhatsApp Rating: ${messageContent}`,
                    customerId: existingCustomer.id,
                    userId: existingCustomer.userId,
                    whatsappMessageId: messageId,
                    messageStatus: 'received'
                  }
                });


              }

              // Note: Conversation flows (at-risk, lost) removed - now handled by N8N only



            }
          }
        }


      }
    }

    // Always respond with 200 to acknowledge webhook
    return res.status(200).json({ message: 'Webhook received successfully' });

  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    return res.status(500).json({ error: 'Failed to process WhatsApp webhook' });
  }
};

// Webhook verification for Meta/Facebook (required for webhook setup)
const verifyWhatsAppWebhook = async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Meta/Facebook webhook verification token
    const VERIFY_TOKEN = 'plusfive_webhook_token_2025';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).json({ error: 'Verification failed' });
    }
  } catch (error) {
    console.error('❌ WhatsApp webhook verification error:', error);
    return res.status(500).json({ error: 'Verification error' });
  }
};

// Create WhatsApp message with validation (customer_id and user_id must match)
const createWhatsappMessageWithValidation = async (req, res) => {
  try {
    const { customer_id, user_id, messageType, billStatus, billDate } = req.body;

    // Validate required fields
    if (!customer_id || !user_id || !messageType) {
      return errorResponse(res, 'Missing required fields: customer_id, user_id, and messageType are required', 400);
    }

    // Validate that customer exists and belongs to the user
    const customer = await prisma.customers.findUnique({
      where: { id: customer_id },
      select: {
        id: true,
        userId: true,
        customerFullName: true,
        customerPhone: true
      }
    });

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Validate that customer belongs to the user
    if (customer.userId !== user_id) {
      return errorResponse(res, 'Customer does not belong to this user. Validation failed.', 403);
    }

    // Validate that user exists
    const user = await prisma.user.findUnique({
      where: { id: user_id },
      select: {
        id: true,
        businessName: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        role: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check if user has active subscription before creating WhatsApp message record
    if (user.role !== constants.ROLES.ADMIN) {
      const subscriptionStatus = user.subscriptionStatus?.toLowerCase();
      
      // Block if subscription is not active
      if (!subscriptionStatus || 
          subscriptionStatus === constants.SUBSCRIPTION_STATUS.PENDING || 
          subscriptionStatus === constants.SUBSCRIPTION_STATUS.CANCELED || 
          subscriptionStatus === constants.SUBSCRIPTION_STATUS.INACTIVE ||
          subscriptionStatus === constants.SUBSCRIPTION_STATUS.EXPIRED) {
        return errorResponse(res, 'Active subscription required. WhatsApp message cannot be created without an active subscription.', 403);
      }

      // Check expiration date
      if (user.subscriptionExpirationDate) {
        const now = new Date();
        const expirationDate = new Date(user.subscriptionExpirationDate);
        if (expirationDate < now) {
          return errorResponse(res, 'Subscription expired. WhatsApp message cannot be created. Please renew subscription to continue.', 403);
        }
      }
    }

    // Create whatsappMessage record
    const whatsappMessage = await prisma.whatsappMessage.create({
      data: {
        messageType: messageType,
        messageDate: new Date(),
        billStatus: billStatus || false,
        billDate: billDate ? new Date(billDate) : null,
        customerId: customer_id,
        userId: user_id
      },
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true
          }
        },
        user: {
          select: {
            id: true,
            businessName: true
          }
        }
      }
    });

    // Report usage to Stripe using meterEvents API (real-time reporting)
    // Using same logic as reportUsageForMonth cron job
    try {
      const userWithStripe = await prisma.user.findUnique({
        where: { id: user_id },
        select: { 
          id: true, 
          email: true, 
          stripeSubscriptionId: true
        }
      });

      if (userWithStripe && userWithStripe.stripeSubscriptionId) {
        // Get subscription with expanded price and product (same as cron job)
        const subscription = await stripe.subscriptions.retrieve(userWithStripe.stripeSubscriptionId, {
          expand: ['items.data.price.product']
        });
        
        // Find the metered subscription item (WhatsApp messages)
        const meteredItem = subscription.items.data.find(item => 
          item.price?.recurring?.usage_type === 'metered'
        );

        if (!meteredItem) {
          console.log(`⚠️  No metered subscription item found for user ${userWithStripe.email} - skipping`);
        } else {
          // Get event name dynamically from price metadata, product metadata, or use default
          // Priority: price.metadata.event_name > product.metadata.event_name > default "whatsapp_message"
          let eventName = "whatsapp_message"; // Default fallback
          
          // Try to get event name from price metadata
          if (meteredItem.price?.metadata?.event_name) {
            eventName = meteredItem.price.metadata.event_name;
            console.log(`📋 Event name from price metadata: ${eventName}`);
          } 
          // Try to get event name from product metadata
          else if (meteredItem.price?.product) {
            let product = meteredItem.price.product;
            if (typeof product === 'string') {
              try {
                product = await stripe.products.retrieve(product);
              } catch (error) {
                console.error(`❌ Error fetching product for event name:`, error.message);
              }
            }
            if (product && typeof product === 'object' && product.metadata?.event_name) {
              eventName = product.metadata.event_name;
              console.log(`📋 Event name from product metadata: ${eventName}`);
            }
          }
          
          console.log(`📋 Using event name: ${eventName}`);

          // Get Stripe customer ID from subscription (same as cron job)
          const stripeCustomerId = subscription.customer;
          if (!stripeCustomerId) {
            console.error(`❌ No customer ID found in subscription for user ${userWithStripe.email}`);
          } else {
            // Extract customer ID if it's an object
            const customerId = typeof stripeCustomerId === 'string' 
              ? stripeCustomerId 
              : stripeCustomerId?.id;
            
            console.log(`📋 Stripe Customer ID: ${customerId}`);

            // Create meter event for real-time usage tracking (same as cron job)
            const usageEvent = await stripe.billing.meterEvents.create({
              event_name: eventName,
              payload: {
                stripe_customer_id: customerId,
                subscription_item: meteredItem.id,
                value: 1, // One unit per message
                timestamp: Math.floor(Date.now() / 1000) // Current timestamp
              }
            });

            console.log(`✅ Real-time usage reported to Stripe meter: ${eventName} for user ${userWithStripe.email}`);
            console.log(`📋 Event ID: ${usageEvent.id}`);
          }
        }
      }
    } catch (stripeError) {
      console.error('❌ Error reporting usage to Stripe:', stripeError.message);
      // Don't fail the request if Stripe reporting fails
    }

    return successResponse(res, {
      whatsappMessage,
      messageType: whatsappMessage.messageType, // Explicitly show stored messageType
      validation: {
        customer_id: customer_id,
        user_id: user_id,
        customer_belongs_to_user: true,
        message: 'Validation successful - customer belongs to user',
        messageType_stored: true
      }
    }, 'WhatsApp message stored successfully with validation', 201);

  } catch (error) {
    console.error('Error creating WhatsApp message with validation:', error);
    return errorResponse(res, 'Failed to create WhatsApp message', 500);
  }
};

module.exports = {
  handleAppointmentWebhook,
  handleRatingWebhook,
  handlePaymentCheckoutWebhook,
  handleWhatsAppIncomingMessage,
  verifyWhatsAppWebhook,
  getAllPaymentWebhooks,
  getPaymentWebhookById,
  getPaymentWebhooksByCustomerId,
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByCustomerId,
  createAppointment,
  createRecurringAppointments,
  updateAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  createPayment,
  createWhatsappMessageWithValidation
};

