const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { constants } = require('../config');
const {
  formatIsraelPhoneToLocal,
  formatIsraeliPhone,
  isValidIsraelPhone,
  PHONE_VALIDATION_ERROR_MESSAGE,
} = require('../lib/phoneUtils');
const { filterRecurringDatesByAvailability } = require('../lib/availabilityHelper');

const DEFAULT_CLIENT_PERMISSIONS = {
  allowOnlineBooking: true,
  minAdvanceBookingMinutes: 10,
  maxAdvanceBookingMinutes: 30240,
  cancelBeforeMinutes: 180,
  timeSlotInterval: 'half-hour',
  appointmentLimit: 'unlimited',
  showServicePrices: true,
  showServiceDuration: false,
  allowChooseTeamMember: true,
  requireBusinessApproval: false,
  onlyExistingClients: false,
  oneAppointmentOnly: true,
};

const mapClientPermissions = (row) => ({
  allowOnlineBooking: row?.allowOnlineBooking ?? DEFAULT_CLIENT_PERMISSIONS.allowOnlineBooking,
  minAdvanceBookingMinutes:
    row?.minAdvanceBookingMinutes ?? DEFAULT_CLIENT_PERMISSIONS.minAdvanceBookingMinutes,
  maxAdvanceBookingMinutes:
    row?.maxAdvanceBookingMinutes ?? DEFAULT_CLIENT_PERMISSIONS.maxAdvanceBookingMinutes,
  cancelBeforeMinutes: row?.cancelBeforeMinutes ?? DEFAULT_CLIENT_PERMISSIONS.cancelBeforeMinutes,
  timeSlotInterval: row?.timeSlotInterval ?? DEFAULT_CLIENT_PERMISSIONS.timeSlotInterval,
  appointmentLimit: row?.appointmentLimit ?? DEFAULT_CLIENT_PERMISSIONS.appointmentLimit,
  showServicePrices: row?.showServicePrices ?? DEFAULT_CLIENT_PERMISSIONS.showServicePrices,
  showServiceDuration: row?.showServiceDuration ?? DEFAULT_CLIENT_PERMISSIONS.showServiceDuration,
  allowChooseTeamMember:
    row?.allowChooseTeamMember ?? DEFAULT_CLIENT_PERMISSIONS.allowChooseTeamMember,
  requireBusinessApproval:
    row?.requireBusinessApproval ?? DEFAULT_CLIENT_PERMISSIONS.requireBusinessApproval,
  onlyExistingClients: row?.onlyExistingClients ?? DEFAULT_CLIENT_PERMISSIONS.onlyExistingClients,
  oneAppointmentOnly: row?.oneAppointmentOnly ?? DEFAULT_CLIENT_PERMISSIONS.oneAppointmentOnly,
});

const parseAppointmentLimit = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'unlimited') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildWorkingHoursForResponse = (operatingHours) => {
  const workingHours = {};
  (operatingHours || []).forEach((oh) => {
    const key = constants.normalizeDayKey(oh.day);
    if (key) {
      workingHours[key] = {
        startTime: oh.startTime,
        endTime: oh.endTime,
        active: oh.isActive,
      };
    }
  });
  return workingHours;
};

const buildBusinessHoursMap = (operatingHours) => {
  const map = {};
  (operatingHours || []).forEach((h) => {
    const key = constants.normalizeDayKey(h.day);
    if (!key) return;
    const active = h.isActive !== false;
    if (!map[key]) {
      map[key] = {
        startTime: h.startTime || null,
        endTime: h.endTime || null,
        active,
      };
    } else {
      map[key].active = map[key].active || active;
      map[key].startTime = map[key].startTime || h.startTime || null;
      map[key].endTime = map[key].endTime || h.endTime || null;
    }
  });
  return map;
};

/**
 * Public: Get full business page data by businessPublicSlug (no auth).
 * GET /api/public/business/:slug
 */
const getPublicBusinessBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9]{7}$/.test(slug)) {
      return errorResponse(res, 'Invalid business_public_slug', 400);
    }

    const business = await prisma.user.findUnique({
      where: { businessPublicSlug: slug },
      select: {
        id: true,
        businessPublicSlug: true,
        businessName: true,
        firstName: true,
        lastName: true,
        image: true,
        coverImage: true,
        phoneNumber: true,
        address: true,
        directChatMessage: true,
        instagramLink: true,
        facebookLink: true,
        tiktokLink: true,
        locationLink: true,
        clientPermissions: {
          select: {
            allowOnlineBooking: true,
            minAdvanceBookingMinutes: true,
            maxAdvanceBookingMinutes: true,
            cancelBeforeMinutes: true,
            timeSlotInterval: true,
            appointmentLimit: true,
            showServicePrices: true,
            showServiceDuration: true,
            allowChooseTeamMember: true,
            requireBusinessApproval: true,
            onlyExistingClients: true,
            oneAppointmentOnly: true,
          },
        },
      },
    });

    if (!business) {
      return errorResponse(res, 'Business not found', 404);
    }

    const [galleryRecords, services, staff, operatingHours] = await Promise.all([
      prisma.businessGallery.findMany({
        where: { userId: business.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.service.findMany({
        where: {
          businessId: business.id,
          isDeleted: false,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.staff.findMany({
        where: {
          businessId: business.id,
          isDeleted: false,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          operatingHours: {
            orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
          },
        },
      }),
      prisma.businessOperatingHours.findMany({
        where: { userId: business.id },
        orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    const gallery = (galleryRecords || []).map((g) => ({ ...g, url: g.fileUrl }));

    const staffWithWorkingHours = (staff || []).map((s) => ({
      ...s,
      phone: s.phone ? formatIsraelPhoneToLocal(s.phone) : s.phone,
      workingHours: buildWorkingHoursForResponse(s.operatingHours),
    }));

    const businessHoursByDay = buildBusinessHoursMap(operatingHours || []);

    const { clientPermissions: rawClientPermissions, ...businessData } = business;

    return successResponse(res, {
      business: {
        ...businessData,
        phoneNumber: businessData.phoneNumber
          ? formatIsraelPhoneToLocal(businessData.phoneNumber)
          : businessData.phoneNumber,
      },
      clientPermissions: mapClientPermissions(rawClientPermissions),
      gallery,
      services,
      staff: staffWithWorkingHours,
      businessOperatingHours: businessHoursByDay,
      operatingHours,
    });
  } catch (error) {
    console.error('Get public business by slug error:', error);
    return errorResponse(res, 'Failed to fetch business', 500);
  }
};

/**
 * Public: Create appointment by business slug (no auth).
 * POST /api/public/business/:slug/appointments
 */
const createPublicAppointmentBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9]{7}$/.test(slug)) {
      return errorResponse(res, 'Invalid business_public_slug', 400);
    }

    const {
      customerPhone,
      customerFullName,
      startDate,
      endDate,
      duration,
      staffId,
      serviceId,
      source,
      customerNote,
    } = req.body || {};

    const sanitizedCustomerNote =
      customerNote != null && String(customerNote).trim()
        ? String(customerNote).trim().slice(0, 2000)
        : null;

    if (!customerPhone) {
      return errorResponse(res, 'customerPhone is required', 400);
    }
    if (!startDate || !endDate) {
      return errorResponse(res, 'startDate and endDate are required', 400);
    }
    if (!staffId || !serviceId) {
      return errorResponse(res, 'staffId and serviceId are required', 400);
    }

    const business = await prisma.user.findUnique({
      where: { businessPublicSlug: slug },
      select: {
        id: true,
        businessPublicSlug: true,
        clientPermissions: {
          select: {
            allowOnlineBooking: true,
            minAdvanceBookingMinutes: true,
            maxAdvanceBookingMinutes: true,
            cancelBeforeMinutes: true,
            timeSlotInterval: true,
            appointmentLimit: true,
            showServicePrices: true,
            showServiceDuration: true,
            allowChooseTeamMember: true,
            requireBusinessApproval: true,
            onlyExistingClients: true,
            oneAppointmentOnly: true,
          },
        },
      },
    });
    if (!business) {
      return errorResponse(res, 'Business not found', 404);
    }
    const userId = business.id;
    const permissions = mapClientPermissions(business.clientPermissions);

    if (permissions.allowOnlineBooking === false) {
      return errorResponse(res, 'Online booking is disabled for this business', 403);
    }

    if (permissions.allowChooseTeamMember === false) {
      return errorResponse(res, 'Team member selection is disabled for this business', 403);
    }

    const parseDateSafely = (dateString) => {
      if (!dateString) return null;
      if (dateString instanceof Date) return dateString;
      try {
        const parsedDate = new Date(dateString);
        return isNaN(parsedDate.getTime()) ? null : parsedDate;
      } catch (e) {
        return null;
      }
    };

    const parsedStartDate = parseDateSafely(startDate);
    const parsedEndDate = parseDateSafely(endDate);
    if (!parsedStartDate || !parsedEndDate) {
      return errorResponse(res, 'Invalid date format for startDate or endDate', 400);
    }
    if (parsedEndDate <= parsedStartDate) {
      return errorResponse(res, 'endDate must be after startDate', 400);
    }
    const now = new Date();
    const advanceMinutes = Math.floor((parsedStartDate.getTime() - now.getTime()) / 60000);
    if (advanceMinutes < permissions.minAdvanceBookingMinutes) {
      return errorResponse(
        res,
        `Appointments must be booked at least ${permissions.minAdvanceBookingMinutes} minutes in advance`,
        400
      );
    }
    if (advanceMinutes > permissions.maxAdvanceBookingMinutes) {
      return errorResponse(
        res,
        `Appointments can be booked up to ${permissions.maxAdvanceBookingMinutes} minutes in advance`,
        400
      );
    }

    if (!isValidIsraelPhone(customerPhone)) {
      return errorResponse(res, PHONE_VALIDATION_ERROR_MESSAGE, 400);
    }
    const formattedPhone = formatIsraeliPhone(customerPhone);

    const [staffMember, service] = await Promise.all([
      prisma.staff.findFirst({
        where: {
          id: staffId,
          businessId: userId,
          isDeleted: false,
          isActive: true,
        },
        select: { id: true, businessId: true },
      }),
      prisma.service.findFirst({
        where: {
          id: serviceId,
          businessId: userId,
          isDeleted: false,
          isActive: true,
        },
        select: { id: true, businessId: true },
      }),
    ]);

    if (!staffMember) {
      return errorResponse(res, 'Staff not found or inactive for this business', 400);
    }
    if (!service) {
      return errorResponse(res, 'Service not found or inactive for this business', 400);
    }

    const staffService = await prisma.staffService.findFirst({
      where: {
        staffId,
        serviceId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!staffService) {
      return errorResponse(
        res,
        'Staff does not have this service assigned. Please choose another staff or service.',
        400
      );
    }

    // Ensure requested time is inside business + staff operating hours.
    const pad = (n) => String(n).padStart(2, '0');
    const startDateStr = `${parsedStartDate.getFullYear()}-${pad(parsedStartDate.getMonth() + 1)}-${pad(parsedStartDate.getDate())}`;
    const startTimeStr = `${pad(parsedStartDate.getHours())}:${pad(parsedStartDate.getMinutes())}`;
    const endTimeStr = `${pad(parsedEndDate.getHours())}:${pad(parsedEndDate.getMinutes())}`;

    const availableDates = await filterRecurringDatesByAvailability(
      [startDateStr],
      userId,
      staffId,
      startTimeStr,
      endTimeStr,
      prisma
    );
    if (!availableDates || availableDates.length === 0) {
      return errorResponse(
        res,
        'Staff or business not available on this date/time. Please choose another time.',
        400
      );
    }

    // Prevent double-booking on public booking as well.
    const overlapping = await prisma.appointment.findFirst({
      where: {
        staffId,
        appointmentStatus: { not: constants.APPOINTMENT_STATUS.CANCELLED },
        startDate: { lt: parsedEndDate },
        endDate: { gt: parsedStartDate },
      },
      select: { id: true },
    });
    if (overlapping) {
      return errorResponse(
        res,
        'This time slot is already booked for this staff. Please choose another time.',
        400
      );
    }

    let customer = await prisma.customers.findFirst({
      where: {
        userId,
        customerPhone: formattedPhone,
      },
      select: {
        id: true,
        userId: true,
        customerFullName: true,
      },
    });

    if (permissions.onlyExistingClients && !customer) {
      return errorResponse(res, 'Only existing clients can book appointments for this business', 403);
    }

    if (!customer) {
      const name = String(customerFullName || '').trim();
      const nameParts = name ? name.split(' ') : ['', ''];

      customer = await prisma.customers.create({
        data: {
          firstName: nameParts[0] || null,
          lastName: nameParts.slice(1).join(' ') || null,
          customerPhone: formattedPhone,
          customerFullName: name || null,
          appointmentCount: 0,
          userId,
        },
        select: { id: true, userId: true, customerFullName: true },
      });

      await prisma.customerUser.create({
        data: {
          customerId: customer.id,
          userId,
          status: constants.CUSTOMER_STATUS.NEW,
        },
      });

      await prisma.customerStatusLog.create({
        data: {
          customerId: customer.id,
          userId,
          oldStatus: null,
          newStatus: 'New',
          reason: 'New appointment created from public business page',
        },
      });
    }

    if (permissions.oneAppointmentOnly) {
      const [existingActiveAppointment, existingActiveWaitlist] = await Promise.all([
        prisma.appointment.findFirst({
          where: {
            userId,
            customerId: customer.id,
            appointmentStatus: { not: constants.APPOINTMENT_STATUS.CANCELLED },
            startDate: { gte: now },
          },
          select: { id: true },
        }),
        prisma.waitlist.findFirst({
          where: {
            userId,
            customerId: customer.id,
            status: constants.WAITLIST_STATUS.WAITING,
            requestedDate: { gte: now },
          },
          select: { id: true },
        }),
      ]);
      if (existingActiveAppointment || existingActiveWaitlist) {
        return errorResponse(res, 'Only one future appointment request is allowed per client', 403);
      }
    }

    const appointmentLimit = parseAppointmentLimit(permissions.appointmentLimit);
    if (appointmentLimit) {
      const activeFutureAppointmentsCount = await prisma.appointment.count({
        where: {
          userId,
          customerId: customer.id,
          appointmentStatus: { not: constants.APPOINTMENT_STATUS.CANCELLED },
          startDate: { gte: now },
        },
      });
      if (activeFutureAppointmentsCount >= appointmentLimit) {
        return errorResponse(
          res,
          `Appointment limit reached. Maximum allowed is ${appointmentLimit}`,
          403
        );
      }
    }

    if (permissions.requireBusinessApproval) {
      const requestedTime = `${pad(parsedStartDate.getHours())}:${pad(parsedStartDate.getMinutes())}`;
      const waitlistEntry = await prisma.waitlist.create({
        data: {
          userId,
          customerId: customer.id,
          serviceId,
          staffId,
          requestedDate: parsedStartDate,
          time: requestedTime,
          startDateTime: parsedStartDate,
          status: constants.WAITLIST_STATUS.WAITING,
          note: sanitizedCustomerNote,
        },
        include: {
          customer: {
            select: {
              id: true,
              customerFullName: true,
              customerPhone: true,
              email: true,
            },
          },
          user: {
            select: {
              id: true,
              businessName: true,
              email: true,
            },
          },
          staff: {
            select: {
              id: true,
              fullName: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              duration: true,
              price: true,
              color: true,
            },
          },
        },
      });

      return successResponse(
        res,
        {
          ...waitlistEntry,
          bookingType: 'waitlist',
        },
        'Request submitted for business approval',
        201
      );
    }

    const newAppointment = await prisma.appointment.create({
      data: {
        source: source || 'public',
        appointmentStatus: constants.APPOINTMENT_STATUS.BOOKED,
        endDate: parsedEndDate,
        duration: duration || null,
        startDate: parsedStartDate,
        createDate: new Date(),
        customerId: customer.id,
        userId,
        staffId,
        serviceId,
        customerNote: sanitizedCustomerNote,
      },
      include: {
        customer: {
          select: {
            id: true,
            customerFullName: true,
            customerPhone: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            businessName: true,
            email: true,
          },
        },
        staff: {
          select: {
            id: true,
            fullName: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            color: true,
          },
        },
      },
    });

    await prisma.customers.update({
      where: { id: customer.id },
      data: {
        appointmentCount: {
          increment: 1,
        },
      },
    });

    return successResponse(
      res,
      {
        ...newAppointment,
        bookingType: 'appointment',
      },
      'Appointment created successfully',
      201
    );
  } catch (error) {
    console.error('Create public appointment by slug error:', error);
    return errorResponse(res, 'Failed to create appointment', 500);
  }
};

/**
 * Public: Get appointments by business slug and staff/date range (no auth).
 * GET /api/public/business/:slug/appointments?staffId=...&start=...&end=...&limit=1000
 */
const getPublicAppointmentsBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9]{7}$/.test(slug)) {
      return errorResponse(res, 'Invalid business_public_slug', 400);
    }

    const staffId = String(req.query.staffId || '').trim();
    const startRaw = req.query.start;
    const endRaw = req.query.end;
    const limitRaw = Number(req.query.limit || 1000);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 1000;

    if (!staffId || !startRaw || !endRaw) {
      return errorResponse(res, 'staffId, start, and end are required', 400);
    }

    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return errorResponse(res, 'Invalid start/end date', 400);
    }
    if (endDate <= startDate) {
      return errorResponse(res, 'end must be after start', 400);
    }

    const business = await prisma.user.findUnique({
      where: { businessPublicSlug: slug },
      select: { id: true },
    });
    if (!business) {
      return errorResponse(res, 'Business not found', 404);
    }

    const staffMember = await prisma.staff.findFirst({
      where: {
        id: staffId,
        businessId: business.id,
        isDeleted: false,
        isActive: true,
      },
      select: { id: true },
    });
    if (!staffMember) {
      return errorResponse(res, 'Staff not found for this business', 400);
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        userId: business.id,
        staffId,
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
      orderBy: { startDate: 'asc' },
      take: limit,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        duration: true,
        appointmentStatus: true,
      },
    });

    return successResponse(res, { appointments });
  } catch (error) {
    console.error('Get public appointments by slug error:', error);
    return errorResponse(res, 'Failed to fetch appointments', 500);
  }
};

