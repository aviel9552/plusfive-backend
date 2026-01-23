const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { WAITLIST_STATUS } = require('../config/constants');

/**
 * Map DB waitlist row to frontend shape.
 * Frontend expects: id, client, service, staff (same shape), date|requestedDate, time, status.
 */
function toFrontendItem(row) {
  const clientName = row.customer?.customerFullName ||
    [row.customer?.firstName, row.customer?.lastName].filter(Boolean).join(' ') ||
    'Unknown Client';
  return {
    id: row.id,
    client: {
      id: row.customer?.id,
      name: clientName,
      email: row.customer?.email,
      customerPhone: row.customer?.customerPhone,
      profileImage: row.customer?.profileImage,
    },
    customerId: row.customerId,
    service: {
      id: row.service?.id,
      name: row.service?.name,
      duration: row.service?.duration,
      price: row.service?.price,
      notes: row.service?.notes,
    },
    serviceId: row.serviceId,
    staff: row.staff
      ? {
          id: row.staff.id,
          name: row.staff.fullName,
          fullName: row.staff.fullName,
          email: row.staff.email,
          phone: row.staff.phone,
          image: row.staff.image,
        }
      : null,
    staffId: row.staffId ?? null,
    date: row.requestedDate,
    requestedDate: row.requestedDate,
    time: row.time ?? 'any',
    startDateTime: row.startDateTime,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * GET /api/waitlist
 * Get all waitlist entries for the authenticated user (business).
 */
const getAllWaitlist = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const items = await prisma.waitlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        service: true,
        staff: true, // Optional: staff who is preferred for this waitlist entry
      },
    });

    const data = items.map(toFrontendItem);
    return successResponse(res, { waitlist: data, total: data.length });
  } catch (error) {
    console.error('Get all waitlist error:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, `Failed to fetch waitlist: ${error.message}`, 500);
  }
};

/**
 * GET /api/waitlist/:id
 * Get a single waitlist entry by ID.
 */
const getWaitlistById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const row = await prisma.waitlist.findFirst({
      where: { id, userId },
      include: {
        customer: true,
        service: true,
        staff: true,
      },
    });

    if (!row) {
      return errorResponse(res, 'Waitlist entry not found', 404);
    }

    return successResponse(res, toFrontendItem(row));
  } catch (error) {
    console.error('Get waitlist by ID error:', error);
    return errorResponse(res, 'Failed to fetch waitlist entry', 500);
  }
};

/**
 * POST /api/waitlist
 * Create a new waitlist entry.
 * Body (frontend): { client, service, date, time?, startDateTime?, status? }
 * Or: { customerId, serviceId, requestedDate, time?, startDateTime?, note?, status? }
 */
