const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const {
  CLIENT_PERMISSIONS_TIME_OPTIONS,
  CLIENT_PERMISSIONS_TIME_SLOT_INTERVAL_OPTIONS,
  CLIENT_PERMISSIONS_APPOINTMENT_LIMIT_OPTIONS,
} = require('../config/constants');

// Defaults match constants: minutes (e.g. 30240 = 3 weeks, 180 = 3 hours)
const DEFAULT_SETTINGS = {
  allowOnlineBooking: true,
  minAdvanceBookingMinutes: 10,
  maxAdvanceBookingMinutes: 30240, // 3 weeks in minutes
  cancelBeforeMinutes: 180,       // 3 hours in minutes
  timeSlotInterval: 'half-hour',
  appointmentLimit: 'unlimited',
  showServicePrices: true,
  showServiceDuration: false,
  allowChooseTeamMember: true,
  requireBusinessApproval: false,
  onlyExistingClients: false,
  oneAppointmentOnly: true,
};

/**
 * Get client permissions for the logged-in user.
 * GET /api/client-permissions
 * Returns defaults if no record exists.
 */
const getClientPermissions = async (req, res) => {
  try {
    const userId = req.user.userId;

    const row = await prisma.clientPermissions.findUnique({
      where: { userId },
    });

    if (!row) {
      return successResponse(res, {
        permissions: DEFAULT_SETTINGS,
      });
    }

    const permissions = {
      allowOnlineBooking: row.allowOnlineBooking,
      minAdvanceBookingMinutes: row.minAdvanceBookingMinutes,
      maxAdvanceBookingMinutes: row.maxAdvanceBookingMinutes,
      cancelBeforeMinutes: row.cancelBeforeMinutes,
      timeSlotInterval: row.timeSlotInterval,
      appointmentLimit: row.appointmentLimit,
      showServicePrices: row.showServicePrices,
      showServiceDuration: row.showServiceDuration,
      allowChooseTeamMember: row.allowChooseTeamMember,
      requireBusinessApproval: row.requireBusinessApproval,
      onlyExistingClients: row.onlyExistingClients,
      oneAppointmentOnly: row.oneAppointmentOnly,
    };

    return successResponse(res, { permissions });
  } catch (error) {
    console.error('Get client permissions error:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    const message = error?.message?.includes('Unknown arg') || error?.message?.includes('column')
      ? 'Database schema may be out of date. Run: npx prisma migrate deploy && npx prisma generate'
      : 'Failed to fetch client permissions';
    return errorResponse(res, message, 500);
  }
};

/**
 * Create or update client permissions for the logged-in user.
 * PUT /api/client-permissions
 * Body: { allowOnlineBooking?, minAdvanceBookingMinutes?, ... }
 */
const upsertClientPermissions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const body = req.body || {};

    // Validate dropdown values against constants (time slot interval & appointment limit)
    const validIntervalValues = new Set(CLIENT_PERMISSIONS_TIME_SLOT_INTERVAL_OPTIONS.map((o) => o.value));
    const validLimitValues = new Set(CLIENT_PERMISSIONS_APPOINTMENT_LIMIT_OPTIONS.map((o) => o.value));
    const timeSlotInterval = validIntervalValues.has(body.timeSlotInterval)
      ? body.timeSlotInterval
      : DEFAULT_SETTINGS.timeSlotInterval;
    const appointmentLimit = validLimitValues.has(body.appointmentLimit)
      ? body.appointmentLimit
      : DEFAULT_SETTINGS.appointmentLimit;

    // Store constant value directly – no conversion. Only validate value exists in CLIENT_PERMISSIONS_TIME_OPTIONS.
    const validTimeValues = new Set(CLIENT_PERMISSIONS_TIME_OPTIONS.map((o) => o.value));
    const storeConstantValue = (val, defaultVal) =>
      validTimeValues.has(String(Number(val))) ? Number(val) : defaultVal;

    const data = {
      allowOnlineBooking: body.allowOnlineBooking ?? DEFAULT_SETTINGS.allowOnlineBooking,
      minAdvanceBookingMinutes: storeConstantValue(body.minAdvanceBookingMinutes, DEFAULT_SETTINGS.minAdvanceBookingMinutes),
      maxAdvanceBookingMinutes: storeConstantValue(body.maxAdvanceBookingMinutes, DEFAULT_SETTINGS.maxAdvanceBookingMinutes),
      cancelBeforeMinutes: storeConstantValue(body.cancelBeforeMinutes, DEFAULT_SETTINGS.cancelBeforeMinutes),
      timeSlotInterval,
      appointmentLimit,
      showServicePrices: body.showServicePrices ?? DEFAULT_SETTINGS.showServicePrices,
      showServiceDuration: body.showServiceDuration ?? DEFAULT_SETTINGS.showServiceDuration,
      allowChooseTeamMember: body.allowChooseTeamMember ?? DEFAULT_SETTINGS.allowChooseTeamMember,
      requireBusinessApproval: body.requireBusinessApproval ?? DEFAULT_SETTINGS.requireBusinessApproval,
      onlyExistingClients: body.onlyExistingClients ?? DEFAULT_SETTINGS.onlyExistingClients,
      oneAppointmentOnly: body.oneAppointmentOnly ?? DEFAULT_SETTINGS.oneAppointmentOnly,
    };

    const row = await prisma.clientPermissions.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    const permissions = {
      allowOnlineBooking: row.allowOnlineBooking,
      minAdvanceBookingMinutes: row.minAdvanceBookingMinutes,
      maxAdvanceBookingMinutes: row.maxAdvanceBookingMinutes,
      cancelBeforeMinutes: row.cancelBeforeMinutes,
      timeSlotInterval: row.timeSlotInterval,
      appointmentLimit: row.appointmentLimit,
      showServicePrices: row.showServicePrices,
      showServiceDuration: row.showServiceDuration,
      allowChooseTeamMember: row.allowChooseTeamMember,
      requireBusinessApproval: row.requireBusinessApproval,
      onlyExistingClients: row.onlyExistingClients,
      oneAppointmentOnly: row.oneAppointmentOnly,
    };

    return successResponse(res, { permissions }, 'Client permissions saved');
  } catch (error) {
    console.error('Upsert client permissions error:', error);
    return errorResponse(res, 'Failed to save client permissions', 500);
  }
};

module.exports = {
  getClientPermissions,
  upsertClientPermissions,
};