/**
 * Public: Cancel a newly created public booking by slug + booking id (no auth).
 * PATCH /api/public/business/:slug/bookings/:bookingId/cancel
 * Body: { bookingType: "appointment" | "waitlist" }
 */
const cancelPublicBookingBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const bookingId = String(req.params.bookingId || '').trim();
    const bookingType = String(req.body?.bookingType || 'appointment').trim().toLowerCase();

    if (!/^[a-z0-9]{7}$/.test(slug)) {
      return errorResponse(res, 'Invalid business_public_slug', 400);
    }
    if (!bookingId) {
      return errorResponse(res, 'bookingId is required', 400);
    }
    if (!['appointment', 'waitlist'].includes(bookingType)) {
      return errorResponse(res, 'Invalid bookingType. Must be appointment or waitlist', 400);
    }

    const business = await prisma.user.findUnique({
      where: { businessPublicSlug: slug },
      select: { id: true },
    });
    if (!business) {
      return errorResponse(res, 'Business not found', 404);
    }

    if (bookingType === 'waitlist') {
      const deleted = await prisma.waitlist.deleteMany({
        where: {
          id: bookingId,
          userId: business.id,
        },
      });
      if (!deleted.count) {
        return errorResponse(res, 'Waitlist entry not found', 404);
      }
      return successResponse(
        res,
        { id: bookingId, bookingType: 'waitlist', action: 'deleted' },
        'Waitlist request cancelled successfully'
      );
    }

    const updated = await prisma.appointment.updateMany({
      where: {
        id: bookingId,
        userId: business.id,
      },
      data: {
        appointmentStatus: constants.APPOINTMENT_STATUS.CANCELLED,
      },
    });
    if (!updated.count) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    return successResponse(
      res,
      { id: bookingId, bookingType: 'appointment', action: 'cancelled' },
      'Appointment cancelled successfully'
    );
  } catch (error) {
    console.error('Cancel public booking by slug error:', error);
    return errorResponse(res, 'Failed to cancel booking', 500);
  }
};

module.exports = {
  getPublicBusinessBySlug,
  createPublicAppointmentBySlug,
  getPublicAppointmentsBySlug,
  cancelPublicBookingBySlug,
};
