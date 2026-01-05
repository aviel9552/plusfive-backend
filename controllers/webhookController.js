const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const N8nMessageService = require('../services/N8nMessageService');
const { createWhatsappMessageRecord } = require('./whatsappMessageController');
const { stripe } = require('../lib/stripe');

// Helper function to format Israeli phone numbers
const formatIsraeliPhone = (phoneNumber) => {
  if (!phoneNumber) return null;

  let cleanPhone = phoneNumber.toString().replace(/[\s\-\(\)\+]/g, '');

  if (cleanPhone.startsWith('972')) {
    return `+${cleanPhone}`;
  }

  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  return `+972${cleanPhone}`;
};

const parseDateSafely = (dateString) => {
  if (!dateString) return null;

  try {
    const [datePart, timePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('/');

    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(
      2,
      '0'
    )} ${timePart || '00:00'}:00`;

    const parsedDate = new Date(formattedDate);
    if (isNaN(parsedDate.getTime())) return null;
    return parsedDate;
  } catch (e) {
    return null;
  }
};

const isSubscriptionActive = (user) => {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const status = (user.subscriptionStatus || '').toLowerCase();
  if (!status) return false;

  const inactive =
    status === 'pending' ||
    status === 'canceled' ||
    status === 'inactive' ||
    status === 'expired';

  if (inactive) return false;

  if (user.subscriptionExpirationDate) {
    const now = new Date();
    const exp = new Date(user.subscriptionExpirationDate);
    if (exp < now) return false;
  }

  return true;
};

/**
 * IMPORTANT WEBHOOK RULE:
 * - Never return 4xx/5xx to Calmark for business/subscription problems.
 * - Always return 200 quickly.
 * - Log the inbound payload FIRST.
 * - If user not active / not found → mark log as queued/ignored, return 200.
 */

// Handle appointment webhook - store any data without validation (when active), otherwise queue
const handleAppointmentWebhook = async (req, res) => {
  const webhookData = req.body;

  // 1) Always create a log FIRST (so you never "lose" events)
  let webhookLog = null;
  try {
    webhookLog = await prisma.webhookLog.create({
      data: {
        data: webhookData,
        type: 'appointment',
        status: 'received', // received | queued | processed | ignored | failed
      },
    });
  } catch (e) {
    // Even if logging fails, NEVER break Calmark (avoid turning off webhook)
    console.error('❌ Failed to write webhookLog (appointment):', e);
    return res.status(200).json({ success: true, received: true });
  }

  try {
    console.log('✅ calmark appointment webhook received', {
      webhookLogId: webhookLog.id,
      businessName: webhookData?.BusinessName,
    });

    // 2) Identify business/user (do NOT block Calmark if not found)
    let existingUser = null;
    if (webhookData.BusinessName) {
      existingUser = await prisma.user.findFirst({
        where: { businessName: webhookData.BusinessName },
        select: { id: true, businessName: true },
      });
    }

    if (!existingUser) {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: {
          status: 'ignored',
          // keep reason inside the log data if you want; simplest: attach a small meta object
          meta: { reason: 'business_not_found' },
        },
      }).catch(() => null);

      // ALWAYS 200
      return res.status(200).json({
        success: true,
        received: true,
        queued: false,
        reason: 'business_not_found',
      });
    }

    // 3) Subscription check (NEVER 403 here)
    const user = await prisma.user.findUnique({
      where: { id: existingUser.id },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        role: true,
      },
    });

    if (!isSubscriptionActive(user)) {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: {
          status: 'queued',
          meta: {
            reason: 'subscription_inactive',
            userId: existingUser.id,
            businessName: existingUser.businessName,
          },
        },
      }).catch(() => null);

      // ALWAYS 200 (Calmark must keep sending)
      return res.status(200).json({
        success: true,
        received: true,
        queued: true,
        reason: 'subscription_inactive',
      });
    }

    // 4) Active → process as before
    // Check if customer exists in Customers table (by phone only)
    let existingCustomer = null;
    let customerId = null;
    const formattedPhone = formatIsraeliPhone(webhookData.CustomerPhone);

    if (formattedPhone) {
      existingCustomer = await prisma.customers.findFirst({
        where: { customerPhone: formattedPhone },
        select: {
          id: true,
          employeeId: true,
          customerFullName: true,
          customerPhone: true,
        },
      });
    }

    const userId = existingUser.id;

    if (!existingCustomer) {
      const newCustomer = await prisma.customers.create({
        data: {
          firstName: webhookData.CustomerFullName
            ? webhookData.CustomerFullName.split(' ')[0]
            : null,
          lastName: webhookData.CustomerFullName
            ? webhookData.CustomerFullName.split(' ').slice(1).join(' ')
            : null,
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
          userId: userId,
        },
      });
      customerId = newCustomer.id;
    } else {
      customerId = existingCustomer.id;
    }

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
      customerPhone: formattedPhone,
      appointmentCount: webhookData.AppointmentCount || 0,
      customerFullName: webhookData.CustomerFullName || null,
      selectedServices: webhookData.SelectedServices || null,
      customerId: customerId,
      userId: userId,
    };

    const newAppointment = await prisma.appointment.create({
      data: appointmentData,
    });

    // customerUser relation (as before)
    let existingCustomerUser = await prisma.customerUser.findFirst({
      where: { customerId, userId },
    });

    let customerUserId;

    if (existingCustomerUser) {
      customerUserId = existingCustomerUser.id;
    } else {
      const customerWithDifferentUser = await prisma.customerUser.findFirst({
        where: { customerId },
      });

      const newCustomerUser = await prisma.customerUser.create({
        data: {
          customerId,
          userId,
          status: 'new',
        },
      });
      customerUserId = newCustomerUser.id;

      await prisma.customerStatusLog.create({
        data: {
          customerId,
          userId,
          oldStatus: null,
          newStatus: 'New',
          reason: customerWithDifferentUser
            ? 'New appointment booked (customer existed under different user)'
            : 'New appointment booked',
        },
      });
    }

    // Mark log processed
    await prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: {
        status: 'processed',
        meta: { userId, customerId, appointmentId: newAppointment.id },
      },
    }).catch(() => null);

    // ALWAYS 200 to webhook sender (don’t use 201 here)
    return res.status(200).json({
      success: true,
      webhookId: webhookLog.id,
      userId,
      customerId,
      appointmentId: newAppointment.id,
      customerUserId,
      message: 'Appointment webhook processed successfully',
    });
  } catch (error) {
    console.error('Appointment webhook error:', error);

    await prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: {
        status: 'failed',
        meta: { reason: 'exception', error: String(error?.message || error) },
      },
    }).catch(() => null);

    // STILL return 200 so Calmark keeps sending
    return res.status(200).json({ success: true, received: true, queued: true });
  }
};

// Handle rating webhook - update review when active, otherwise queue
const handleRatingWebhook = async (req, res) => {
  const webhookData = req.body;
  let webhookLog = null;

  // Always log first (optional: you can use webhookLog table for rating too)
  try {
    webhookLog = await prisma.webhookLog.create({
      data: {
        data: webhookData,
        type: 'rating',
        status: 'received',
      },
    });
  } catch (e) {
    console.error('❌ Failed to write webhookLog (rating):', e);
    return res.status(200).json({ success: true, received: true });
  }

  try {
    const actualData = webhookData;

    // Validate minimal identifiers — but DO NOT 400, just ignore/queue
    if (!actualData || (!actualData.RatingId && !actualData.review_id && !actualData.paymentId)) {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { status: 'ignored', meta: { reason: 'missing_identifiers' } },
      }).catch(() => null);

      return res.status(200).json({ success: true, received: true, reason: 'missing_identifiers' });
    }

    // Find review by RatingId/review_id/paymentId
    let existingReview = null;
    let reviewId = null;

    if (actualData.RatingId) {
      existingReview = await prisma.review.findUnique({
        where: { id: actualData.RatingId },
        select: { id: true, customerId: true, userId: true },
      });
      if (existingReview) reviewId = existingReview.id;
    }

    if (!existingReview && actualData.review_id) {
      existingReview = await prisma.review.findUnique({
        where: { id: actualData.review_id },
        select: { id: true, customerId: true, userId: true },
      });
      if (existingReview) reviewId = existingReview.id;
    }

    if (!existingReview && actualData.paymentId) {
      existingReview = await prisma.review.findFirst({
        where: { paymentWebhookId: actualData.paymentId },
        select: { id: true, customerId: true, userId: true },
      });
      if (existingReview) reviewId = existingReview.id;
    }

    if (!existingReview) {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { status: 'ignored', meta: { reason: 'review_not_found' } },
      }).catch(() => null);

      return res.status(200).json({ success: true, received: true, reason: 'review_not_found' });
    }

    const userId = existingReview.userId;

    // Subscription gate (queue if inactive)
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionExpirationDate: true,
          role: true,
        },
      });

      if (!isSubscriptionActive(user)) {
        await prisma.webhookLog.update({
          where: { id: webhookLog.id },
          data: {
            status: 'queued',
            meta: { reason: 'subscription_inactive', userId, reviewId },
          },
        }).catch(() => null);

        return res.status(200).json({ success: true, received: true, queued: true });
      }
    }

    // Update review
    if (actualData.Rating && reviewId) {
      await prisma.review.update({
        where: { id: reviewId },
        data: {
          rating: parseInt(actualData.Rating) || 0,
          message: actualData.Comment || actualData.Feedback || '',
          status: 'received',
          whatsappMessageId: actualData.WhatsappMessageId || null,
          messageStatus: 'received',
        },
      });
    }

    await prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: { status: 'processed', meta: { reviewId, userId } },
    }).catch(() => null);

    return res.status(200).json({ success: true, received: true, processed: true, review_id: reviewId });
  } catch (error) {
    console.error('Rating webhook error:', error);

    await prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: { status: 'failed', meta: { reason: 'exception', error: String(error?.message || error) } },
    }).catch(() => null);

    return res.status(200).json({ success: true, received: true, queued: true });
  }
};

// Handle payment checkout webhook - store logs always, process only when active
const handlePaymentCheckoutWebhook = async (req, res) => {
  const webhookData = req.body;
  const actualData = webhookData;

  // Always create raw log FIRST
  let paymentLog = null;
  try {
    paymentLog = await prisma.webhookPaymentLog.create({
      data: {
        data: webhookData,
        type: 'payment_checkout',
        createdDate: new Date(),
      },
    });
  } catch (e) {
    console.error('❌ Failed to write webhookPaymentLog:', e);
    return res.status(200).json({ success: true, received: true });
  }

  try {
    if (!actualData) {
      await prisma.webhookPaymentLog.update({
        where: { id: paymentLog.id },
        data: { meta: { status: 'ignored', reason: 'invalid_payload' } },
      }).catch(() => null);

      return res.status(200).json({ success: true, received: true, reason: 'invalid_payload' });
    }

    // Resolve userId early (BusinessName first)
    let userId = null;
    let customerId = null;

    let userFromBusiness = null;
    if (actualData.BusinessName) {
      userFromBusiness = await prisma.user.findFirst({
        where: { businessName: actualData.BusinessName },
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionExpirationDate: true,
          role: true,
        },
      });
      if (userFromBusiness) userId = userFromBusiness.id;
    }

    // CustomerPhone is required to link payment → customer
    if (!actualData.CustomerPhone) {
      await prisma.webhookPaymentLog.update({
        where: { id: paymentLog.id },
        data: { meta: { status: 'ignored', reason: 'missing_customer_phone', userId } },
      }).catch(() => null);

      return res.status(200).json({ success: true, received: true, reason: 'missing_customer_phone' });
    }

    const formattedPhone = formatIsraeliPhone(actualData.CustomerPhone);

    const existingCustomerByPhone = await prisma.customers.findFirst({
      where: { customerPhone: formattedPhone },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!existingCustomerByPhone) {
      await prisma.webhookPaymentLog.update({
        where: { id: paymentLog.id },
        data: { meta: { status: 'ignored', reason: 'customer_not_found_by_phone', formattedPhone, userId } },
      }).catch(() => null);

      return res.status(200).json({ success: true, received: true, reason: 'customer_not_found_by_phone' });
    }

    customerId = existingCustomerByPhone.id;
    if (!userId) userId = existingCustomerByPhone.userId;

    if (!userId) {
      await prisma.webhookPaymentLog.update({
        where: { id: paymentLog.id },
        data: { meta: { status: 'ignored', reason: 'user_not_found', customerId } },
      }).catch(() => null);

      return res.status(200).json({ success: true, received: true, reason: 'user_not_found' });
    }

    // Final subscription check (QUEUE if inactive)
    const finalUserCheck = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        role: true,
        phoneNumber: true,
        businessName: true,
        businessType: true,
        whatsappNumber: true,
        stripeSubscriptionId: true,
        email: true,
      },
    });

    if (!finalUserCheck || !isSubscriptionActive(finalUserCheck)) {
      await prisma.webhookPaymentLog.update({
        where: { id: paymentLog.id },
        data: { meta: { status: 'queued', reason: 'subscription_inactive', userId, customerId } },
      }).catch(() => null);

      // ALWAYS 200
      return res.status(200).json({ success: true, received: true, queued: true, reason: 'subscription_inactive' });
    }

    // ACTIVE → continue with your existing payment flow (unchanged core)
    // 1) Determine revenuePaymentStatus + previousStatus
    let revenuePaymentStatus = null;
    let previousStatus = null;

    const customerUser = await prisma.customerUser.findFirst({
      where: { customerId: customerId },
      select: { status: true },
    });

    if (customerUser && customerUser.status) {
      previousStatus = customerUser.status;
      if (customerUser.status === 'recovered') revenuePaymentStatus = 'recovered';
      else if (customerUser.status === 'lost' || customerUser.status === 'at_risk' || customerUser.status === 'risk') {
        revenuePaymentStatus = 'recovered';
      }
    }

    // 2) Store structured PaymentWebhook
    const paymentWebhook = await prisma.paymentWebhook.create({
      data: {
        total: parseFloat(actualData.Total) || 0.0,
        totalWithoutVAT: parseFloat(actualData.TotalWithoutVAT) || 0.0,
        totalVAT: parseFloat(actualData.TotalVAT) || 0.0,
        employeeId: parseInt(actualData.EmployeeId) || null,
        businessId: parseInt(actualData.BusinessId) || null,
        customerId: customerId,
        userId: userId,
        paymentDate: new Date(),
        status: 'success',
        customerOldStatus: previousStatus || null,
        revenuePaymentStatus: revenuePaymentStatus,
      },
    });

    // 3) Update CustomerUser status + logs (as you had)
    if (customerId && userId) {
      try {
        const existingCustomerUser = await prisma.customerUser.findFirst({
          where: { customerId, userId },
          select: { id: true, status: true },
        });

        if (existingCustomerUser) {
          const currentPreviousStatus = previousStatus || existingCustomerUser.status;
          let newStatus = null;
          let statusChangeReason = null;

          if (currentPreviousStatus === 'lost' || currentPreviousStatus === 'at_risk' || currentPreviousStatus === 'risk') {
            newStatus = 'recovered';
            statusChangeReason = `Payment received after being ${currentPreviousStatus === 'lost' ? 'lost' : 'at risk'}`;
          } else if (currentPreviousStatus === 'new') {
            newStatus = 'active';
            statusChangeReason = 'First payment received';
          }

          if (newStatus) {
            await prisma.customerUser.update({
              where: { id: existingCustomerUser.id },
              data: { status: newStatus },
            });

            await prisma.customerStatusLog.create({
              data: {
                customerId,
                userId,
                oldStatus:
                  currentPreviousStatus === 'lost'
                    ? 'Lost'
                    : currentPreviousStatus === 'at_risk' || currentPreviousStatus === 'risk'
                    ? 'Risk'
                    : 'New',
                newStatus: newStatus === 'recovered' ? 'Recovered' : 'Active',
                reason: statusChangeReason,
              },
            });

            // Send recovered notification (your logic, unchanged)
            if (newStatus === 'recovered') {
              try {
                const businessOwner = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { phoneNumber: true, businessName: true, businessType: true, whatsappNumber: true },
                });

                if (businessOwner && (businessOwner.phoneNumber || businessOwner.whatsappNumber)) {
                  const customer = await prisma.customers.findUnique({
                    where: { id: customerId },
                    select: { customerFullName: true, customerPhone: true, selectedServices: true },
                  });

                  if (customer) {
                    const whatsappMessageRecord = await createWhatsappMessageRecord(
                      customer.customerFullName,
                      customer.customerPhone,
                      'recovered',
                      userId
                    );

                    if (whatsappMessageRecord) {
                      const n8nService = new N8nMessageService();
                      await n8nService.triggerRecoveredCustomerNotification({
                        customerName: customer.customerFullName,
                        customerPhone: customer.customerPhone,
                        businessName: businessOwner.businessName || 'Business',
                        businessType: businessOwner.businessType || 'general',
                        customerService: customer.selectedServices || '',
                        businessOwnerPhone: businessOwner.phoneNumber,
                        lastVisitDate: new Date().toISOString().split('T')[0],
                        whatsappPhone: customer.customerPhone,
                        previousStatus: currentPreviousStatus,
                      });
                    }
                  }
                }
              } catch (notificationError) {
                console.error('❌ Error triggering n8n recovered customer notification:', notificationError);
              }
            }
          }
        }
      } catch (statusUpdateError) {
        console.error('❌ Error updating customer status after payment:', statusUpdateError);
      }
    }

    // 4) Review request flow (your logic stays, but do NOT return 4xx anywhere)
    // (You already return successResponse 200 when subscription blocks — good.)
    try {
      const customer = await prisma.customers.findUnique({
        where: { id: customerId },
        include: {
          user: {
            select: {
              businessName: true,
              businessType: true,
              phoneNumber: true,
              whatsappNumber: true,
            },
          },
        },
      });

      if (customer) {
        const n8nService = new N8nMessageService();

        const previousPayments = await prisma.paymentWebhook.count({
          where: { customerId: customerId },
        });

        const customerStatus = previousPayments <= 1 ? 'new' : 'active';

        const webhookParams = {
          customer_name: customer.customerFullName,
          customer_phone: customer.customerPhone,
          business_name: customer.user?.businessName || 'Business',
          business_type: customer.user?.businessType || 'general',
          customer_service: customer.selectedServices || '',
          business_owner_phone: customer.user?.phoneNumber,
          last_visit_date: new Date().toISOString().split('T')[0],
          whatsapp_phone: customer.customerPhone,
          customer_status: customerStatus,
        };

        const reviewRecord = await prisma.review.create({
          data: {
            customerId: customerId,
            userId: userId,
            rating: 0,
            message: `Rating request sent via N8N after payment`,
            status: 'sent',
            whatsappMessageId: null,
            messageStatus: 'pending',
            paymentWebhookId: paymentWebhook.id,
          },
        });

        const whatsappMessageRecord = await createWhatsappMessageRecord(
          customer.customerFullName,
          customer.customerPhone,
          'review_request',
          userId
        );

        if (whatsappMessageRecord) {
          // Stripe meter reporting stays (your existing logic can remain)
          try {
            if (finalUserCheck && finalUserCheck.stripeSubscriptionId) {
              const subscription = await stripe.subscriptions.retrieve(finalUserCheck.stripeSubscriptionId, {
                expand: ['items.data.price.product'],
              });

              const meteredItem = subscription.items.data.find(
                (item) => item.price?.recurring?.usage_type === 'metered'
              );

              if (meteredItem) {
                let eventName = 'whatsapp_message';

                if (meteredItem.price?.metadata?.event_name) eventName = meteredItem.price.metadata.event_name;
                else if (meteredItem.price?.product && typeof meteredItem.price.product === 'object') {
                  if (meteredItem.price.product.metadata?.event_name) eventName = meteredItem.price.product.metadata.event_name;
                }

                const stripeCustomerId = subscription.customer;
                const stripeCustomerIdStr = typeof stripeCustomerId === 'string' ? stripeCustomerId : stripeCustomerId?.id;

                if (stripeCustomerIdStr) {
                  await stripe.billing.meterEvents.create({
                    event_name: eventName,
                    payload: {
                      stripe_customer_id: stripeCustomerIdStr,
                      subscription_item: meteredItem.id,
                      value: 1,
                      timestamp: Math.floor(Date.now() / 1000),
                    },
                  });
                }
              }
            }
          } catch (stripeError) {
            console.error('❌ Error reporting usage to Stripe (payment webhook):', stripeError.message);
          }

          await n8nService.triggerReviewRequest({
            ...webhookParams,
            review_id: reviewRecord.id,
            payment_webhook_id: paymentWebhook.id,
          });
        }
      }
    } catch (webhookError) {
      console.error('❌ Error triggering n8n review request after payment:', webhookError);
    }

    // Mark raw paymentLog meta as processed (optional)
    await prisma.webhookPaymentLog.update({
      where: { id: paymentLog.id },
      data: { meta: { status: 'processed', userId, customerId, paymentWebhookId: paymentWebhook.id } },
    }).catch(() => null);

    // ALWAYS 200 to Calmark
    return res.status(200).json({
      success: true,
      received: true,
      processed: true,
      webhookId: paymentLog.id,
      paymentId: paymentWebhook.id,
      userId,
      customerId,
    });
  } catch (error) {
    console.error('Payment checkout webhook error:', error);

    await prisma.webhookPaymentLog.update({
      where: { id: paymentLog.id },
      data: { meta: { status: 'failed', reason: 'exception', error: String(error?.message || error) } },
    }).catch(() => null);

    // STILL 200
    return res.status(200).json({ success: true, received: true, queued: true });
  }
};

// ----- Admin endpoints (unchanged) -----

const getAllWebhookLogs = async (req, res) => {
  try {
    const { type, status, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const webhookLogs = await prisma.webhookLog.findMany({
      where,
      orderBy: { createdDate: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit),
    });

    const totalCount = await prisma.webhookLog.count({ where });

    return successResponse(
      res,
      {
        webhookLogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
      'Webhook logs retrieved successfully'
    );
  } catch (error) {
    console.error('Get webhook logs error:', error);
    return errorResponse(res, 'Failed to retrieve webhook logs', 500);
  }
};

const getWebhookLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const webhookLog = await prisma.webhookLog.findUnique({ where: { id } });
    if (!webhookLog) return errorResponse(res, 'Webhook log not found', 404);

    return successResponse(res, webhookLog, 'Webhook log retrieved successfully');
  } catch (error) {
    console.error('Get webhook log by ID error:', error);
    return errorResponse(res, 'Failed to retrieve webhook log', 500);
  }
};

const updateWebhookLogStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'processed', 'failed', 'received', 'queued', 'ignored'].includes(status)) {
      return errorResponse(res, 'Invalid status.', 400);
    }

    const updatedWebhookLog = await prisma.webhookLog.update({
      where: { id },
      data: { status },
    });

    return successResponse(res, updatedWebhookLog, 'Webhook log status updated successfully');
  } catch (error) {
    console.error('Update webhook log status error:', error);
    return errorResponse(res, 'Failed to update webhook log status', 500);
  }
};

// Payment webhooks endpoints (unchanged)
const getAllPaymentWebhooks = async (req, res) => {
  try {
    const { userId, customerId, status, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (userId) where.userId = userId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const paymentWebhooks = await prisma.paymentWebhook.findMany({
      where,
      include: {
        customer: { select: { id: true, customerFullName: true, customerPhone: true, selectedServices: true } },
        user: { select: { id: true, businessName: true, email: true, phoneNumber: true } },
        appointment: { select: { id: true, customerFullName: true, startDate: true, endDate: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit),
    });

    const totalCount = await prisma.paymentWebhook.count({ where });

    return successResponse(
      res,
      {
        paymentWebhooks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
      'Payment webhooks retrieved successfully'
    );
  } catch (error) {
    console.error('Get payment webhooks error:', error);
    return errorResponse(res, 'Failed to retrieve payment webhooks', 500);
  }
};

const getPaymentWebhookById = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentWebhook = await prisma.paymentWebhook.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, customerFullName: true, customerPhone: true, selectedServices: true, email: true } },
        user: { select: { id: true, businessName: true, email: true, phoneNumber: true, whatsappNumber: true } },
        appointment: { select: { id: true, customerFullName: true, startDate: true, endDate: true, duration: true, selectedServices: true } },
      },
    });

    if (!paymentWebhook) return errorResponse(res, 'Payment webhook not found', 404);

    return successResponse(res, paymentWebhook, 'Payment webhook retrieved successfully');
  } catch (error) {
    console.error('Get payment webhook by ID error:', error);
    return errorResponse(res, 'Failed to retrieve payment webhook', 500);
  }
};

const getPaymentWebhooksByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const skip = (page - 1) * limit;
    const where = { customerId };
    if (status) where.status = status;

    const paymentWebhooks = await prisma.paymentWebhook.findMany({
      where,
      include: {
        user: { select: { id: true, businessName: true, email: true, phoneNumber: true, whatsappNumber: true } },
        appointment: { select: { id: true, customerFullName: true, startDate: true, endDate: true, duration: true, selectedServices: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit),
    });

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true, customerFullName: true, customerPhone: true, selectedServices: true, email: true, createdAt: true, appointmentCount: true },
    });

    if (!customer) return errorResponse(res, 'Customer not found', 404);

    const totalCount = await prisma.paymentWebhook.count({ where });

    const totalRevenue = await prisma.paymentWebhook.aggregate({
      where: { customerId },
      _sum: { total: true },
      _count: { total: true },
    });

    return successResponse(
      res,
      {
        customer,
        paymentWebhooks,
        summary: {
          totalPayments: totalRevenue._count.total || 0,
          totalRevenue: totalRevenue._sum.total || 0,
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
      'Payment webhooks retrieved successfully by customer ID'
    );
  } catch (error) {
    console.error('Get payment webhooks by customer ID error:', error);
    return errorResponse(res, 'Failed to retrieve payment webhooks', 500);
  }
};

// (השאר אצלך נשאר אותו דבר: appointments / whatsapp handlers / createWhatsappMessageWithValidation וכו’)
// לא שיניתי אותם כי הבעיה המרכזית היא “inbound webhooks חייבים 200 תמיד”.

module.exports = {
  handleAppointmentWebhook,
  handleRatingWebhook,
  handlePaymentCheckoutWebhook,
  getAllWebhookLogs,
  getWebhookLogById,
  updateWebhookLogStatus,
  // השאר אצלך נשאר כמו שהיה (אם אתה צריך שאחבר גם אותם מחדש תגיד)
  handleWhatsAppIncomingMessage: require('./webhookController').handleWhatsAppIncomingMessage,
  verifyWhatsAppWebhook: require('./webhookController').verifyWhatsAppWebhook,
  getAllPaymentWebhooks,
  getPaymentWebhookById,
  getPaymentWebhooksByCustomerId,
  getAllAppointments: require('./webhookController').getAllAppointments,
  getAppointmentById: require('./webhookController').getAppointmentById,
  getAppointmentsByCustomerId: require('./webhookController').getAppointmentsByCustomerId,
  createWhatsappMessageWithValidation: require('./webhookController').createWhatsappMessageWithValidation,
};

