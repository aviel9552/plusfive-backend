const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const N8nMessageService = require('../services/N8nMessageService');

// Send WhatsApp review request function
async function sendWhatsAppReviewRequest(customerId) {
  try {
    // Import review service
    const ReviewService = require('../services/Whatsapp/ReviewService');
    const reviewService = new ReviewService();

    // Fetch customer details from database
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            businessName: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            whatsappNumber: true
          }
        }
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.user) {
      throw new Error('Business owner information not found for this customer');
    }

    // Determine if this is a new or regular customer based on appointmentCount
    const isNewCustomer = customer.appointmentCount <= 1;

    let result;
    if (isNewCustomer) {
      // Send new customer rating request
      result = await reviewService.sendNewCustomerRatingRequest(
        customer.customerFullName,
        customer.user.businessName,
        customer.customerPhone
      );
    } else {
      // Send regular customer rating request (randomly choose v1 or v2)
      const useV1 = Math.random() < 0.5;
      if (useV1) {
        result = await reviewService.sendRegularCustomerRatingRequest1(
          customer.customerFullName,
          customer.user.businessName,
          customer.customerPhone
        );
      } else {
        result = await reviewService.sendRegularCustomerRatingRequest2(
          customer.customerFullName,
          customer.user.businessName,
          customer.customerPhone
        );
      }
    }

    // Store in database for tracking
    const reviewRecord = await prisma.review.create({
      data: {
        customerId: customer.id,
        userId: customer.userId,
        rating: 0, // Placeholder - will be updated when customer responds
        message: `Rating request sent to ${isNewCustomer ? 'new' : 'regular'} customer via WhatsApp after payment`,
        status: 'sent',
        whatsappMessageId: result.whatsappResponse?.messages?.[0]?.id || null,
        messageStatus: 'sent'
      }
    });

    return {
      success: true,
      result,
      reviewRecord,
      customerDetails: {
        id: customer.id,
        name: customer.customerFullName,
        phone: customer.customerPhone,
        businessName: customer.user.businessName,
        isNewCustomer: isNewCustomer,
        appointmentCount: customer.appointmentCount
      }
    };

  } catch (error) {
    console.error('Error sending WhatsApp review request:', error);
    throw error;
  }
}

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

    // Only store webhook log if user exists
    const webhookLog = await prisma.webhookLog.create({
      data: {
        data: webhookData,
        type: 'appointment',
        status: 'pending'
      }
    });

    console.log('webhookLog', webhookLog);

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
    const formattedPhoneForAppointment = formatIsraeliPhone(webhookData.CustomerPhone);
    const appointmentData = {
      source: webhookData.Source || null,
      endDate: parseDateSafely(webhookData.EndDate),
      duration: webhookData.Duration || null,
      startDate: parseDateSafely(webhookData.StartDate),
      businessId: webhookData.BusinessId || null,
      byCustomer: webhookData.ByCustomer || false,
      createDate: parseDateSafely(webhookData.CreateDate),
      employeeId: webhookData.EmployeeId || null,
      businessName: webhookData.BusinessName || null,
      employeeName: webhookData.EmployeeName || null,
      customerPhone: formattedPhoneForAppointment,
      appointmentCount: webhookData.AppointmentCount || 0,
      customerFullName: webhookData.CustomerFullName || null,
      selectedServices: webhookData.SelectedServices || null,
      customerId: customerId, // Reference to newly created customer
      userId: userId // Reference to User table
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
      // Check previous status before updating
      const previousStatus = existingCustomerUser.status;

      if (previousStatus === 'lost' || previousStatus === 'risk') {
        // Update to recovered if customer was lost or at risk
        const updatedCustomerUser = await prisma.customerUser.update({
          where: {
            id: existingCustomerUser.id
          },
          data: {
            status: 'recovered'
          }
        });
        customerUserId = updatedCustomerUser.id;

        // Create CustomerStatusLog for Lost/Risk to Recovered transition
        await prisma.customerStatusLog.create({
          data: {
            customerId: customerId,
            userId: userId,
            oldStatus: previousStatus === 'lost' ? 'Lost' : 'Risk',
            newStatus: 'Recovered',
            reason: 'New appointment after being lost/at risk'
          }
        });

        // Send recovered customer notification to business owner via n8n
        const businessOwner = await prisma.user.findUnique({
          where: { id: userId },
          select: { phoneNumber: true, businessName: true, businessType: true, whatsappNumber: true }
        });

        if (businessOwner && (businessOwner.phoneNumber || businessOwner.whatsappNumber)) {
          try {
            const n8nService = new N8nMessageService();

            const webhookParams = {
              customerName: webhookData.CustomerFullName,
              customerPhone: formattedPhoneForAppointment,
              businessName: businessOwner.businessName || webhookData.BusinessName,
              businessType: businessOwner.businessType || 'general',
              customerService: webhookData.SelectedServices || '',
              businessOwnerPhone: businessOwner.phoneNumber || businessOwner.whatsappNumber,
              lastVisitDate: new Date().toISOString().split('T')[0],
              whatsappPhone: formattedPhoneForAppointment,
              futureAppointment: webhookData.StartDate,
              previousStatus: previousStatus
            };

            await n8nService.triggerRecoveredCustomerNotification(webhookParams);
            console.log(`✅ N8n recovered customer notification triggered for: ${webhookData.CustomerFullName} (${previousStatus} → recovered)`);

          } catch (webhookError) {
            console.error('❌ Error triggering n8n recovered customer notification:', webhookError);
            // Fallback to old WhatsApp service if n8n fails
            try {
              const WhatsAppService = require('../services/WhatsAppService');
              const whatsappService = new WhatsAppService();

              await whatsappService.sendRecoveredCustomerTemplate(
                businessOwner.businessName || webhookData.BusinessName,
                webhookData.CustomerFullName,
                formattedPhoneForAppointment,
                webhookData.StartDate,
                webhookData.SelectedServices,
                businessOwner.phoneNumber || businessOwner.whatsappNumber
              );
            } catch (fallbackError) {
              console.error('Failed to send recovered customer notification (fallback):', fallbackError.message);
            }
          }
        } else {
          console.warn('No phone number found for business owner to send recovered customer notification');
        }
      } else if (previousStatus === 'new') {
        // Update to active only if status was 'new'
        const updatedCustomerUser = await prisma.customerUser.update({
          where: {
            id: existingCustomerUser.id
          },
          data: {
            status: 'active'
          }
        });
        customerUserId = updatedCustomerUser.id;

        // Create CustomerStatusLog for New to Active transition
        await prisma.customerStatusLog.create({
          data: {
            customerId: customerId,
            userId: userId,
            oldStatus: 'New',
            newStatus: 'Active',
            reason: 'First appointment booked'
          }
        });
      } else if (previousStatus === 'recovered') {
        // Recovered customers stay recovered - no status change
        customerUserId = existingCustomerUser.id;
      } else if (previousStatus === 'active') {
        // Active customers stay active - no status change
        customerUserId = existingCustomerUser.id;
      } else {
        // Keep existing status for any other status
        customerUserId = existingCustomerUser.id;
      }
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
            status: 'new'
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
            status: 'new'
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
      webhookId: webhookLog.id,
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

    // Validate RatingId before creating log (paymentId is optional fallback)
    if (!actualData.RatingId && !actualData.paymentId) {
      return errorResponse(res, 'Rating ID or Payment ID is required', 400);
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

    // 3. Find review by RatingId OR paymentId (payment webhook ID)
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

    // Priority 2: If paymentId (payment webhook ID) is provided and RatingId not found, find review by paymentWebhookId
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
      const errorMsg = actualData.RatingId || actualData.paymentId
        ? 'Invalid Rating ID or Payment ID - review not found'
        : 'Either Rating ID or Payment ID is required';
      return errorResponse(res, errorMsg, 404);
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

      // 4. Update customer's average rating
      if (userId && customerId) {
        const customerReviews = await prisma.review.findMany({
          where: {
            customerId: customerId,
            userId: userId,
            status: 'received' // Use correct status field
          },
          select: {
            rating: true
          }
        });

        if (customerReviews.length > 0) {
          const averageRating = customerReviews.reduce((sum, review) => sum + review.rating, 0) / customerReviews.length;
          
          // Update customer's review statistics (if reviewStatistics field exists)
          try {
            await prisma.customers.update({
              where: { id: customerId },
              data: {
                reviewStatistics: {
                  averageRating: parseFloat(averageRating.toFixed(1)),
                  totalReviews: customerReviews.length,
                  lastReviewDate: new Date()
                }
              }
            });
          } catch (updateError) {
            console.log('Review statistics update skipped (field may not exist)');
          }
        }
      }
    }

    return successResponse(res, {
      reviewId: reviewId,
      userId: userId,
      customerId: customerId,
      message: 'Rating webhook received successfully',
      data: actualData,
      ratingStored: reviewId ? true : false
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

    // 1. Store in WebhookPaymentLog table (raw log data)
    const paymentLog = await prisma.webhookPaymentLog.create({
      data: {
        data: webhookData,
        type: 'payment_checkout',
        createdDate: new Date()
      }
    });

    // Extract actual data - webhookData is the actual data itself
    const actualData = webhookData;

    if (!actualData) {
      return errorResponse(res, 'Invalid webhook data structure', 400);
    }


    // 2. Find customer by CustomerFullName first, then by BusinessId AND EmployeeId
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
          userId: true // select userId field as well
        }
      });

      if (existingCustomer) {
        // Customer found - both customerId and userId available from Customers table
        customerId = existingCustomer.id;
        userId = existingCustomer.userId; // userId field is present in Customers table
      }
    }

    // 4. Get customer status from CustomerUser table before creating PaymentWebhook
    let revenuePaymentStatus = null;
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
        // Map customer status to revenue payment status
        if (customerUser.status === 'recovered') {
          revenuePaymentStatus = 'recovered';
        } else if (customerUser.status === 'lost') {
          revenuePaymentStatus = 'lost';
        }
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
        revenuePaymentStatus: revenuePaymentStatus // Set based on CustomerUser status
      }
    });


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

          const customerStatus = previousPayments === 0 ? 'new' : 'active';

          const webhookParams = {
            customer_name: customer.customerFullName,
            customer_phone: customer.customerPhone,
            business_name: customer.user?.businessName || 'Business',
            business_type: customer.user?.businessType || 'general',
            customer_service: customer.selectedServices || '',
            business_owner_phone: customer.user?.phoneNumber || customer.user?.whatsappNumber,
            last_visit_date: new Date().toISOString().split('T')[0],
            whatsapp_phone: customer.customerPhone,
            customer_status: customerStatus
          };

          // Will update webhookParams with review_id after creating review record
          // First send without review_id (n8n trigger)
          const n8nResult = await n8nService.triggerReviewRequest(webhookParams);
          console.log(`✅ N8n review request triggered successfully for customer: ${customer.customerFullName}`);

          // ALSO trigger direct ReviewService for database tracking
          try {
            const ReviewService = require('../services/Whatsapp/ReviewService');
            const reviewService = new ReviewService();
            
            // Create review record in database BEFORE sending WhatsApp message
            const reviewRecord = await prisma.review.create({
              data: {
                customerId: customerId,
                userId: userId,
                rating: 0, // Placeholder - will be updated when customer responds
                message: `Rating request sent via WhatsApp after payment`,
                status: 'sent', // sent, received, responded
                whatsappMessageId: null, // Will be updated after WhatsApp sent
                messageStatus: 'pending', // pending, sent, delivered, read
                paymentWebhookId: paymentWebhook.id // Link to payment webhook
              }
            });
            
            console.log(`✅ Review record created with ID: ${reviewRecord.id}`);
            
            if (customerStatus === 'new') {
              const reviewResult = await reviewService.sendNewCustomerRatingRequest(
                customer.customerFullName,
                customer.user?.businessName || 'Business',
                customer.customerPhone,
                reviewRecord.id // Pass review ID instead of payment webhook ID
              );
              
              // Update review with WhatsApp message ID if available
              if (reviewResult.whatsappResponse?.message1?.messages?.[0]?.id) {
                await prisma.review.update({
                  where: { id: reviewRecord.id },
                  data: {
                    whatsappMessageId: reviewResult.whatsappResponse.message1.messages[0].id,
                    messageStatus: 'sent'
                  }
                });
              }
            } else {
              // For active customers, randomly choose v1 or v2
              const useV1 = Math.random() < 0.5;
              const reviewResult = useV1 
                ? await reviewService.sendRegularCustomerRatingRequest1(
                    customer.customerFullName,
                    customer.user?.businessName || 'Business',
                    customer.customerPhone,
                    reviewRecord.id // Pass review ID instead of payment webhook ID
                  )
                : await reviewService.sendRegularCustomerRatingRequest2(
                    customer.customerFullName,
                    customer.user?.businessName || 'Business',
                    customer.customerPhone,
                    reviewRecord.id // Pass review ID instead of payment webhook ID
                  );
              
              // Update review with WhatsApp message ID if available
              if (reviewResult.whatsappResponse?.message1?.messages?.[0]?.id) {
                await prisma.review.update({
                  where: { id: reviewRecord.id },
                  data: {
                    whatsappMessageId: reviewResult.whatsappResponse.message1.messages[0].id,
                    messageStatus: 'sent'
                  }
                });
              }
            }
            
            // Send review_id to n8n after review record created
            await n8nService.triggerReviewRequest({
              ...webhookParams,
              review_id: reviewRecord.id, // ✅ Pass review ID to n8n
              payment_webhook_id: paymentWebhook.id // Also pass payment webhook ID
            });
            
            console.log(`✅ Review sent with paymentWebhookId: ${paymentWebhook.id} and review_id: ${reviewRecord.id}`);
          } catch (reviewError) {
            console.error('❌ Error in direct ReviewService call:', reviewError);
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

// Get all webhook logs (admin only)
const getAllWebhookLogs = async (req, res) => {
  try {
    const { type, status, page = 1, limit = 50 } = req.query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;

    // Get webhook logs with pagination
    const webhookLogs = await prisma.webhookLog.findMany({
      where,
      orderBy: { createdDate: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    // Get total count
    const totalCount = await prisma.webhookLog.count({ where });

    return successResponse(res, {
      webhookLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, 'Webhook logs retrieved successfully');

  } catch (error) {
    console.error('Get webhook logs error:', error);
    return errorResponse(res, 'Failed to retrieve webhook logs', 500);
  }
};

// Get webhook log by ID
const getWebhookLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const webhookLog = await prisma.webhookLog.findUnique({
      where: { id }
    });

    if (!webhookLog) {
      return errorResponse(res, 'Webhook log not found', 404);
    }

    return successResponse(res, webhookLog, 'Webhook log retrieved successfully');

  } catch (error) {
    console.error('Get webhook log by ID error:', error);
    return errorResponse(res, 'Failed to retrieve webhook log', 500);
  }
};

// Update webhook log status
const updateWebhookLogStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'processed', 'failed'].includes(status)) {
      return errorResponse(res, 'Invalid status. Must be pending, processed, or failed', 400);
    }

    const updatedWebhookLog = await prisma.webhookLog.update({
      where: { id },
      data: { status }
    });

    return successResponse(res, updatedWebhookLog, 'Webhook log status updated successfully');

  } catch (error) {
    console.error('Update webhook log status error:', error);
    return errorResponse(res, 'Failed to update webhook log status', 500);
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
    const { userId, customerId, employeeId, page = 1, limit = 50 } = req.query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};
    if (userId) where.userId = userId;
    if (customerId) where.customerId = customerId;
    if (employeeId) where.employeeId = parseInt(employeeId);

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
        payments: {
          select: {
            id: true,
            total: true,
            status: true,
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
    return errorResponse(res, 'Failed to retrieve appointments', 500);
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



// Handle incoming WhatsApp messages from Meta/Facebook
const handleWhatsAppIncomingMessage = async (req, res) => {
  try {
    const webhookData = req.body;

    // Import services for handling different conversation types
    const RiskService = require('../services/Whatsapp/RiskService');
    const LostService = require('../services/Whatsapp/LostService');
    const ReviewService = require('../services/Whatsapp/ReviewService');
    const { PrismaClient } = require('@prisma/client');
    const riskService = new RiskService();
    const lostService = new LostService();
    const reviewService = new ReviewService();
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

              // ===== HEBREW CONVERSATION FLOWS (AT-RISK, LOST & REVIEW CUSTOMERS) =====
              // Check if this is part of a review conversation (HIGHEST PRIORITY - for ratings)
              const reviewConversationState = await reviewService.getConversationState(from);
              // Check if this is part of an at-risk conversation
              const riskConversationState = await riskService.getConversationState(from);
              // Check if this is part of a lost customer conversation
              const lostConversationState = await lostService.getConversationState(from);

              // Check conversation status to determine priority (but only if conversation is NOT ended)
              if (reviewConversationState && reviewConversationState.status === 'at_review' && !reviewConversationState.conversationEnded) {

                try {
                  // Get business owner info for potential alert
                  const businessOwnerPhone = existingCustomer.user?.whatsappNumber || existingCustomer.user?.phoneNumber || null;

                  const reviewResult = await reviewService.handleIncomingMessage(
                    from,
                    messageContent,
                    existingCustomer.customerFullName,
                    existingCustomer.businessName || existingCustomer.user?.businessName,
                    existingCustomer.selectedServices || 'Service details not available',
                    'Last payment amount', // You can enhance this
                    businessOwnerPhone
                  );

                  if (reviewResult.action !== 'no_active_conversation') {

                    // Extract and save rating to database if provided
                    const rating = reviewService.extractRating(messageContent);
                    if (rating !== null) {

                      // Update existing review record or create new one
                      const recentReview = await prisma.review.findFirst({
                        where: {
                          customerId: existingCustomer.id,
                          rating: 0 // Placeholder rating
                        },
                        orderBy: { createdAt: 'desc' }
                      });

                      if (recentReview) {
                        await prisma.review.update({
                          where: { id: recentReview.id },
                          data: {
                            rating: rating,
                            message: `Customer rated ${rating}/5 via WhatsApp button`,
                            status: rating >= 4 ? 'positive' : 'needs_attention',
                            messageStatus: 'responded'
                          }
                        });
                      } else {
                        // Create new review record
                        const newReview = await prisma.review.create({
                          data: {
                            customerId: existingCustomer.id,
                            userId: existingCustomer.userId,
                            rating: rating,
                            message: `Customer rated ${rating}/5 via WhatsApp button (direct response)`,
                            status: rating >= 4 ? 'positive' : 'needs_attention',
                            messageStatus: 'responded'
                          }
                        });
                      }
                    }
                  }
                } catch (reviewError) {
                  console.error('❌ Error handling review conversation:', reviewError);
                }
              } else if (riskConversationState && riskConversationState.status === 'at_risk' && !riskConversationState.conversationEnded) {

                try {
                  const riskResult = await riskService.handleIncomingMessage(
                    from,
                    messageContent,
                    existingCustomer.customerFullName
                  );

                  if (riskResult.action !== 'no_active_conversation') {
                  }
                } catch (riskError) {
                  console.error('❌ Error handling at-risk conversation:', riskError);
                }
              } else if (lostConversationState && lostConversationState.status === 'at_lost' && !lostConversationState.conversationEnded) {

                try {
                  const lostResult = await lostService.handleIncomingMessage(
                    from,
                    messageContent,
                    existingCustomer.customerFullName
                  );

                  if (lostResult.action !== 'no_active_conversation') {
                  }
                } catch (lostError) {
                  console.error('❌ Error handling lost customer conversation:', lostError);
                }

              } else {
                // Check if there are ended conversations
                const hasEndedReview = reviewConversationState && reviewConversationState.conversationEnded;
                const hasEndedRisk = riskConversationState && riskConversationState.conversationEnded;
                const hasEndedLost = lostConversationState && lostConversationState.conversationEnded;

                if (hasEndedReview || hasEndedRisk || hasEndedLost) {
                } else {
                }
              }



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

module.exports = {
  handleAppointmentWebhook,
  handleRatingWebhook,
  handlePaymentCheckoutWebhook,
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus,
  handleWhatsAppIncomingMessage,
  verifyWhatsAppWebhook,
  getAllPaymentWebhooks,
  getPaymentWebhookById,
  getPaymentWebhooksByCustomerId,
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByCustomerId
};
