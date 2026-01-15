const { errorResponse } = require('../lib/utils');
const { checkUserSubscription } = require('../lib/subscriptionUtils');

const checkSubscription = async (req, res, next) => {
  try {
    // Check if user exists in request (from auth middleware)
    if (!req.user || !req.user.userId) {
      return errorResponse(res, 'Authentication required', 401);
    }

    // Check subscription status directly from Stripe using reusable utility
    const subscriptionCheck = await checkUserSubscription(req.user.userId);

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
