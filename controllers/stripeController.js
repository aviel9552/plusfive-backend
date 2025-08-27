const { stripe, getStripePrices, getOrCreateStripeCustomer } = require('../lib/stripe');
const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

/**
 * Create Stripe checkout session
 */
const createCheckoutSession = async (req, res) => {
  try {
    const { priceId } = req.body;
    const userId = req.user.userId;
    
    if (!priceId) {
      return errorResponse(res, 'Missing priceId', 400);
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        stripeCustomerId: true 
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.email) {
      return errorResponse(res, 'User email is missing', 400);
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await getOrCreateStripeCustomer(user.email, userId);
      stripeCustomerId = customer.id;

      // Save stripeCustomerId to database
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId }
      });
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: req.body.successUrl || `${process.env.FRONTEND_URL}/dashboard?success=true`,
      cancel_url: req.body.cancelUrl || `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      customer: stripeCustomerId,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          userId: userId
        }
      }
    });

    return successResponse(res, {
      url: checkoutSession.url,
      sessionId: checkoutSession.id
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    return errorResponse(res, 'Failed to create checkout session', 500);
  }
};

/**
 * Get available Stripe prices
 */
const getPrices = async (req, res) => {
  try {
    const prices = await getStripePrices();
    return successResponse(res, { prices });
  } catch (error) {
    console.error('Get prices error:', error);
    return errorResponse(res, 'Failed to fetch prices', 500);
  }
};

/**
 * Get user subscription information
 */
const getSubscription = async (req, res) => {
  try {
    const userId = req.user.userId;
    // Get user from database
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId && user.email) {
      const customer = await getOrCreateStripeCustomer(user.email, userId);
      stripeCustomerId = customer.id;
      
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId }
      });
      
      user = await prisma.user.findUnique({ where: { id: userId } });
    }

    if (!stripeCustomerId) {
      return errorResponse(res, 'Stripe customer not found or created', 404);
    }

    // Get subscriptions and invoices
    const [subscriptions, invoices] = await Promise.all([
      stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 20,
        expand: ['data.items.data.price', 'data.plan', 'data.latest_invoice']
      }),
      stripe.invoices.list({
        customer: stripeCustomerId,
        limit: 20,
        expand: ['data.subscription', 'data.charge']
      })
    ]);

    // Format subscriptions
    const formattedSubscriptions = subscriptions.data.map(sub => {
      const anySub = sub;
      return {
        id: sub.id,
        status: sub.status,
        current_period_start: anySub.current_period_start,
        current_period_end: anySub.current_period_end,
        plan: 
          anySub.items?.data[0]?.price?.nickname ||
          anySub.plan?.nickname ||
          anySub.items?.data[0]?.plan?.nickname ||
          null,
        items: anySub.items,
        latest_invoice: anySub.latest_invoice,
      };
    });

    // Format invoices
    const formattedInvoices = invoices.data.map(inv => {
      const i = inv;
      return {
        id: i.id,
        amount_paid: i.amount_paid,
        currency: i.currency,
        status: i.status,
        hosted_invoice_url: i.hosted_invoice_url,
        created: i.created,
        subscription: typeof i.subscription === 'string'
          ? i.subscription
          : i.subscription?.id
      };
    });

    return successResponse(res, {
      user,
      stripe: {
        subscriptions: formattedSubscriptions,
        invoices: formattedInvoices,
      }
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    return errorResponse(res, 'Failed to fetch subscription data', 500);
  }
};

/**
 * Cancel subscription
 */
const cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user.userId;

    // Verify user owns this subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true }
    });

    if (!user?.stripeCustomerId) {
      return errorResponse(res, 'User not found or no Stripe customer', 404);
    }

    // Get subscription to verify ownership
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.customer !== user.stripeCustomerId) {
      return errorResponse(res, 'Subscription not found or access denied', 404);
    }

    // Cancel subscription at period end
    const canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    // Update user in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'canceled',
        subscriptionExpirationDate: new Date(canceledSubscription.current_period_end * 1000)
      }
    });

    return successResponse(res, {
      message: 'Subscription will be canceled at the end of the current period',
      subscription: canceledSubscription
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return errorResponse(res, 'Failed to cancel subscription', 500);
  }
};

/**
 * Create customer portal session for subscription management
 */
const createCustomerPortalSession = async (req, res) => {
  try {
    const { returnUrl } = req.body;
    const userId = req.user.userId;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        stripeCustomerId: true 
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.stripeCustomerId) {
      return errorResponse(res, 'No Stripe customer found', 400);
    }

    // Create customer portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl || `${process.env.FRONTEND_BASE_URL}/dashboard`
    });

    return successResponse(res, {
      url: portalSession.url,
      sessionId: portalSession.id
    });

  } catch (error) {
    console.error('Create customer portal session error:', error);
    return errorResponse(res, 'Failed to create customer portal session', 500);
  }
};

/**
 * Reactivate subscription
 */
const reactivateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user.userId;

    // Verify user owns this subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true }
    });

    if (!user?.stripeCustomerId) {
      return errorResponse(res, 'User not found or no Stripe customer', 404);
    }

    // Get subscription to verify ownership
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.customer !== user.stripeCustomerId) {
      return errorResponse(res, 'Subscription not found or access denied', 404);
    }

    // Reactivate subscription
    const reactivatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });

    // Update user in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'active'
      }
    });

    return successResponse(res, {
      message: 'Subscription reactivated successfully',
      subscription: reactivatedSubscription
    });

  } catch (error) {
    console.error('Reactivate subscription error:', error);
    return errorResponse(res, 'Failed to reactivate subscription', 500);
  }
};

/**
 * Handle Stripe webhooks
 */
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`✅ Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionChange(subscription.customer, subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await handleSubscriptionChange(subscription.customer, subscription);
          } catch (err) {
            console.error('Error retrieving subscription in invoice.paid:', err.message);
          }
        }
        break;
      }

      case 'customer.created':
      case 'customer.updated': {
        const customer = event.data.object;
        await handleCustomerChange(customer);
        break;
      }

      default:
        console.log(`🔔 Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Handle subscription changes
 */
const handleSubscriptionChange = async (customerId, subscription) => {
  try {
    // Find user by stripeCustomerId
    let user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId }
    });

    // Fallback: find by metadata.userId
    if (!user && subscription.metadata?.userId) {
      user = await prisma.user.findUnique({
        where: { id: subscription.metadata.userId }
      });
    }

    // Fallback: find by customer email
    if (!user) {
      try {
        const stripeCustomer = await stripe.customers.retrieve(customerId);
        if (stripeCustomer.email) {
          user = await prisma.user.findFirst({ where: { email: stripeCustomer.email } });
        }
      } catch (err) {
        console.warn('Error retrieving Stripe Customer:', err.message);
      }
    }

    if (!user) {
      console.warn(`⚠️ User not found for customerId="${customerId}". Skipping update.`);
      return;
    }

    // Extract plan information
    const price = subscription.items?.data?.[0]?.price;
    const planName = price?.nickname || price?.id || null;

    const periodStart = subscription.current_period_start 
      ? new Date(subscription.current_period_start * 1000) 
      : null;
    
    const periodEnd = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000) 
      : null;

    const status = subscription.status;

    // Update user in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: status === 'active' ? 'subscriber' : 'user',
        subscriptionPlan: planName,
        subscriptionStatus: status === 'active' ? 'active' : 'inactive',
        subscriptionStartDate: periodStart,
        subscriptionExpirationDate: periodEnd,
        stripeSubscriptionId: subscription.id
      }
    });

    console.log(
      `✅ Updated user "${user.id}" (stripeCustomerId="${customerId}"): status=${status}, plan=${planName}, periodStart=${periodStart}, periodEnd=${periodEnd}`
    );
  } catch (error) {
    console.error('❌ Error in handleSubscriptionChange:', error.message);
  }
};

/**
 * Get user's payment methods
 */
const getPaymentMethods = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        stripeCustomerId: true 
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.stripeCustomerId) {
      return errorResponse(res, 'No Stripe customer found', 400);
    }

    // Get payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card'
    });

    return successResponse(res, {
      paymentMethods: paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year
        },
        isDefault: pm.metadata.isDefault === 'true'
      }))
    });

  } catch (error) {
    console.error('Get payment methods error:', error);
    return errorResponse(res, 'Failed to fetch payment methods', 500);
  }
};

/**
 * Add new payment method
 */
const addPaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId, isDefault = false, billingDetails } = req.body;
    const userId = req.user.userId;

    if (!paymentMethodId) {
      return errorResponse(res, 'Missing paymentMethodId', 400);
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        stripeCustomerId: true 
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.stripeCustomerId) {
      return errorResponse(res, 'No Stripe customer found', 400);
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId
    });

    // Update payment method with billing details if provided
    if (billingDetails) {
      await stripe.paymentMethods.update(paymentMethodId, {
        billing_details: {
          name: billingDetails.cardholderName,
          address: {
            line1: billingDetails.billingAddress,
            city: billingDetails.city,
            postal_code: billingDetails.zipCode,
            country: billingDetails.country || 'US'
          }
        }
      });
    }

    // If this is the default payment method, update customer
    if (isDefault) {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    }

    return successResponse(res, {
      message: 'Payment method added successfully',
      paymentMethodId
    });

  } catch (error) {
    console.error('Add payment method error:', error);
    return errorResponse(res, 'Failed to add payment method', 500);
  }
};

/**
 * Update payment method (set as default)
 */
const updatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const { isDefault } = req.body;
    const userId = req.user.userId;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        stripeCustomerId: true 
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.stripeCustomerId) {
      return errorResponse(res, 'No Stripe customer found', 400);
    }

    // Verify payment method belongs to user
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== user.stripeCustomerId) {
      return errorResponse(res, 'Payment method not found or access denied', 404);
    }

    // Update payment method
    if (isDefault !== undefined) {
      if (isDefault) {
        // Set as default payment method
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }
    }

    return successResponse(res, {
      message: 'Payment method updated successfully',
      paymentMethodId
    });

  } catch (error) {
    console.error('Update payment method error:', error);
    return errorResponse(res, 'Failed to update payment method', 500);
  }
};

/**
 * Remove payment method
 */
const removePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const userId = req.user.userId;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        stripeCustomerId: true 
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.stripeCustomerId) {
      return errorResponse(res, 'No Stripe customer found', 400);
    }

    // Verify payment method belongs to user
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== user.stripeCustomerId) {
      return errorResponse(res, 'Payment method not found or access denied', 404);
    }

    // Detach payment method
    await stripe.paymentMethods.detach(paymentMethodId);

    return successResponse(res, {
      message: 'Payment method removed successfully',
      paymentMethodId
    });

  } catch (error) {
    console.error('Remove payment method error:', error);
    return errorResponse(res, 'Failed to remove payment method', 500);
  }
};

/**
 * Handle customer changes
 */
const handleCustomerChange = async (customer) => {
  try {
    const metadataUserId = customer.metadata?.userId;
    const stripeCusId = customer.id;
    const email = customer.email;

    if (metadataUserId) {
      // Update user by metadata.userId
      try {
        await prisma.user.update({
          where: { id: metadataUserId },
          data: {
            stripeCustomerId: stripeCusId,
            ...(email ? { email } : {})
          }
        });
        console.log(
          `✅ (customer.updated) Saved stripeCustomerId="${stripeCusId}" & email="${email}" for user.id="${metadataUserId}"`
        );
      } catch (err) {
        console.warn(
          `⚠️ (customer.updated) Could not update user by metadata.userId="${metadataUserId}":`,
          err.message
        );
      }
    } else if (email) {
      // Find user by email
      const user = await prisma.user.findFirst({ where: { email } });
      if (user) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: stripeCusId }
          });
          console.log(
            `✅ (customer.updated) Saved stripeCustomerId="${stripeCusId}" for user.id="${user.id}" by email="${email}"`
          );
        } catch (err) {
          console.warn(
            `⚠️ (customer.updated) Could not update user by id="${user.id}":`,
            err.message
          );
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in handleCustomerChange:', error.message);
  }
};

module.exports = {
  createCheckoutSession,
  getPrices,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  createCustomerPortalSession,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  removePaymentMethod,
  handleWebhook
};
