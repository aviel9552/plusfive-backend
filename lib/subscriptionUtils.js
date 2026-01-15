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
          stripeSubscriptionId: true,
        },
      });

      if (!user) {
        return { hasActiveSubscription: false, reason: 'User not found' };
      }
    } else {
      // User object is provided directly
      user = userOrUserId;
    }

    // Admin users don't need subscription
    if (user.role === 'admin') {
      return { hasActiveSubscription: true };
    }

    // Check Stripe API directly - no database fallback
    if (!user.stripeSubscriptionId) {
      return { hasActiveSubscription: false, reason: 'No subscription found. Please subscribe to continue.' };
    }

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
      // If Stripe API call fails, return false
      console.error('Error checking Stripe subscription:', stripeError.message);
      return { hasActiveSubscription: false, reason: 'Failed to verify subscription. Please try again.' };
    }
  } catch (error) {
    console.error('Error in checkUserSubscription:', error);
    return { hasActiveSubscription: false, reason: 'Failed to verify subscription. Please try again.' };
  }
};

module.exports = {
  checkUserSubscription,
};
