stripe log

const prisma = require('../lib/prisma');
const { errorResponse } = require('../lib/utils');

/**
 * Middleware to check if user has active subscription
 * Blocks access if subscription is not active, canceled, or expired
 */
const checkSubscription = async (req, res, next) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    // Get user with subscription details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        subscriptionStartDate: true,
        subscriptionPlan: true,
        role: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Allow admin users to bypass subscription check
    if (user.role === 'admin') {
      return next();
    }

    // Check subscription status
    const subscriptionStatus = user.subscriptionStatus?.toLowerCase();
    
    // ⚠️ TEMP: Allow access even without active subscription
console.log("Subscription:", subscriptionStatus, "-> Access Allowed (no block)");
next();


    // Check if subscription is active
    if (subscriptionStatus !== 'active') {
      return errorResponse(
        res, 
        'Active subscription required. Please subscribe to continue using the service.', 
        403
      );
    }

    // Check expiration date if available
    if (user.subscriptionExpirationDate) {
      const now = new Date();
      const expirationDate = new Date(user.subscriptionExpirationDate);
      
      if (expirationDate < now) {
        // Subscription expired - update status
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionStatus: 'expired' }
        });
        
        return errorResponse(
          res, 
          'Your subscription has expired. Please renew your subscription to continue using the service.', 
          403
        );
      }
    }

    // Subscription is active - allow access
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return errorResponse(res, 'Failed to verify subscription status', 500);
  }
};

module.exports = {
  checkSubscription
};

