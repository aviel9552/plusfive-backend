const { stripe, getStripePrices, getOrCreateStripeCustomer, reportUsageForMonth, calculateCommissionFromInvoice } = require('../lib/stripe');
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
        email: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.email) {
      return errorResponse(res, 'User email is missing', 400);
    }

    // Create new Stripe customer for each checkout (no reuse)
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: userId
      }
    });

    const stripeCustomerId = customer.id;

    // Retrieve price to auto-detect metered vs non-metered and currency
    const price = await stripe.prices.retrieve(priceId);

    const isMetered = price?.recurring?.usage_type === 'metered';
    
    // Get plan name from price data
    const planName = price?.nickname || price?.product?.name || 'Growth';

    // Update user table with subscription data
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStartDate: new Date(),
        subscriptionStatus: 'pending', // Will be 'active' after payment success
        subscriptionExpirationDate: null, // Will be set by webhook with actual Stripe data
        subscriptionPlan: planName
      }
    });

    // Guard: prevent mixed-currency subscriptions for the same customer
    const existingSubs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
      limit: 1
    });

    if (existingSubs.data.length > 0) {
      const existingCurrency = existingSubs.data[0]?.items?.data?.[0]?.price?.currency;
      if (existingCurrency && existingCurrency !== price.currency) {
        return errorResponse(
          res,
          `Currency mismatch: existing subscription is in ${existingCurrency.toUpperCase()} but selected price is ${price.currency.toUpperCase()}. Use a price with ${existingCurrency.toUpperCase()} or cancel the existing subscription.`,
          400
        );
      }
    }

    // Build line item: quantity only for non-metered prices
    const lineItem = isMetered
      ? { price: priceId }
      : { price: priceId, quantity: 1 };

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [lineItem],
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
 * Create simple one-time payment checkout (not subscription)
 */
