/**
 * Availability helper – filter recurring dates by business and staff operating hours.
 * Used so recurring appointments are only created on days when the business is open
 * and the staff member is available (same time slot).
 */

const { JS_DAY_TO_HEBREW, DAYS_OF_WEEK_KEYS } = require('../config/constants');

/**
 * Get day identifier for a date (Hebrew abbrev; used to match DB column).
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} e.g. "א'", "ב'"
 */
function getDayHebrewAbbrev(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dayIndex = date.getDay();
  return JS_DAY_TO_HEBREW[dayIndex] || null;
}

/**
 * Get day index (0-6) from date string.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {number}
 */
function getDayIndex(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return -1;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  return date.getDay();
}

/**
 * Parse time "HH:MM" to minutes since midnight.
 * @param {string} timeStr
 * @returns {number}
 */
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Check if slot [slotStartMinutes, slotEndMinutes] is fully within range [rangeStart, rangeEnd].
 * Handles range spanning midnight (end < start).
 * @param {number} slotStartMinutes
 * @param {number} slotEndMinutes
 * @param {string} rangeStartTime - "HH:MM"
 * @param {string} rangeEndTime - "HH:MM"
 * @returns {boolean}
 */
function isSlotWithinRange(slotStartMinutes, slotEndMinutes, rangeStartTime, rangeEndTime) {
  const rangeStart = timeToMinutes(rangeStartTime);
  const rangeEnd = timeToMinutes(rangeEndTime);
  if (rangeEnd < rangeStart) {
    // Range spans midnight: slot must fit in [rangeStart, 24:00) or [0, rangeEnd]
    const fitsFirst = slotStartMinutes >= rangeStart && slotEndMinutes <= 24 * 60;
    const fitsSecond = slotStartMinutes >= 0 && slotEndMinutes <= rangeEnd;
    return fitsFirst || fitsSecond;
  }
  return slotStartMinutes >= rangeStart && slotEndMinutes <= rangeEnd;
}

/**
 * Check if any operating hour row for the given day allows the time slot.
 * DB day may be Hebrew (א', ב') or English key (sunday, monday).
 * @param {Array<{ day: string, startTime: string, endTime: string, isActive: boolean }>} hours
 * @param {string} dayHebrew - e.g. "א'"
 * @param {string} dayKey - e.g. "sunday"
 * @param {number} slotStartMinutes
 * @param {number} slotEndMinutes
 * @returns {boolean}
 */
function isDayAndTimeAvailable(hours, dayHebrew, dayKey, slotStartMinutes, slotEndMinutes) {
  if (!hours || !Array.isArray(hours)) return false;
  if (!dayHebrew && !dayKey) return false;
  const dayRows = hours.filter((h) => {
    if (h.isActive === false) return false;
    const d = (h.day || '').trim().toLowerCase();
    const matchHebrew = dayHebrew && (d === dayHebrew || d === (dayHebrew || '').replace(/׳/g, "'"));
    const matchKey = dayKey && d === dayKey;
    return matchHebrew || matchKey;
  });
  if (dayRows.length === 0) return false;
  return dayRows.some((h) =>
    isSlotWithinRange(slotStartMinutes, slotEndMinutes, h.startTime || '00:00', h.endTime || '23:59')
  );
}

/**
 * Filter recurring date strings to only those when the business is open and (if staffId)
 * the staff is available for the given time slot.
 * Days when staff or business are inactive (e.g. Sunday/Saturday with isActive: false) are skipped;
 * appointments are created only on the remaining available days.
 *
 * @param {string[]} dateStrings - Array of YYYY-MM-DD
 * @param {string} businessId - User ID (business)
 * @param {string|null} staffId - Staff ID or null (then only business hours are checked)
 * @param {string} startTimeStr - "HH:MM" appointment start
 * @param {string} endTimeStr - "HH:MM" appointment end
 * @param {object} prisma - Prisma client
 * @returns {Promise<string[]>} - Filtered YYYY-MM-DD array (unavailable days skipped)
 */
async function filterRecurringDatesByAvailability(
  dateStrings,
  businessId,
  staffId,
  startTimeStr,
  endTimeStr,
  prisma
) {
  if (!dateStrings || dateStrings.length === 0) return [];
  if (!businessId || !prisma) return dateStrings;

  const slotStart = timeToMinutes(startTimeStr);
  const slotEnd = timeToMinutes(endTimeStr);

  const [businessHours, staffHours] = await Promise.all([
    prisma.businessOperatingHours.findMany({
      where: { userId: businessId },
      select: { day: true, startTime: true, endTime: true, isActive: true },
    }),
    staffId
      ? prisma.staffOperatingHours.findMany({
          where: { staffId },
          select: { day: true, startTime: true, endTime: true, isActive: true },
        })
      : Promise.resolve([]),
  ]);

  const available = dateStrings.filter((dateStr) => {
    const dayIndex = getDayIndex(dateStr);
    if (dayIndex < 0) return false;
    const dayHebrew = JS_DAY_TO_HEBREW[dayIndex];
    const dayKey = DAYS_OF_WEEK_KEYS[dayIndex];
    const businessOk = isDayAndTimeAvailable(
      businessHours,
      dayHebrew,
      dayKey,
      slotStart,
      slotEnd
    );
    if (!businessOk) return false;
    if (staffId && staffHours.length > 0) {
      return isDayAndTimeAvailable(staffHours, dayHebrew, dayKey, slotStart, slotEnd);
    }
    return true;
  });

  return available;
}

/**
 * Filter out dates where the staff already has an appointment at the requested time slot
 * (avoids double-booking: e.g. 4 Feb 2026 16:10 already booked → skip that day for recurring).
 *
 * @param {string[]} dateStrings - YYYY-MM-DD dates (already filtered by availability)
 * @param {string} staffId - Staff ID
 * @param {number} startHours - Slot start hour (0-23)
 * @param {number} startMinutes - Slot start minute
 * @param {number} endHours - Slot end hour
 * @param {number} endMinutes - Slot end minute
 * @param {object} prisma - Prisma client
 * @returns {Promise<string[]>} - Dates with no existing appointment at that time
 */
async function filterRecurringDatesByExistingAppointments(
  dateStrings,
  staffId,
  startHours,
  startMinutes,
  endHours,
  endMinutes,
  prisma
) {
  if (!dateStrings || dateStrings.length === 0) return [];
  if (!staffId || !prisma) return dateStrings;

  const [firstY, firstM, firstD] = dateStrings[0].split('-').map(Number);
  const [lastY, lastM, lastD] = dateStrings[dateStrings.length - 1].split('-').map(Number);
  const rangeStart = new Date(firstY, firstM - 1, firstD, 0, 0, 0, 0);
  const rangeEnd = new Date(lastY, lastM - 1, lastD, 23, 59, 59, 999);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      staffId,
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
      appointmentStatus: { not: 'cancelled' },
    },
    select: { startDate: true, endDate: true },
  });

  const available = dateStrings.filter((dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const slotStart = new Date(y, m - 1, d, startHours, startMinutes, 0, 0);
    const slotEnd = new Date(y, m - 1, d, endHours, endMinutes, 0, 0);
    const hasConflict = existingAppointments.some(
      (apt) => apt.startDate < slotEnd && apt.endDate > slotStart
    );
    return !hasConflict;
  });

  return available;
}

module.exports = {
  getDayHebrewAbbrev,
  timeToMinutes,
  isSlotWithinRange,
  filterRecurringDatesByAvailability,
  filterRecurringDatesByExistingAppointments,
};
