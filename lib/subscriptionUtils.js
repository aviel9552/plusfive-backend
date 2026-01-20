const prisma = require('./prisma');
const { stripe } = require('./stripe');

/**
 * Check if user has active subscription (Stripe API only)
 * @param {Object|string} userOrUserId - User object or userId string
 * @returns {Promise<{hasActiveSubscription: boolean, reason?: string}>}
 */
const checkUserSubscription = async (userOrUserId) => {
  try {
    let user;

    // If userId is provided, fetch user from database
    if (typeof userOrUserId === 'string') {
      user = await prisma.user.findUnique({
        where: { id: userOrUserId },
        select: {
          id: true,
          role: true,
          email: true,
          stripeSubscriptionId: true,
          stripeCustomerId: true,
        },
      });

      if (!user) {
        return { hasActiveSubscription: false, reason: 'User not found' };
      }
    } else {
      // User object is provided directly - ensure we have email
      user = userOrUserId;
      
      // If email is missing, fetch from database
      if (!user.email && user.id) {
        const fullUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            role: true,
            email: true,
            stripeSubscriptionId: true,
            stripeCustomerId: true,
          },
        });
        
        if (fullUser) {
          user = { ...user, ...fullUser };
        }
      }
    }

    // Admin users don't need subscription
    if (user.role === 'admin') {
      return { hasActiveSubscription: true };
    }

    // First, try to check using stripeSubscriptionId if available
    if (user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        // Check subscription status from Stripe
        const stripeStatus = subscription.status?.toLowerCase();
        if (!stripeStatus || 
            stripeStatus === 'canceled' || 
            stripeStatus === 'unpaid' ||
            stripeStatus === 'past_due' ||
            stripeStatus === 'incomplete' ||
            stripeStatus === 'incomplete_expired') {
          return { hasActiveSubscription: false, reason: 'Subscription not active' };
        }

        // Check current_period_end from Stripe (Unix timestamp in seconds)
        if (subscription.current_period_end) {
          const expiryTimestamp = subscription.current_period_end * 1000; // Convert to milliseconds
          const now = Date.now();
          if (expiryTimestamp < now) {
            return { hasActiveSubscription: false, reason: 'Subscription expired' };
          }
        }

        // Stripe subscription is active and not expired
        return { hasActiveSubscription: true };
      } catch (stripeError) {
        // If subscription ID is invalid, fall through to check by customer ID
        console.error('Error checking Stripe subscription by ID:', stripeError.message);
      }
    }

    // If stripeSubscriptionId is not available or invalid, check by email (same logic as getSubscription API)
    // Ensure email is available - if still missing, try to get from database one more time
    if (!user.email && user.id) {
      const emailUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true },
      });
      if (emailUser?.email) {
        user.email = emailUser.email;
      }
    }

    if (user.email) {
      try {
        // Search for customers with this email (same as getSubscription)
        const customers = await stripe.customers.list({
          email: user.email,
          limit: 10
        });

        if (customers.data && customers.data.length > 0) {
          // Get subscriptions for ALL customers with this email (same as getSubscription)
          const subscriptionPromises = customers.data.map(customer => 
            stripe.subscriptions.list({
              customer: customer.id,
              status: 'all',
              limit: 100
            })
          );

          const subscriptionResults = await Promise.all(subscriptionPromises);
          
          // Flatten all subscriptions from all customers
          const allSubscriptions = subscriptionResults.flatMap(result => result.data);

          console.log(`Found ${allSubscriptions.length} subscriptions across ${customers.data.length} customers for email ${user.email}`);

          // Check if there's any active subscription
          for (const subscription of allSubscriptions) {
            const stripeStatus = subscription.status?.toLowerCase();
            
            console.log(`Checking subscription ${subscription.id} with status: ${stripeStatus}`);
            
            // Check if subscription is active
            if (stripeStatus === 'active' || stripeStatus === 'trialing') {
              // Check current_period_end from Stripe (Unix timestamp in seconds)
              if (subscription.current_period_end) {
                const expiryTimestamp = subscription.current_period_end * 1000; // Convert to milliseconds
                const now = Date.now();
                if (expiryTimestamp >= now) {
                  // Found an active subscription that hasn't expired
                  console.log(`Active subscription found: ${subscription.id} for customer ${subscription.customer}`);
                  return { hasActiveSubscription: true };
                } else {
                  console.log(`Subscription ${subscription.id} expired at ${new Date(expiryTimestamp).toISOString()}`);
                }
              } else {
                // Active subscription without expiry (shouldn't happen, but handle it)
                console.log(`Active subscription found (no expiry): ${subscription.id}`);
                return { hasActiveSubscription: true };
              }
            }
          }

          // No active subscription found
          console.log(`No active subscription found for email ${user.email}`);
          return { hasActiveSubscription: false, reason: 'No active subscription found. Please subscribe to continue.' };
        } else {
          console.log(`No Stripe customers found for email ${user.email}`);
        }
      } catch (stripeError) {
        // If Stripe API call fails, return false
        console.error('Error checking Stripe subscriptions by email:', stripeError.message);
        return { hasActiveSubscription: false, reason: 'Failed to verify subscription. Please try again.' };
      }
    }


    // No stripeSubscriptionId or stripeCustomerId found, and couldn't find by email
    console.log(`No subscription found for user ${user.id} (email: ${user.email})`);
    return { hasActiveSubscription: false, reason: 'No subscription found. Please subscribe to continue.' };
  } catch (error) {
    console.error('Error in checkUserSubscription:', error);
    return { hasActiveSubscription: false, reason: 'Failed to verify subscription. Please try again.' };
  }
};

module.exports = {
  checkUserSubscription,
};
