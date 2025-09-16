const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

/**
 * Get all available Stripe prices
 */
const getStripePrices = async () => {
  try {
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });
    
    return prices.data.map(price => ({
      id: price.id,
      unit_amount: price.unit_amount,
      currency: price.currency,
      recurring: price.recurring,
      product: price.product,
    }));
  } catch (error) {
    console.error('Error fetching Stripe prices:', error);
    throw error;
  }
};

/**
 * Find Stripe customer by email
 */
const findStripeCustomerByEmail = async (email) => {
  try {
    const customers = await stripe.customers.list({
      email,
      limit: 1,
    });
    
    return customers.data.length > 0 ? customers.data[0] : null;
  } catch (error) {
    console.error('Error finding Stripe customer by email:', error);
    return null;
  }
};

/**
 * Create or retrieve Stripe customer
 */
const getOrCreateStripeCustomer = async (email, userId) => {
  try {
    // First, try to find existing customer
    let customer = await findStripeCustomerByEmail(email);
    
    if (!customer) {
      // Create new customer if not found
      customer = await stripe.customers.create({
        email,
        metadata: {
          userId: userId,
        },
      });
    } else if (customer.metadata.userId !== userId) {
      // Update metadata if customer exists but userId is different
      customer = await stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          userId: userId,
        },
      });
    }
    
    return customer;
  } catch (error) {
    console.error('Error getting/creating Stripe customer:', error);
    throw error;
  }
};

/**
 * Report usage to Stripe for all active subscriptions
 */
const reportUsageForMonth = async () => {
  try {
    // Get all active subscriptions from user table (where subscriptionStatus is 'active')
    const activeUsers = await prisma.user.findMany({
      where: { 
        subscriptionStatus: 'active',
        stripeSubscriptionId: { not: null } // Must have Stripe subscription
      },
      select: { 
        id: true, 
        email: true, 
        stripeSubscriptionId: true 
      }
    });


    for (const user of activeUsers) {
      try {
        // Get user's active subscription from Stripe to find subscription item ID
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        // Find the metered subscription item (WhatsApp messages)
        const meteredItem = subscription.items.data.find(item => 
          item.price?.recurring?.usage_type === 'metered'
        );

        if (!meteredItem) {
          continue;
        }

        // Get WhatsApp message count for this month (unbilled messages only)
        const usageCount = await prisma.whatsappMessage.count({
          where: { 
            userId: user.id, 
            createdAt: { gte: firstDayOfMonth() },
            billStatus: false, // Only count unbilled messages
            billDate: null     // Must have no bill date
          }
        });

        // Report usage to Stripe
        await stripe.subscriptionItems.createUsageRecord(
          meteredItem.id,
          {
            quantity: usageCount,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'set' // overwrite with this month's total
          }
        );


      } catch (userError) {
        console.error(`❌ Error reporting usage for user ${user.id}:`, userError.message);
        // Continue with next user
      }
    }

  } catch (err) {
    console.error('❌ Error in monthly usage reporting:', err);
  }
};

// Helper to get start of current month
function firstDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Create Stripe coupon for affiliate partner
 */
const createAffiliateCoupon = async (partnerId) => {
  try {
    const coupon = await stripe.coupons.create({
      percent_off: 10,
      duration: 'repeating',
      duration_in_months: 3,
      name: `10% Referral Discount`,
      metadata: {
        partnerId: partnerId,
        type: 'affiliate'
      }
    });
    
    return coupon;
  } catch (error) {
    console.error('Error creating affiliate coupon:', error);
    throw error;
  }
};

/**
 * Create Stripe promotion code for affiliate partner
 */
const createAffiliatePromotionCode = async (couponId, partnerId) => {
  try {
    const promotionCode = await stripe.promotionCodes.create({
      coupon: couponId,
      code: `PLUS5-${partnerId}`,
      active: true,
      metadata: {
        partnerId: partnerId,
        type: 'affiliate'
      }
    });
    
    return promotionCode;
  } catch (error) {
    console.error('Error creating affiliate promotion code:', error);
    throw error;
  }
};

/**
 * Calculate commission from invoice
 */
const calculateCommissionFromInvoice = async (invoiceId) => {
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['discount.promotion_code']
    });
    
    if (!invoice.discount || !invoice.discount.promotion_code) {
      return null; // No promotion code used
    }
    
    const promotionCode = invoice.discount.promotion_code;
    const partnerId = promotionCode.metadata?.partnerId;
    
    if (!partnerId) {
      return null; // Not a referral promotion
    }
    
    const commissionRate = 0.20; // 20%
    const commissionAmount = (invoice.amount_paid || 0) * commissionRate / 100; // Convert from cents
    
    return {
      partnerId,
      promotionCodeId: promotionCode.id,
      invoiceId: invoice.id,
      invoiceAmount: (invoice.amount_paid || 0) / 100, // Convert from cents
      commissionAmount,
      currency: invoice.currency
    };
  } catch (error) {
    console.error('Error calculating commission from invoice:', error);
    throw error;
  }
};

module.exports = {
  stripe,
  getStripePrices,
  findStripeCustomerByEmail,
  getOrCreateStripeCustomer,
  reportUsageForMonth,
  createAffiliateCoupon,
  createAffiliatePromotionCode,
  calculateCommissionFromInvoice
};
