const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { APPOINTMENT_STATUS, WAITLIST_STATUS } = require('../config/constants');

function toMonthRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  const now = new Date();
  const safeYear = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : now.getFullYear();
  const safeMonth = Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
  const start = new Date(Date.UTC(safeYear, safeMonth - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(safeYear, safeMonth, 1, 0, 0, 0, 0));
  return { safeYear, safeMonth, start, end };
}

function asDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function asMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toTimeHHmm(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sumBy(items, pick) {
  return items.reduce((acc, item) => acc + Number(pick(item) || 0), 0);
}

async function ensureCustomerAccess(customerId, businessUserId) {
  const customer = await prisma.customers.findFirst({
    where: { id: customerId, userId: businessUserId },
    select: {
      id: true,
      customerFullName: true,
      firstName: true,
      lastName: true,
      customerPhone: true,
      userId: true,
      user: {
        select: {
          id: true,
          businessName: true,
          businessPublicSlug: true,
          isActive: true,
          isDeleted: true,
        },
      },
      customerUsers: {
        where: { userId: businessUserId, isDeleted: false },
        select: { status: true, isActive: true },
        take: 1,
      },
    },
  });

  if (!customer) {
    return { error: 'Customer not found for this business', status: 404 };
  }
  if (!customer.user || customer.user.isDeleted || !customer.user.isActive) {
    return { error: 'Business is not available', status: 403 };
  }
  const link = customer.customerUsers[0];
  if (!link || !link.isActive || link.status === 'blocked') {
    return { error: 'Access denied for this business', status: 403 };
  }
  return { customer };
}

function buildAppointmentStatusWhere(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return {};

  // AppointmentStatus enum values in Prisma:
  // booked | cancelled | scheduled
  const statusAliases = {
    completed: [APPOINTMENT_STATUS.SCHEDULED],
    done: [APPOINTMENT_STATUS.SCHEDULED],
    complete: [APPOINTMENT_STATUS.SCHEDULED],
    [APPOINTMENT_STATUS.SCHEDULED]: [APPOINTMENT_STATUS.SCHEDULED],
    [APPOINTMENT_STATUS.CANCELLED]: [APPOINTMENT_STATUS.CANCELLED],
    canceled: [APPOINTMENT_STATUS.CANCELLED],
    cancel: [APPOINTMENT_STATUS.CANCELLED],
    [APPOINTMENT_STATUS.BOOKED]: [APPOINTMENT_STATUS.BOOKED],
    confirmed: [APPOINTMENT_STATUS.BOOKED],
    approved: [APPOINTMENT_STATUS.BOOKED],
    pending: [APPOINTMENT_STATUS.BOOKED],
    process: [APPOINTMENT_STATUS.BOOKED],
    processing: [APPOINTMENT_STATUS.BOOKED],
  };

  const validStatuses = [
    APPOINTMENT_STATUS.BOOKED,
    APPOINTMENT_STATUS.CANCELLED,
    APPOINTMENT_STATUS.SCHEDULED,
  ];
  const variants = statusAliases[raw] || (validStatuses.includes(raw) ? [raw] : []);
  if (!variants.length) return {};
  return { appointmentStatus: { in: variants } };
}

const getCustomerDashboardOverview = async (req, res) => {
  try {
    const { customerId, businessUserId } = req.customerAuth || {};
    if (!customerId || !businessUserId) {
      return errorResponse(res, 'Customer authentication context missing', 401);
    }

    const access = await ensureCustomerAccess(customerId, businessUserId);
    if (access.error) {
      return errorResponse(res, access.error, access.status);
    }
    const { customer } = access;

    const { safeYear, safeMonth, start, end } = toMonthRange(req.query.year, req.query.month);
    const sixMonthsAgo = new Date(Date.UTC(safeYear, safeMonth - 6, 1, 0, 0, 0, 0));

    const [appointmentsMonth, paymentsMonth, paymentsSixMonths, paymentsAll, appointmentAll] =
      await Promise.all([
        prisma.appointment.findMany({
          where: {
            customerId,
            userId: businessUserId,
            startDate: { gte: start, lt: end },
          },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            duration: true,
            appointmentStatus: true,
            customerNote: true,
            recurringType: true,
            recurringDuration: true,
            createdAt: true,
            staffId: true,
            serviceId: true,
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
              },
            },
          },
          orderBy: { startDate: 'asc' },
        }),
        prisma.paymentWebhook.findMany({
          where: {
            customerId,
            userId: businessUserId,
            paymentDate: { gte: start, lt: end },
          },
          select: { id: true, total: true, status: true, paymentDate: true },
          orderBy: { paymentDate: 'asc' },
        }),
        prisma.paymentWebhook.findMany({
          where: {
            customerId,
            userId: businessUserId,
            paymentDate: { gte: sixMonthsAgo, lt: end },
          },
          select: { total: true, status: true, paymentDate: true },
          orderBy: { paymentDate: 'asc' },
        }),
        prisma.paymentWebhook.findMany({
          where: { customerId, userId: businessUserId },
          select: { total: true },
        }),
        prisma.appointment.findMany({
          where: { customerId, userId: businessUserId },
          select: { id: true },
        }),
      ]);

    const dailyAppointmentsMap = new Map();
    for (const row of appointmentsMonth) {
      if (!row.startDate) continue;
      const key = asDayKey(new Date(row.startDate));
      dailyAppointmentsMap.set(key, (dailyAppointmentsMap.get(key) || 0) + 1);
    }
    const dailyAppointments = Array.from(dailyAppointmentsMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    const dailyPaymentsMap = new Map();
    for (const row of paymentsMonth) {
      const key = asDayKey(new Date(row.paymentDate));
      const prev = dailyPaymentsMap.get(key) || { date: key, total: 0, count: 0 };
      prev.total += Number(row.total || 0);
      prev.count += 1;
      dailyPaymentsMap.set(key, prev);
    }
    const dailyPayments = Array.from(dailyPaymentsMap.values());

    const monthlyPaymentsMap = new Map();
    for (const row of paymentsSixMonths) {
      const key = asMonthKey(new Date(row.paymentDate));
      const prev = monthlyPaymentsMap.get(key) || { month: key, total: 0, count: 0 };
      prev.total += Number(row.total || 0);
      prev.count += 1;
      monthlyPaymentsMap.set(key, prev);
    }
    const monthlyPayments = Array.from(monthlyPaymentsMap.values());

    const paymentStatusMap = new Map();
    for (const row of paymentsMonth) {
      const status = String(row.status || 'unknown');
      const prev = paymentStatusMap.get(status) || { status, count: 0, total: 0 };
      prev.count += 1;
      prev.total += Number(row.total || 0);
      paymentStatusMap.set(status, prev);
    }
    const paymentStatusBreakdown = Array.from(paymentStatusMap.values());

    const appointmentStatusMap = new Map();
    for (const row of appointmentsMonth) {
      const status = String(row.appointmentStatus || 'unknown');
      appointmentStatusMap.set(status, (appointmentStatusMap.get(status) || 0) + 1);
    }
    const appointmentStatusBreakdown = Array.from(appointmentStatusMap.entries()).map(
      ([status, count]) => ({ status, count })
    );

    const totalPaidThisMonth = sumBy(paymentsMonth, (x) => x.total);
    const totalPaidAllTime = sumBy(paymentsAll, (x) => x.total);
    const appointmentDetails = appointmentsMonth.map((row) => {
      const startTime = toTimeHHmm(row.startDate);
      const endTime = toTimeHHmm(row.endDate);
      return {
        id: row.id,
        appointmentStatus: row.appointmentStatus || APPOINTMENT_STATUS.BOOKED,
        date: row.startDate ? asDayKey(new Date(row.startDate)) : null,
        startTime,
        endTime,
        timeSlot: startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime || null,
        duration: row.duration || row.service?.duration || null,
        serviceId: row.serviceId || row.service?.id || null,
        serviceName: row.service?.name || null,
        servicePrice: row.service?.price || null,
        staffId: row.staffId || row.staff?.id || null,
        staffName: row.staff?.fullName || null,
        customerNote: row.customerNote || null,
        recurringType: row.recurringType || null,
        recurringDuration: row.recurringDuration || null,
        createdAt: row.createdAt || null,
      };
    });

    return successResponse(
      res,
      {
        customer: {
          id: customer.id,
          customerFullName:
            customer.customerFullName ||
            [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
            null,
          customerPhone: customer.customerPhone || null,
        },
        business: {
          id: customer.user.id,
          businessName: customer.user.businessName || null,
          businessPublicSlug: customer.user.businessPublicSlug || null,
        },
        period: {
          year: safeYear,
          month: safeMonth,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        kpis: {
          totalAppointmentsThisMonth: appointmentsMonth.length,
          totalAppointmentsAllTime: appointmentAll.length,
          totalPaymentsThisMonth: paymentsMonth.length,
          totalPaidThisMonth,
          totalPaidAllTime,
          currency: 'ILS',
        },
        charts: {
          dailyAppointments,
          dailyPayments,
          monthlyPayments,
          paymentStatusBreakdown,
          appointmentStatusBreakdown,
        },
        appointmentDetails,
        recentPayments: paymentsMonth.slice(-10).reverse(),
      },
      'Customer dashboard overview fetched successfully'
    );
  } catch (error) {
    console.error('getCustomerDashboardOverview error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

const getCustomerAppointments = async (req, res) => {
  try {
    const { customerId, businessUserId } = req.customerAuth || {};
    if (!customerId || !businessUserId) {
      return errorResponse(res, 'Customer authentication context missing', 401);
    }

    const access = await ensureCustomerAccess(customerId, businessUserId);
    if (access.error) {
      return errorResponse(res, access.error, access.status);
    }

    const {
      year,
      month,
      search = '',
      page = 1,
      pageSize = 10,
      status = '',
      service = '',
      staff = '',
      startDate,
      endDate,
    } = req.query;

    const { start, end } = toMonthRange(year, month);
    const startBound = startDate ? new Date(`${startDate}T00:00:00`) : start;
    const endBound = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date(end.getTime() - 1);

    const where = {
      customerId,
      userId: businessUserId,
      startDate: { gte: startBound, lte: endBound },
      ...buildAppointmentStatusWhere(status),
      ...(service ? { service: { name: service } } : {}),
      ...(staff ? { staff: { fullName: staff } } : {}),
      ...(search
        ? {
            OR: [
              { appointmentStatus: { contains: search, mode: 'insensitive' } },
              { customerNote: { contains: search, mode: 'insensitive' } },
              { service: { name: { contains: search, mode: 'insensitive' } } },
              { staff: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const sizeNum = Math.max(1, Math.min(100, Number(pageSize) || 10));
    const skip = (pageNum - 1) * sizeNum;

    const [items, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          duration: true,
          appointmentStatus: true,
          customerNote: true,
          recurringType: true,
          recurringDuration: true,
          createdAt: true,
          staffId: true,
          serviceId: true,
          staff: { select: { id: true, fullName: true } },
          service: { select: { id: true, name: true, duration: true, price: true } },
        },
        orderBy: { startDate: 'asc' },
        skip,
        take: sizeNum,
      }),
      prisma.appointment.count({ where }),
    ]);

    const appointmentDetails = items.map((row) => {
      const startTime = toTimeHHmm(row.startDate);
      const endTime = toTimeHHmm(row.endDate);
      return {
        id: row.id,
        appointmentStatus: row.appointmentStatus || 'unknown',
        date: row.startDate ? asDayKey(new Date(row.startDate)) : null,
        startTime,
        endTime,
        timeSlot: startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime || null,
        duration: row.duration || row.service?.duration || null,
        serviceId: row.serviceId || row.service?.id || null,
        serviceName: row.service?.name || null,
        servicePrice: row.service?.price || null,
        staffId: row.staffId || row.staff?.id || null,
        staffName: row.staff?.fullName || null,
        customerNote: row.customerNote || null,
        recurringType: row.recurringType || null,
        recurringDuration: row.recurringDuration || null,
        createdAt: row.createdAt || null,
      };
    });

    return successResponse(
      res,
      {
        appointmentDetails,
        total,
        page: pageNum,
        pageSize: sizeNum,
        totalPages: Math.max(1, Math.ceil(total / sizeNum)),
      },
      'Customer appointments fetched successfully'
    );
  } catch (error) {
    console.error('getCustomerAppointments error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

const getCustomerPayments = async (req, res) => {
  try {
    const { customerId, businessUserId } = req.customerAuth || {};
    if (!customerId || !businessUserId) {
      return errorResponse(res, 'Customer authentication context missing', 401);
    }

    const access = await ensureCustomerAccess(customerId, businessUserId);
    if (access.error) {
      return errorResponse(res, access.error, access.status);
    }

    const {
      year,
      month,
      search = '',
      page = 1,
      pageSize = 10,
      status = '',
      startDate,
      endDate,
    } = req.query;

    const { start, end } = toMonthRange(year, month);
    const startBound = startDate ? new Date(`${startDate}T00:00:00`) : start;
    const endBound = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date(end.getTime() - 1);

    const where = {
      customerId,
      userId: businessUserId,
      paymentDate: { gte: startBound, lte: endBound },
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { status: { contains: search, mode: 'insensitive' } },
              { revenuePaymentStatus: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const sizeNum = Math.max(1, Math.min(100, Number(pageSize) || 10));
    const skip = (pageNum - 1) * sizeNum;

    const [items, total] = await Promise.all([
      prisma.paymentWebhook.findMany({
        where,
        select: {
          id: true,
          paymentDate: true,
          total: true,
          status: true,
          revenuePaymentStatus: true,
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: sizeNum,
      }),
      prisma.paymentWebhook.count({ where }),
    ]);

    const payments = items.map((row) => ({
      id: row.id,
      paymentDate: row.paymentDate || null,
      total: Number(row.total || 0),
      status: row.status || 'unknown',
      revenuePaymentStatus: row.revenuePaymentStatus || null,
    }));

    return successResponse(
      res,
      {
        payments,
        total,
        page: pageNum,
        pageSize: sizeNum,
        totalPages: Math.max(1, Math.ceil(total / sizeNum)),
      },
      'Customer payments fetched successfully'
    );
  } catch (error) {
    console.error('getCustomerPayments error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

const getCustomerWaitlist = async (req, res) => {
  try {
    const { customerId, businessUserId } = req.customerAuth || {};
    if (!customerId || !businessUserId) {
      return errorResponse(res, 'Customer authentication context missing', 401);
    }

    const access = await ensureCustomerAccess(customerId, businessUserId);
    if (access.error) {
      return errorResponse(res, access.error, access.status);
    }

    const items = await prisma.waitlist.findMany({
      where: {
        customerId,
        userId: businessUserId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        service: {
          select: { id: true, name: true, duration: true, price: true },
        },
        staff: {
          select: { id: true, fullName: true },
        },
        user: {
          select: { id: true, businessName: true },
        },
      },
    });

    const waitlist = items.map((row) => ({
      id: row.id,
      requestedDate: row.requestedDate ? row.requestedDate.toISOString() : null,
      time: row.time || 'any',
      status: row.status || WAITLIST_STATUS.WAITING,
      note: row.note || null,
      serviceId: row.serviceId || null,
      serviceName: row.service?.name || null,
      staffId: row.staffId || null,
      staffName: row.staff?.fullName || null,
      businessName: row.user?.businessName || null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    }));

    return successResponse(
      res,
      { waitlist, total: waitlist.length },
      'Customer waitlist fetched successfully'
    );
  } catch (error) {
    console.error('getCustomerWaitlist error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  getCustomerDashboardOverview,
  getCustomerAppointments,
  getCustomerPayments,
  getCustomerWaitlist,
};

