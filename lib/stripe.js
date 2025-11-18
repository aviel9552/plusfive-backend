const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendUsageReportEmail } = require('./emailService');

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

// Verify Stripe initialization and method availability (for debugging)
if (!stripe || !stripe.billing || !stripe.billing.meterEvents) {
  console.error('❌ CRITICAL: Stripe initialization failed or billing.meterEvents not available');
  console.error('Please check STRIPE_SECRET_KEY environment variable');
  console.error('Make sure you are using Stripe SDK v19.0.0 or higher');
}

/**
 * Get all available Stripe prices
 */
const getStripePrices = async () => {
  try {
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });
    
    // Filter out prices where the product is not active
    const activePrices = prices.data.filter(price => 
      price.product && price.product.active === true
    );
    
    return activePrices.map(price => ({
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

    console.log(`🔍 Active_users_count: ${activeUsers.length}`);
    // Check if testing mode is enabled (check once for all users)
    const isTestMode = process.env.CRON_TEST_MODE === 'true';
    
    if (isTestMode) {
      console.log(`\n🧪🧪🧪 CRON TEST MODE ENABLED 🧪🧪🧪`);
      console.log(`🧪 Test mode is active - billing periods will use Stripe's actual subscription periods`);
      console.log(`🧪 Each user's billing cycle respects their subscription start time`);
      console.log(`🧪 Example: If subscribed on 17th 2PM, billing period is 17th 2PM to 18th 2PM (for daily)\n`);
    }

    for (const user of activeUsers) {
      try {
        // Get user's active subscription from Stripe to find subscription item ID
        // Expand price and product to get plan details
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
          expand: ['items.data.price.product']
        });
        
        // Log active plan details
        console.log(`\n📊 Processing user: ${user.email}`);
        console.log(`📋 Subscription ID: ${subscription.id}`);
        console.log(`📋 Subscription Status: ${subscription.status}`);
        
        // Get all subscription items and their plans from Stripe
        for (let index = 0; index < subscription.items.data.length; index++) {
          const item = subscription.items.data[index];
          const price = item.price;
          let product = price?.product;
          
          // If product is just an ID (string), fetch it from Stripe
          if (typeof product === 'string') {
            try {
              product = await stripe.products.retrieve(product);
            } catch (error) {
              console.error(`❌ Error fetching product ${product}:`, error.message);
              product = null;
            }
          }
          
          // Log plan details from Stripe
          if (product && typeof product === 'object') {
            console.log(`📦 Plan ${index + 1}: ${product.name || 'N/A'}`);
            console.log(`   📝 Description: ${product.description || 'No description'}`);
            console.log(`   🆔 Product ID: ${product.id}`);
            console.log(`   💰 Price: ${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`);
            console.log(`   🆔 Price ID: ${price.id}`);
            
            if (price.recurring) {
              console.log(`   🔄 Billing Interval: ${price.recurring.interval}`);
              console.log(`   🔢 Interval Count: ${price.recurring.interval_count || 1}`);
              console.log(`   📊 Usage Type: ${price.recurring.usage_type || 'licensed'}`);
              console.log(`   📈 Billing Period: Every ${price.recurring.interval_count || 1} ${price.recurring.interval}(s)`);
            } else {
              console.log(`   🔄 Billing: One-time payment`);
            }
            
            // Log product metadata if available
            if (product.metadata && Object.keys(product.metadata).length > 0) {
              console.log(`   📋 Metadata:`, product.metadata);
            }
          } else {
            console.log(`📦 Plan ${index + 1}: Product ID ${price?.product || 'N/A'}`);
            console.log(`   💰 Price: ${(price?.unit_amount / 100).toFixed(2)} ${price?.currency?.toUpperCase() || 'N/A'}`);
            console.log(`   🆔 Price ID: ${price?.id || 'N/A'}`);
          }
        }
        
        // Find the metered subscription item (WhatsApp messages)
        const meteredItem = subscription.items.data.find(item => 
          item.price?.recurring?.usage_type === 'metered'
        );

        if (!meteredItem) {
          console.log(`⚠️  No metered subscription item found for user ${user.email} - skipping`);
          continue;
        }

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
        
        // Get Stripe customer ID from subscription
        const stripeCustomerId = subscription.customer;
        if (!stripeCustomerId) {
          console.error(`❌ No customer ID found in subscription for user ${user.email}`);
          continue;
        }
        console.log(`📋 Stripe Customer ID: ${stripeCustomerId}`);

        // Get billing interval from the metered item's price
        const billingInterval = meteredItem.price?.recurring?.interval || 'month';
        const intervalCount = meteredItem.price?.recurring?.interval_count || 1;
        
        console.log(`📅 Billing Interval: ${billingInterval}, Interval Count: ${intervalCount}`);
        
        // Get Stripe's actual billing period from subscription
        // This ensures we use the exact billing cycle (e.g., 15 Nov - 15 Dec) instead of calendar month
        const stripePeriodStart = subscription.current_period_start 
          ? new Date(subscription.current_period_start * 1000) 
          : null;
        const stripePeriodEnd = subscription.current_period_end 
          ? new Date(subscription.current_period_end * 1000) 
          : null;
        
        console.log(`📅 Stripe Billing Period Start: ${stripePeriodStart ? stripePeriodStart.toISOString() : 'N/A'}`);
        console.log(`📅 Stripe Billing Period End: ${stripePeriodEnd ? stripePeriodEnd.toISOString() : 'N/A'}`);
        
        let billingPeriod;
        // ALWAYS use Stripe's actual billing period to respect subscription start time
        // Example: If user subscribes on 17th at 2PM, billing period is 17th 2PM to 18th 2PM
        // This ensures each user's billing cycle is based on their actual subscription start time
        if (stripePeriodStart && stripePeriodEnd) {
          billingPeriod = {
            start: stripePeriodStart,
            end: stripePeriodEnd,
            description: `Stripe billing period (${billingInterval} interval)`
          };
          
          console.log(`✅ Using Stripe's actual billing period: ${stripePeriodStart.toISOString()} to ${stripePeriodEnd.toISOString()}`);
          console.log(`📅 This respects the subscription start time (e.g., if subscribed on 17th 2PM, period is 17th 2PM to 18th 2PM)`);
          
          if (isTestMode) {
            console.log(`🧪 TEST MODE ENABLED - Still using Stripe's actual billing period for accuracy`);
          }
        } else {
          // Fallback: Calculate billing period range based on interval type (if Stripe period not available)
          console.warn(`⚠️  Stripe billing period not available, falling back to calendar-based calculation`);
          billingPeriod = getBillingPeriodRange(billingInterval, intervalCount);
          
          if (isTestMode) {
            console.log(`🧪 TEST MODE ENABLED - Using fallback billing period calculation`);
          }
        }
        
        console.log(`📅 Billing period range: ${billingPeriod.start.toISOString()} to ${billingPeriod.end.toISOString()}`);
        console.log(`📅 Period description: ${billingPeriod.description}`);
        
        // Get current date (today) messages count for reference
        const today = new Date();
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        
        const totalMessagesToday = await prisma.whatsappMessage.count({
          where: { 
            userId: user.id, 
            createdAt: { 
              gte: todayStart,
              lt: todayEnd
            }
          }
        });
        
        // Get total messages count in billing period (billed + unbilled)
        const totalMessagesInPeriod = await prisma.whatsappMessage.count({
          where: { 
            userId: user.id, 
            createdAt: { 
              gte: billingPeriod.start,
              lt: billingPeriod.end
            }
          }
        });
        
        // Get unbilled messages count (only these will be reported to Stripe)
        const usageCount = await prisma.whatsappMessage.count({
          where: { 
            userId: user.id, 
            createdAt: { 
              gte: billingPeriod.start,  // Start of billing period
              lt: billingPeriod.end      // End of billing period (exclusive)
            },
            billStatus: false, // Only count unbilled messages
            billDate: null     // Must have no bill date
          }
        });
        
        // Get billed messages count
        const billedMessagesCount = totalMessagesInPeriod - usageCount;
        
        console.log(`📊 Current Date (Today) Total Messages: ${totalMessagesToday} messages`);
        console.log(`📊 Billing Period Total Messages: ${totalMessagesInPeriod} messages`);
        console.log(`   ✅ Already billed: ${billedMessagesCount} messages`);
        console.log(`   📝 Unbilled (will report to Stripe): ${usageCount} messages`);

        // Report usage to Stripe for automatic billing
        // IMPORTANT: Only send email and report usage if there are messages to bill
        if (usageCount > 0) {
          try {
            // Report usage to Stripe using meterEvents API (for meter-based pricing)
            // ✅ STRIPE AUTOMATIC PAYMENT FLOW:
            // 1. meterEvents.create() reports usage to Stripe meter
            // 2. At the end of billing period (day/week/month/year), Stripe automatically:
            //    - Generates an invoice with the usage amount
            //    - Charges the customer's default payment method (saved card)
            //    - Sends invoice.paid webhook when payment succeeds
            // 3. No manual payment required - fully automated by Stripe
            
            console.log(`🔍 Creating ${usageCount} meter events (one per message)...`);
            console.log(`📋 Event name: ${eventName}`);
            console.log(`📋 Stripe Customer ID: ${stripeCustomerId}`);
            
            // Get all unbilled messages to send individual events (one event per message)
            // This ensures exact count matches database - prevents duplicate aggregation
            const unbilledMessages = await prisma.whatsappMessage.findMany({
              where: {
                userId: user.id,
                createdAt: { 
                  gte: billingPeriod.start,
                  lt: billingPeriod.end
                },
                billStatus: false,
                billDate: null
              },
              select: {
                id: true,
                createdAt: true
              },
              orderBy: {
                createdAt: 'asc'
              }
            });
            
            if (unbilledMessages.length !== usageCount) {
              console.warn(`⚠️  Warning: Found ${unbilledMessages.length} messages but count was ${usageCount}`);
            }
            
            // Send individual meter event for each message (value: 1 per message)
            // This prevents duplicate aggregation - database mein 4 messages = Stripe mein 4 units
            const eventPromises = unbilledMessages.map(async (message) => {
              const usageEvent = await stripe.billing.meterEvents.create({
                event_name: eventName, // Dynamic event name from metadata or default
                payload: {
                  stripe_customer_id: stripeCustomerId, // ⭐ REQUIRED: Stripe customer ID
                  subscription_item: meteredItem.id, // ⭐ REQUIRED: Subscription item ID
                  value: 1, // One unit per message (exact count)
                  timestamp: Math.floor(new Date(message.createdAt).getTime() / 1000) // Use message creation timestamp
                }
              });
              return usageEvent;
            });
            
            // Wait for all events to be created
            const usageEvents = await Promise.all(eventPromises);
            
            // Success - all usage events created
            console.log(`✅ Successfully reported usage to Stripe for user ${user.email}`);
            console.log(`📊 Summary:`);
            console.log(`   📝 Messages sent to Stripe: ${unbilledMessages.length} messages`);
            console.log(`   📋 Events created: ${usageEvents.length} events`);
            console.log(`   💰 Total value: ${usageEvents.length} units`);
            console.log(`   ✅ Database total in period: ${totalMessagesInPeriod} messages`);
            console.log(`   📋 Event IDs: ${usageEvents.map(e => e.id).join(', ')}`);
            
            // IMPORTANT: Only proceed with database update and email if Stripe payment succeeded
            // Mark messages as billed in database ONLY after successful Stripe payment
            // Use the exact message IDs we sent to Stripe to prevent race conditions
            const messageIds = unbilledMessages.map(msg => msg.id);
            await prisma.whatsappMessage.updateMany({
              where: {
                id: { in: messageIds }, // Only update the exact messages we sent to Stripe
                billStatus: false,
                billDate: null
              },
              data: {
                billStatus: true,
                billDate: new Date()
              }
            });
            console.log(`✅ Marked ${messageIds.length} messages as billed for user ${user.email}`);

            // Send usage report email to user ONLY after successful Stripe payment
            await sendUsageReportEmail(user.email, messageIds.length);
            console.log(`✅ Usage report email sent successfully to ${user.email}`);
            
            console.log(`💳 Stripe will automatically charge customer's payment method at end of billing period (${billingInterval})`);
            console.log(`📅 Billing period: ${billingPeriod.start.toISOString()} to ${billingPeriod.end.toISOString()}`);
            
            if (isTestMode) {
              console.log(`🧪 TEST MODE ENABLED - Using actual Stripe billing period for accurate billing`);
            }
            
          } catch (stripeError) {
            // Log detailed error for debugging
            console.error(`❌ Stripe API Error Details:`, {
              message: stripeError.message,
              type: stripeError.type,
              code: stripeError.code,
              statusCode: stripeError.statusCode
            });
            
            // Check if it's a method not found error or meter not found error
            if (stripeError.message && stripeError.message.includes('is not a function')) {
              console.error(`❌ CRITICAL: Stripe SDK method not available.`);
              console.error(`   Current Stripe SDK version: Check package.json (should be >= 19.0.0)`);
              console.error(`   Solution: Run 'npm install stripe@latest' and restart server`);
              console.error(`   Available billing methods:`, Object.keys(stripe.billing || {}));
            } else if (stripeError.message && stripeError.message.includes('No active meter found')) {
              console.error(`❌ CRITICAL: Meter not found in Stripe.`);
              console.error(`   Event name used: "${eventName}"`);
              console.error(`   Solution: Make sure the meter with event name "${eventName}" is active in Stripe dashboard`);
              console.error(`   Check: Stripe Dashboard > Products > Meters`);
              console.error(`   Or add event_name to price/product metadata in Stripe`);
            } else if (stripeError.message && stripeError.message.includes('Unable to determine the customer')) {
              console.error(`❌ CRITICAL: Subscription item missing or invalid in payload.`);
              console.error(`   Subscription Item ID: ${meteredItem.id}`);
              console.error(`   Stripe Customer ID: ${stripeCustomerId}`);
              console.error(`   Solution: Make sure subscription item is valid and linked to a customer`);
            }
            
            // IMPORTANT: Do NOT send email if Stripe payment failed
            console.error(`❌ Stripe payment failed for ${user.email} - Email will NOT be sent`);
            console.error(`❌ Messages were NOT marked as billed due to Stripe payment failure`);
            
            throw stripeError; // Re-throw to be caught by outer catch
          }
        } else {
          // No usage to report - skip email and billing
          console.log(`ℹ️  No usage to report for user ${user.email} in billing period - skipping email and billing`);
        }


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

// Helper to get previous month range (for monthly billing)
/**
 * Get billing period range based on interval type and count
 * Supports: day, week, month, year with interval_count (1, 3, 6, etc.)
 */
function getBillingPeriodRange(interval, intervalCount = 1) {
  const now = new Date();
  let start, end, description;
  
  switch (interval.toLowerCase()) {
    case 'day':
      // Previous day(s) based on interval_count
      end = new Date(now);
      end.setHours(0, 0, 0, 0); // Start of current day
      
      start = new Date(end);
      start.setDate(start.getDate() - intervalCount); // Go back by interval_count days
      
      description = intervalCount === 1 
        ? `Previous day` 
        : `Previous ${intervalCount} days`;
      break;
      
    case 'week':
      // Previous week(s) based on interval_count
      end = new Date(now);
      end.setHours(0, 0, 0, 0);
      
      // Get start of current week (Sunday)
      const dayOfWeek = end.getDay();
      end.setDate(end.getDate() - dayOfWeek);
      
      start = new Date(end);
      start.setDate(start.getDate() - (intervalCount * 7)); // Go back by interval_count weeks
      
      description = intervalCount === 1 
        ? `Previous week` 
        : `Previous ${intervalCount} weeks`;
      break;
      
    case 'month':
      // Previous month(s) based on interval_count
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      end = new Date(currentYear, currentMonth, 1); // Start of current month
      
      // Calculate start date by going back interval_count months
      start = new Date(currentYear, currentMonth - intervalCount, 1);
      
      description = intervalCount === 1 
        ? `Previous month` 
        : intervalCount === 3 
          ? `Previous 3 months` 
          : intervalCount === 6 
            ? `Previous 6 months` 
            : `Previous ${intervalCount} months`;
      break;
      
    case 'year':
      // Previous year(s) based on interval_count
      const currentYearForYear = now.getFullYear();
      
      end = new Date(currentYearForYear, 0, 1); // Start of current year (January 1)
      
      start = new Date(currentYearForYear - intervalCount, 0, 1); // Start of previous year(s)
      
      description = intervalCount === 1 
        ? `Previous year` 
        : `Previous ${intervalCount} years`;
      break;
      
    default:
      // Default to monthly if interval is not recognized
      console.warn(`⚠️  Unknown billing interval: ${interval}, defaulting to monthly`);
      const defaultMonth = now.getMonth();
      const defaultYear = now.getFullYear();
      end = new Date(defaultYear, defaultMonth, 1);
      start = new Date(defaultYear, defaultMonth - intervalCount, 1);
      description = `Previous ${intervalCount} month(s) (default)`;
  }
  
  return {
    start,
    end,
    description
  };
}

/**
 * Legacy function - kept for backward compatibility
 * @deprecated Use getBillingPeriodRange('month', 1) instead
 */
function getPreviousMonthRange() {
  return getBillingPeriodRange('month', 1);
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