const createWaitlist = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const {
      customerId,
      serviceId,
      staffId: staffIdBody,
      requestedDate,
      date,
      client,
      service: serviceObj,
      staff: staffObj,
      time,
      startDateTime,
      note,
      status,
    } = req.body;

    const customerIdVal = customerId || (client && (typeof client === 'object' ? client.id : null));
    const serviceIdVal = serviceId || (serviceObj && (typeof serviceObj === 'object' ? serviceObj.id : null));
    const staffIdVal = staffIdBody || (staffObj && (typeof staffObj === 'object' ? staffObj.id : null));
    const dateInput = requestedDate ?? date;

    if (!customerIdVal || !serviceIdVal) {
      return errorResponse(res, 'customerId and serviceId (or client and service) are required', 400);
    }

    let requestedDateObj;
    if (dateInput instanceof Date) {
      requestedDateObj = dateInput;
    } else if (typeof dateInput === 'string') {
      requestedDateObj = new Date(dateInput);
    } else if (dateInput && typeof dateInput === 'object' && dateInput.getTime) {
      requestedDateObj = dateInput;
    } else {
      return errorResponse(res, 'requestedDate/date is required (ISO string or Date)', 400);
    }

    if (isNaN(requestedDateObj.getTime())) {
      return errorResponse(res, 'Invalid requestedDate', 400);
    }

    const customer = await prisma.customers.findFirst({
      where: { id: customerIdVal },
    });
    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    const service = await prisma.service.findFirst({
      where: { id: serviceIdVal, businessId: userId },
    });
    if (!service) {
      return errorResponse(res, 'Service not found', 404);
    }

    let staffIdToSave = null;
    if (staffIdVal) {
      const staff = await prisma.staff.findFirst({
        where: { id: staffIdVal, businessId: userId, isDeleted: false },
      });
      if (!staff) {
        return errorResponse(res, 'Staff not found', 404);
      }
      staffIdToSave = staffIdVal;
    }

    let startDateTimeObj = null;
    if (startDateTime) {
      startDateTimeObj = new Date(startDateTime);
      if (isNaN(startDateTimeObj.getTime())) startDateTimeObj = null;
    }

    const timeVal = time === 'any' || time == null || time === '' ? 'any' : String(time);
    const statusVal = status && ['waiting', 'expired', 'booked'].includes(status)
      ? status
      : 'waiting';

    const created = await prisma.waitlist.create({
      data: {
        userId,
        customerId: customerIdVal,
        serviceId: serviceIdVal,
        staffId: staffIdToSave,
        requestedDate: requestedDateObj,
        time: timeVal,
        startDateTime: startDateTimeObj,
        status: statusVal,
        note: note && String(note).trim() ? String(note).trim() : null,
      },
      include: {
        customer: true,
        service: true,
        staff: true,
      },
    });

    return successResponse(res, toFrontendItem(created), 'Waitlist entry created');
  } catch (error) {
    console.error('Create waitlist error:', error);
    return errorResponse(res, 'Failed to create waitlist entry', 500);
  }
};

/**
 * PUT /api/waitlist/:id
 * Update a waitlist entry (status, requestedDate, time, note).
 */
const updateWaitlist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const existing = await prisma.waitlist.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return errorResponse(res, 'Waitlist entry not found', 404);
    }

    const { status, requestedDate, time, startDateTime, note } = req.body;
    const updates = {};
    const validStatuses = [WAITLIST_STATUS.WAITING, WAITLIST_STATUS.EXPIRED, WAITLIST_STATUS.BOOKED];

    if (status && validStatuses.includes(status)) {
      updates.status = status;
    }
    if (requestedDate != null) {
      const d = new Date(requestedDate);
      if (!isNaN(d.getTime())) updates.requestedDate = d;
    }
    if (time !== undefined) {
      updates.time = time === 'any' || time == null || time === '' ? 'any' : String(time);
    }
    if (startDateTime != null) {
      const d = new Date(startDateTime);
      updates.startDateTime = isNaN(d.getTime()) ? null : d;
    }
    if (note !== undefined) {
      updates.note = note && String(note).trim() ? String(note).trim() : null;
    }

    const updated = await prisma.waitlist.update({
      where: { id },
      data: updates,
      include: {
        customer: true,
        service: true,
        staff: true,
      },
    });

    return successResponse(res, toFrontendItem(updated), 'Waitlist entry updated');
  } catch (error) {
    console.error('Update waitlist error:', error);
    return errorResponse(res, 'Failed to update waitlist entry', 500);
  }
};

/**
 * DELETE /api/waitlist/:id
 * Delete a waitlist entry.
 */
const deleteWaitlist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const existing = await prisma.waitlist.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return errorResponse(res, 'Waitlist entry not found', 404);
    }

    await prisma.waitlist.delete({
      where: { id },
    });

    return successResponse(res, { id }, 'Waitlist entry deleted');
  } catch (error) {
    console.error('Delete waitlist error:', error);
    return errorResponse(res, 'Failed to delete waitlist entry', 500);
  }
};

module.exports = {
  getAllWaitlist,
  getWaitlistById,
  createWaitlist,
  updateWaitlist,
  deleteWaitlist,
};
