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

    return successResponse(res, {
      business: {
        ...business,
        phoneNumber: business.phoneNumber ? formatIsraelPhoneToLocal(business.phoneNumber) : business.phoneNumber,
      },
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
    } = req.body || {};

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
      select: { id: true, businessPublicSlug: true },
    });
    if (!business) {
      return errorResponse(res, 'Business not found', 404);
    }
    const userId = business.id;

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

    const newAppointment = await prisma.appointment.create({
      data: {
        source: source || 'public',
        endDate: parsedEndDate,
        duration: duration || null,
        startDate: parsedStartDate,
        createDate: new Date(),
        customerId: customer.id,
        userId,
        staffId,
        serviceId,
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

    return successResponse(res, newAppointment, 'Appointment created successfully', 201);
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

module.exports = {
  getPublicBusinessBySlug,
  createPublicAppointmentBySlug,
  getPublicAppointmentsBySlug,
};