const createSimpleCheckout = async (req, res) => {
  try {
    const { amount, currency = 'usd', description } = req.body;
    const userId = req.user.userId;

    if (!amount) {
      return errorResponse(res, 'Amount is required', 400);
    }

    // Get user from database
    const user = await prisma.user.findUnique({
        where: { id: userId },
      select: { 
        id: true, 
        email: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (!user.email) {
      return errorResponse(res, 'User email is missing', 400);
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: userId
      }
    });

    // Create one-time payment checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment', // One-time payment, not subscription
      line_items: [{
        price_data: {
          currency: currency,
          product_data: {
            name: description || 'Simple Payment',
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      }],
      success_url: req.body.successUrl || `${process.env.FRONTEND_URL}/app/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: req.body.cancelUrl || `${process.env.FRONTEND_URL}/app/payment-cancel`,
      customer: customer.id,
      metadata: {
        userId: userId,
        paymentType: 'simple'
      }
    });


    // Track payment in database
    await trackPayment({
      userId: userId,
      paymentType: 'simple',
      amount: parseFloat(amount),
      currency: currency,
      description: description,
      stripeSessionId: checkoutSession.id,
      stripeCustomerId: customer.id,
      status: 'pending',
      source: 'simple_checkout',
      metadata: {
        checkoutUrl: checkoutSession.url,
        successUrl: req.body.successUrl,
        cancelUrl: req.body.cancelUrl
      }
    });

    return successResponse(res, {
      url: checkoutSession.url,
      sessionId: checkoutSession.id
    });

  } catch (error) {
    console.error('Create simple checkout error:', error);
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
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Get subscriptions by searching for user's email in Stripe customers
    let subscriptions = [];
    let invoices = [];
    
    try {
      // Search for customers with this email
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 10
      });

      if (customers.data.length > 0) {
        // Get subscriptions for all customers with this email
        const subscriptionPromises = customers.data.map(customer => 
          stripe.subscriptions.list({
            customer: customer.id,
              limit: 20,
              expand: ['data.items.data.price', 'data.plan', 'data.latest_invoice']
          })
        );

        const invoicePromises = customers.data.map(customer =>
          stripe.invoices.list({
            customer: customer.id,
        limit: 20,
        expand: ['data.subscription', 'data.charge']
          })
        );

        const [subscriptionResults, invoiceResults] = await Promise.all([
          Promise.all(subscriptionPromises),
          Promise.all(invoicePromises)
        ]);

        // Flatten results
        subscriptions = subscriptionResults.flatMap(result => result.data);
        invoices = invoiceResults.flatMap(result => result.data);
      }
      } catch (stripeError) {
        // Return empty data instead of error
      }

    // Format subscriptions
    const formattedSubscriptions = subscriptions.map(sub => {
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
    const formattedInvoices = invoices.map(inv => {
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
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }


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
        
        // Process affiliate commission if promotion code was used
        try {
          const commissionData = await calculateCommissionFromInvoice(invoice.id);
          
          if (commissionData) {
            // Find referral by partner ID (referred user) and promotion code
            const referral = await prisma.referral.findFirst({
              where: {
                referredUserId: commissionData.partnerId,
                stripePromotionCodeId: commissionData.promotionCodeId
              },
              include: {
                referrer: {
                  select: { email: true, firstName: true, lastName: true }
                }
              }
            });

            if (referral) {
              // Update referral with commission
              await prisma.referral.update({
                where: { id: referral.id },
                data: {
                  commission: {
                    increment: commissionData.commissionAmount
                  },
                  totalCommissionEarned: {
                    increment: commissionData.commissionAmount
                  },
                  invoicesPaid: {
                    increment: 1
                  },
                  lastCommissionDate: new Date()
                }
              });

            }
          }
        } catch (commissionError) {
          console.error('❌ Error processing affiliate commission:', commissionError);
        }
        
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

      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }

      case 'customer.created':
      case 'customer.updated': {
        const customer = event.data.object;
        await handleCustomerChange(customer);
        break;
      }

      default:
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Track payment in database
 */
const trackPayment = async (paymentData) => {
  try {
    const {
      userId,
      paymentType,
      amount,
      currency,
      description,
      stripeSessionId,
      stripePaymentId,
      stripeSubscriptionId,
      stripeCustomerId,
      status = 'pending',
      paymentMethod,
      source = 'api',
      metadata = {}
    } = paymentData;

    const paymentRecord = await prisma.paymentHistory.create({
      data: {
        userId,
        paymentType,
        amount,
        currency,
        description,
        stripeSessionId,
        stripePaymentId,
        stripeSubscriptionId,
        stripeCustomerId,
        status,
        paymentMethod,
        source,
        metadata
      }
    });

    return paymentRecord;
  } catch (error) {
    console.error('❌ Error tracking payment:', error);
    throw error;
  }
};

/**
 * Handle subscription changes
 */
const handleSubscriptionChange = async (customerId, subscription) => {
  try {
    // Find user by metadata.userId first (primary method)
    let user = null;
    if (subscription.metadata?.userId) {
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
        // Stripe customer retrieval failed
      }
    }

    if (!user) {
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

    // Use Stripe's actual period end date
    let subscriptionExpirationDate = periodEnd;

    // Update user in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        // role: status === 'active' ? 'subscriber' : 'user', // Commented out - role update disabled
        subscriptionPlan: planName,
        // subscriptionStatus: status === 'active' ? 'active' : 'inactive',
        subscriptionStatus: 'active',
        subscriptionStartDate: periodStart,
        subscriptionExpirationDate: subscriptionExpirationDate,
        stripeSubscriptionId: subscription.id
      }
    });

    // Track subscription payment
    await trackPayment({
      userId: user.id,
      paymentType: 'subscription',
      amount: subscription.items?.data?.[0]?.price?.unit_amount ? subscription.items.data[0].price.unit_amount / 100 : 0,
      currency: subscription.items?.data?.[0]?.price?.currency || 'usd',
      description: `Subscription: ${planName}`,
      stripeSessionId: null,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      status: status === 'active' ? 'succeeded' : 'failed',
      source: 'webhook',
      metadata: {
        subscriptionStatus: status,
        planName: planName,
        periodStart: periodStart,
        periodEnd: periodEnd,
        subscriptionItems: subscription.items?.data?.length || 0,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        trialStart: subscription.trial_start,
        trialEnd: subscription.trial_end
      }
    });


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

    // Get customer to check default payment method
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method;
    
    return successResponse(res, {
      paymentMethods: paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          // Professional expiry display
          expiry_date: `${pm.card.exp_month.toString().padStart(2, '0')}/${pm.card.exp_year.toString().slice(-2)}`,
          // Card brand icon and display name
          brand_display: pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1),
          // Masked card number for display
          masked_number: `•••• •••• •••• ${pm.card.last4}`,
          // Check if card is expired
          is_expired: new Date(pm.card.exp_year, pm.card.exp_month - 1) < new Date()
        },
        billing_details: pm.billing_details || null,
        // Check if this is the default payment method
        isDefault: pm.id === defaultPaymentMethodId,
        // Additional metadata
        created: pm.created,
        livemode: pm.livemode
      }))
    });

  } catch (error) {
    console.error('Get payment methods error:', error);
    return errorResponse(res, 'Failed to fetch payment methods', 500);
  }
};

/**
 * Get comprehensive billing dashboard data
 */
const getBillingDashboard = async (req, res) => {
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

    // Get customer and subscription data
    const [customer, subscriptions, invoices] = await Promise.all([
      stripe.customers.retrieve(user.stripeCustomerId),
      stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
        limit: 1
      }),
      stripe.invoices.list({
        customer: user.stripeCustomerId,
        status: 'paid',
        limit: 10
      })
    ]);

    // Get payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card'
    });

    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method;
    const activeSubscription = subscriptions.data[0];
    
    // Calculate billing cycle dates
    let currentBillingCycle = null;
    let nextBillingDate = null;
    let amountToBeCharged = null;

    if (activeSubscription) {
      const now = new Date();
      const periodStart = new Date(activeSubscription.current_period_start * 1000);
      const periodEnd = new Date(activeSubscription.current_period_end * 1000);
      
      // Format billing cycle dates
      currentBillingCycle = {
        start: periodStart.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric' 
        }),
        end: periodEnd.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        }),
        full_range: `${periodStart.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric' 
        })} - ${periodEnd.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        })}`
      };

      nextBillingDate = periodEnd.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });

      // Get amount from subscription
      if (activeSubscription.items?.data[0]?.price) {
        const price = activeSubscription.items.data[0].price;
        amountToBeCharged = {
          amount: (price.unit_amount / 100).toFixed(2),
          currency: price.currency.toUpperCase(),
          formatted: `$${(price.unit_amount / 100).toFixed(2)}`
        };
      }
    }

    // Get default payment method for display with enhanced information
    let defaultPaymentMethod = null;
    if (defaultPaymentMethodId) {
      const defaultPM = paymentMethods.data.find(pm => pm.id === defaultPaymentMethodId);
      if (defaultPM) {
        defaultPaymentMethod = {
          id: defaultPM.id,
          brand: defaultPM.card.brand,
          last4: defaultPM.card.last4,
          exp_month: defaultPM.card.exp_month,
          exp_year: defaultPM.card.exp_year,
          expiry_date: `${defaultPM.card.exp_month.toString().padStart(2, '0')}/${defaultPM.card.exp_year.toString().slice(-2)}`,
          brand_display: defaultPM.card.brand.charAt(0).toUpperCase() + defaultPM.card.brand.slice(1),
          display: `${defaultPM.card.brand.charAt(0).toUpperCase() + defaultPM.card.brand.slice(1)} **** ${defaultPM.card.last4}`,
          masked_number: `•••• •••• •••• ${defaultPM.card.last4}`,
          is_expired: new Date(defaultPM.card.exp_year, defaultPM.card.exp_month - 1) < new Date(),
          billing_details: defaultPM.billing_details || null
        };
      }
    }

    return successResponse(res, {
      // Security info (for the purple shield section)
      security: {
        encrypted: true,
        ssl_protection: "256-bit SSL protection",
        message: "All payment information is encrypted and securely stored with 256-bit SSL protection"
      },
      
      // Payment methods (for the cards section)
      paymentMethods: paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          expiry_date: `${pm.card.exp_month.toString().padStart(2, '0')}/${pm.card.exp_year.toString().slice(-2)}`,
          brand_display: pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1),
          masked_number: `•••• •••• •••• ${pm.card.last4}`,
          is_expired: new Date(pm.card.exp_year, pm.card.exp_month - 1) < new Date()
        },
        billing_details: pm.billing_details || null,
        isDefault: pm.id === defaultPaymentMethodId,
        created: pm.created,
        livemode: pm.livemode
      })),
      
      // Billing information (for the right section) - ENHANCED with active payment method
      billing: {
        current_billing_cycle: currentBillingCycle,
        next_billing_date: nextBillingDate,
        amount_to_be_charged: amountToBeCharged,
        payment_method: defaultPaymentMethod,
        subscription_status: activeSubscription ? activeSubscription.status : 'inactive',
        subscription_plan: activeSubscription?.items?.data[0]?.price?.nickname || 'No active plan',
        // Additional billing details
        has_active_payment_method: !!defaultPaymentMethod,
        payment_method_count: paymentMethods.data.length,
        next_payment_date: nextBillingDate,
        subscription_id: activeSubscription?.id || null
      }
    });

  } catch (error) {
    console.error('Get billing dashboard error:', error);
    return errorResponse(res, 'Failed to fetch billing dashboard data', 500);
  }
};

/**
 * Add new payment method - Professional Implementation
 */
const addPaymentMethod = async (req, res) => {
  try {
    const { 
      paymentMethodId, 
      isDefault = false, 
      cardholderName,
      billingAddress,
      city,
      state,
      postalCode,
      country = 'US',
      // Additional card details for validation and display
      last4,
      brand,
      expMonth,
      expYear
    } = req.body;
    
    const userId = req.user.userId;

    // Enhanced input validation
    if (!paymentMethodId) {
      return errorResponse(res, 'Payment method ID is required', 400);
    }

    if (!cardholderName || !billingAddress || !city || !postalCode) {
      return errorResponse(res, 'Missing required billing information: cardholderName, billingAddress, city, and postalCode are required', 400);
    }

    // Validate card details if provided
    if (last4 && !/^\d{4}$/.test(last4)) {
      return errorResponse(res, 'Invalid last4 digits format', 400);
    }

    if (expMonth && (expMonth < 1 || expMonth > 12)) {
      return errorResponse(res, 'Invalid expiration month (1-12)', 400);
    }

    if (expYear && expYear < new Date().getFullYear()) {
      return errorResponse(res, 'Card has expired', 400);
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

    if (!user.stripeCustomerId) {
      return errorResponse(res, 'No Stripe customer found', 400);
    }

    // Verify payment method exists and is not already attached
    let paymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      
      // Check if already attached to another customer
      if (paymentMethod.customer && paymentMethod.customer !== user.stripeCustomerId) {
        return errorResponse(res, 'Payment method is already attached to another account', 400);
      }
      
      // Check if already attached to this customer
      if (paymentMethod.customer === user.stripeCustomerId) {
        return errorResponse(res, 'Payment method is already added to your account', 400);
      }
    } catch (stripeError) {
      if (stripeError.code === 'resource_missing') {
        return errorResponse(res, 'Invalid payment method ID', 400);
      }
      throw stripeError;
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId
    });

    // Update payment method with comprehensive billing details
    const billingDetails = {
      name: cardholderName,
      address: {
        line1: billingAddress,
        city: city,
        state: state,
        postal_code: postalCode,
        country: country
      }
    };

    await stripe.paymentMethods.update(paymentMethodId, {
      billing_details: billingDetails,
      metadata: {
        added_by: userId,
        added_at: new Date().toISOString(),
        source: 'web_dashboard'
      }
    });

    // If this is the default payment method, update customer
    if (isDefault) {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    }

    // Get updated payment method with all details
    const updatedPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId, {
      expand: ['customer']
    });

    // Format response data
    const responseData = {
      id: updatedPaymentMethod.id,
      type: updatedPaymentMethod.type,
      card: {
        brand: updatedPaymentMethod.card.brand,
        last4: updatedPaymentMethod.card.last4,
        exp_month: updatedPaymentMethod.card.exp_month,
        exp_year: updatedPaymentMethod.card.exp_year,
        expiry_date: `${updatedPaymentMethod.card.exp_month.toString().padStart(2, '0')}/${updatedPaymentMethod.card.exp_year.toString().slice(-2)}`,
        brand_display: updatedPaymentMethod.card.brand.charAt(0).toUpperCase() + updatedPaymentMethod.card.brand.slice(1),
        masked_number: `•••• •••• •••• ${updatedPaymentMethod.card.last4}`,
        is_expired: new Date(updatedPaymentMethod.card.exp_year, updatedPaymentMethod.card.exp_month - 1) < new Date()
      },
      billing_details: {
        name: updatedPaymentMethod.billing_details.name,
        address: updatedPaymentMethod.billing_details.address
      },
      isDefault: isDefault,
      created: updatedPaymentMethod.created,
      livemode: updatedPaymentMethod.livemode
    };

    return successResponse(res, {
      message: 'Payment method added successfully',
      data: responseData,
      metadata: {
        added_at: new Date().toISOString(),
        is_default: isDefault,
        total_payment_methods: await getPaymentMethodCount(user.stripeCustomerId)
      }
    });

  } catch (error) {
    console.error('Add payment method error:', error);
    
    // Handle specific Stripe errors professionally
    if (error.type === 'StripeCardError') {
      return errorResponse(res, `Card error: ${error.message}`, 400);
    } else if (error.type === 'StripeInvalidRequestError') {
      return errorResponse(res, `Invalid request: ${error.message}`, 400);
    } else if (error.type === 'StripeAPIError') {
      return errorResponse(res, 'Payment service temporarily unavailable. Please try again.', 503);
    } else if (error.code === 'resource_missing') {
      return errorResponse(res, 'Invalid payment method ID provided', 400);
    }
    
    return errorResponse(res, 'Failed to add payment method. Please try again.', 500);
  }
};

/**
 * Helper function to get payment method count
 */
const getPaymentMethodCount = async (stripeCustomerId) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card'
    });
    return paymentMethods.data.length;
  } catch (error) {
    console.error('Error getting payment method count:', error);
    return 0;
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
 * Remove payment method - Professional Implementation
 */
const removePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const userId = req.user.userId;

    // Input validation
    if (!paymentMethodId) {
      return errorResponse(res, 'Payment method ID is required', 400);
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

    // Verify payment method exists and belongs to user
    let paymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (stripeError) {
      if (stripeError.code === 'resource_missing') {
        return errorResponse(res, 'Payment method not found', 404);
      }
      throw stripeError;
    }

    // Security check: Verify payment method belongs to user
    if (paymentMethod.customer !== user.stripeCustomerId) {
      return errorResponse(res, 'Payment method not found or access denied', 403);
    }

    // Check if this is the default payment method
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    const isDefault = customer.invoice_settings?.default_payment_method === paymentMethodId;

    // Additional safety check: Prevent removing if it's the only payment method
    const allPaymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card'
    });

    if (allPaymentMethods.data.length === 1) {
      return errorResponse(res, 'Cannot remove the only payment method. Please add another one first.', 400);
    }

    // Check if this payment method is used in active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active'
    });

    const isUsedInSubscription = subscriptions.data.some(sub => 
      sub.default_payment_method === paymentMethodId
    );

    if (isUsedInSubscription) {
      return errorResponse(res, 'Cannot remove payment method that is used in active subscriptions. Please update your subscription first.', 400);
    }

    // Detach payment method from Stripe
    await stripe.paymentMethods.detach(paymentMethodId);

    // If this was the default payment method, set another one as default
    if (isDefault) {
      const remainingPaymentMethods = allPaymentMethods.data.filter(pm => pm.id !== paymentMethodId);
      if (remainingPaymentMethods.length > 0) {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: remainingPaymentMethods[0].id
          }
        });
      }
    }

   
    return successResponse(res, {
      message: 'Payment method removed successfully',
      data: {
        paymentMethodId,
        wasDefault: isDefault,
        remainingPaymentMethods: allPaymentMethods.data.length - 1,
        message: isDefault 
          ? 'Payment method removed and another one set as default'
          : 'Payment method removed successfully'
      }
    });

  } catch (error) {
    console.error('Remove payment method error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return errorResponse(res, 'Card error occurred while removing payment method', 400);
    } else if (error.type === 'StripeInvalidRequestError') {
      return errorResponse(res, 'Invalid request to remove payment method', 400);
    } else if (error.type === 'StripeAPIError') {
      return errorResponse(res, 'Stripe API error occurred', 500);
    }
    
    return errorResponse(res, 'Failed to remove payment method', 500);
  }
};

/**
 * Handle checkout session completed
 */
const handleCheckoutSessionCompleted = async (session) => {
  try {
    // Find user by customer ID
    const customer = await stripe.customers.retrieve(session.customer);
    const user = await prisma.user.findFirst({ 
      where: { email: customer.email } 
    });

    if (!user) {
      return;
    }

    // Get payment intent details
    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
    
    // Update payment record with actual Stripe data
    await prisma.paymentHistory.updateMany({
      where: {
        userId: user.id,
        stripeSessionId: session.id
      },
      data: {
        stripePaymentId: paymentIntent.id,
        status: 'succeeded',
        paymentMethod: paymentIntent.payment_method_types?.[0] || 'card',
        metadata: {
          ...session.metadata,
          paymentIntentStatus: paymentIntent.status,
          amountReceived: paymentIntent.amount_received,
          currency: paymentIntent.currency
        }
      }
    });


  } catch (error) {
    console.error('❌ Error handling checkout session completed:', error);
  }
};

/**
 * Handle payment intent succeeded
 */
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  try {
    // Find payment record by payment intent ID
    const paymentRecord = await prisma.paymentHistory.findFirst({
      where: { stripePaymentId: paymentIntent.id }
    });

    if (paymentRecord) {
      // Update payment record
      await prisma.paymentHistory.update({
        where: { id: paymentRecord.id },
        data: {
          status: 'succeeded',
          paymentMethod: paymentIntent.payment_method_types?.[0] || 'card',
          metadata: {
            ...paymentRecord.metadata,
            paymentIntentStatus: paymentIntent.status,
            amountReceived: paymentIntent.amount_received,
            currency: paymentIntent.currency,
            charges: paymentIntent.charges?.data?.[0]?.id
          }
        }
      });
    }

  } catch (error) {
    console.error('❌ Error handling payment intent succeeded:', error);
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
      
      } catch (err) {
        // User update failed
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
        
        } catch (err) {
          // User update failed
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in handleCustomerChange:', error.message);
  }
};

/**
 * Manually trigger monthly usage reporting
 */
const triggerMonthlyUsageReporting = async (req, res) => {
  try {
    await reportUsageForMonth();
    
    return successResponse(res, {
      message: 'Monthly usage reporting completed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Manual monthly usage reporting error:', error);
    return errorResponse(res, 'Failed to trigger monthly usage reporting', 500);
  }
};

/**
 * Test endpoint to manually update subscription data
 */
const testUpdateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user.userId;

    if (!subscriptionId) {
      return errorResponse(res, 'Subscription ID is required', 400);
    }

    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Call the same function that webhook uses
    await handleSubscriptionChange(subscription.customer, subscription);

    return successResponse(res, {
      message: 'Subscription data updated successfully',
      subscriptionId: subscription.id,
      userId: userId
    });

  } catch (error) {
    console.error('Test update subscription error:', error);
    return errorResponse(res, 'Failed to update subscription', 500);
  }
};

/**
 * Direct update function for existing subscriptions (no auth required for testing)
 */
const directUpdateSubscription = async (req, res) => {
  try {
    const { subscriptionId, userEmail } = req.body;

    if (!subscriptionId || !userEmail) {
      return errorResponse(res, 'Subscription ID and user email are required', 400);
    }

    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });

    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: userEmail }
    });

    if (!user) {
      return errorResponse(res, 'User not found with this email', 404);
    }

    // Call the same function that webhook uses
    await handleSubscriptionChange(subscription.customer, subscription);

    return successResponse(res, {
      message: 'Subscription data updated successfully',
      subscriptionId: subscription.id,
      userEmail: userEmail,
      updatedFields: {
        subscriptionStartDate: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
        subscriptionStatus: subscription.status,
        subscriptionExpirationDate: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        stripeSubscriptionId: subscription.id,
        subscriptionPlan: subscription.items?.data?.[0]?.price?.nickname || subscription.items?.data?.[0]?.price?.id
      }
    });

  } catch (error) {
    console.error('Direct update subscription error:', error);
    return errorResponse(res, 'Failed to update subscription', 500);
  }
};

/**
 * Update payment status - Simple function
 */
const updatePaymentStatus = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.userId;


    // Update payment status to succeeded
    const updatedPayment = await prisma.paymentHistory.updateMany({
      where: {
        userId: userId,
        stripeSessionId: sessionId
      },
      data: {
        status: 'succeeded',
        updatedAt: new Date()
      }
    });


    return successResponse(res, {
      message: 'Payment status updated successfully',
      sessionId: sessionId,
      status: 'succeeded',
      updatedCount: updatedPayment.count
    });

  } catch (error) {
    console.error('❌ Update payment status error:', error);
    return errorResponse(res, 'Failed to update payment status', 500);
  }
};


/**
 * Get user payment history
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, type } = req.query;

    const skip = (page - 1) * limit;
    const where = { userId };

    if (type) {
      where.paymentType = type;
    }

    const [payments, total] = await Promise.all([
      prisma.paymentHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit),
        select: {
          id: true,
          paymentType: true,
          amount: true,
          currency: true,
          description: true,
          status: true,
          paymentMethod: true,
          source: true,
          stripeSessionId: true,
          stripePaymentId: true,
          stripeSubscriptionId: true,
          createdAt: true,
          metadata: true
        }
      }),
      prisma.paymentHistory.count({ where })
    ]);

    // Modular Stripe enrichment
    const enrichWithStripe = async ({ stripeSessionId, stripePaymentId }) => {
      try {
        let paymentIntentId;
    
        if (stripeSessionId) {
          const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
          paymentIntentId = session.payment_intent;
        } else if (stripePaymentId) {
          paymentIntentId = stripePaymentId;
        }
    
        if (!paymentIntentId) return { receiptUrl: null, invoiceUrl: null };
    
        const charges = await stripe.charges.list({
          payment_intent: paymentIntentId,
          limit: 1
        });
    
        const charge = charges.data[0];
        if (!charge) return { receiptUrl: null, invoiceUrl: null };
    
        const receiptUrl = charge.receipt_url || null;
        const invoiceUrl = charge.invoice
          ? (await stripe.invoices.retrieve(charge.invoice)).hosted_invoice_url
          : null;
    
        return { receiptUrl, invoiceUrl };
      } catch (err) {
        return { receiptUrl: null, invoiceUrl: null };
      }
    };

    const paymentsWithReceipt = await Promise.all(
      payments.map(async (payment) => {
        const { receiptUrl, invoiceUrl } = await enrichWithStripe({
          stripeSessionId: payment.stripeSessionId,
          stripePaymentId: payment.stripePaymentId
        });

        return {
          ...payment,
          receiptUrl,
          invoiceUrl
        };
      })
    );

    return successResponse(res, {
      payments: paymentsWithReceipt,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    return errorResponse(res, 'Failed to fetch payment history', 500);
  }
};

module.exports = {
  createCheckoutSession,
  createSimpleCheckout,
  getPrices,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  createCustomerPortalSession,
  getPaymentMethods,
  getBillingDashboard,
  addPaymentMethod,
  updatePaymentMethod,
  removePaymentMethod,
  handleWebhook,
  triggerMonthlyUsageReporting,
  testUpdateSubscription,
  directUpdateSubscription,
  updatePaymentStatus,
  getPaymentHistory
};
