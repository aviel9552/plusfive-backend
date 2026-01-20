const { errorResponse } = require('../lib/utils');
const { checkUserSubscription } = require('../lib/subscriptionUtils');

const checkSubscription = async (req, res, next) => {
  try {
    // Check if user exists in request (from auth middleware)
    if (!req.user) {
      return errorResponse(res, 'Authentication required', 401);
    }

    // Get userId from either req.user.userId or req.user.id
    const userId = req.user.userId || req.user.id;
    
    if (!userId) {
      return errorResponse(res, 'User ID not found in token', 401);
    }

    console.log(`Checking subscription for user: ${userId}, email: ${req.user.email || 'N/A'}`);

    // Check subscription status directly from Stripe using reusable utility
    const subscriptionCheck = await checkUserSubscription(userId);

    console.log(`Subscription check result for user ${userId}:`, subscriptionCheck);

    if (!subscriptionCheck.hasActiveSubscription) {
      return errorResponse(
        res,
        subscriptionCheck.reason || 'Subscription required. Please subscribe to continue.',
        403
      );
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return errorResponse(res, 'Failed to verify subscription status', 500);
  }
};

module.exports = {
  checkSubscription,
};
