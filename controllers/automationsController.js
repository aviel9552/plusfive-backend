const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

const DEFAULT_SETTINGS = {
  sendMessageOnAtRisk: false,
  sendMessageOnChurned: false,
  sendMessageOnPaymentForReview: false,
  notifyOnAtRisk: false,
  notifyOnChurned: false,
  notifyOnRecovered: false,
  notifyOnLowRating: false,
};

/**
 * Get automations for the logged-in user.
 * GET /api/automations
 * Returns defaults if no record exists.
 */
const getAutomations = async (req, res) => {
  try {
    const userId = req.user.userId;

    const row = await prisma.automations.findUnique({
      where: { userId },
    });

    if (!row) {
      return successResponse(res, {
        automations: DEFAULT_SETTINGS,
      });
    }

    const automations = {
      sendMessageOnAtRisk: row.sendMessageOnAtRisk,
      sendMessageOnChurned: row.sendMessageOnChurned,
      sendMessageOnPaymentForReview: row.sendMessageOnPaymentForReview,
      notifyOnAtRisk: row.notifyOnAtRisk,
      notifyOnChurned: row.notifyOnChurned,
      notifyOnRecovered: row.notifyOnRecovered,
      notifyOnLowRating: row.notifyOnLowRating,
    };

    return successResponse(res, { automations });
  } catch (error) {
    console.error('Get automations error:', error);
    return errorResponse(res, 'Failed to fetch automations', 500);
  }
};

/**
 * Create or update automations for the logged-in user.
 * PUT /api/automations
 * Body: { sendMessageOnAtRisk?, sendMessageOnChurned?, ... }
 */
const upsertAutomations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const body = req.body || {};

    const data = {
      sendMessageOnAtRisk: body.sendMessageOnAtRisk ?? DEFAULT_SETTINGS.sendMessageOnAtRisk,
      sendMessageOnChurned: body.sendMessageOnChurned ?? DEFAULT_SETTINGS.sendMessageOnChurned,
      sendMessageOnPaymentForReview: body.sendMessageOnPaymentForReview ?? DEFAULT_SETTINGS.sendMessageOnPaymentForReview,
      notifyOnAtRisk: body.notifyOnAtRisk ?? DEFAULT_SETTINGS.notifyOnAtRisk,
      notifyOnChurned: body.notifyOnChurned ?? DEFAULT_SETTINGS.notifyOnChurned,
      notifyOnRecovered: body.notifyOnRecovered ?? DEFAULT_SETTINGS.notifyOnRecovered,
      notifyOnLowRating: body.notifyOnLowRating ?? DEFAULT_SETTINGS.notifyOnLowRating,
    };

    const row = await prisma.automations.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    const automations = {
      sendMessageOnAtRisk: row.sendMessageOnAtRisk,
      sendMessageOnChurned: row.sendMessageOnChurned,
      sendMessageOnPaymentForReview: row.sendMessageOnPaymentForReview,
      notifyOnAtRisk: row.notifyOnAtRisk,
      notifyOnChurned: row.notifyOnChurned,
      notifyOnRecovered: row.notifyOnRecovered,
      notifyOnLowRating: row.notifyOnLowRating,
    };

    return successResponse(res, { automations }, 'Automations saved');
  } catch (error) {
    console.error('Upsert automations error:', error);
    return errorResponse(res, 'Failed to save automations', 500);
  }
};

module.exports = {
  getAutomations,
  upsertAutomations,
};
