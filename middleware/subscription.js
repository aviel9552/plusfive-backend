const prisma = require('../lib/prisma');
const { errorResponse } = require('../lib/utils');

const checkSubscription = async (req, res, next) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        role: true,
      },
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (user.role === 'admin') {
      console.log('👑 Admin passed subscription check:', user.email);
      return next();
    }

    const subscriptionStatus = user.subscriptionStatus?.toLowerCase() || 'unknown';

    console.log('🔓 BYPASS SUB CHECK for user:', user.email, '| status:', subscriptionStatus);
    return next();   // ← אין יותר קוד אחרי זה

  } catch (error) {
    console.error('Subscription check error:', error);
    return errorResponse(res, 'Failed to verify subscription status', 500);
  }
};

module.exports = {
  checkSubscription,
};
