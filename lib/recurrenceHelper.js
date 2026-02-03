/**
 * Recurrence helper – same logic as frontend recurringEngine
 * Used when creating recurring appointments on the backend.
 *
 * Examples:
 * - Every Day + 1 Week → 7 dates (one per day for the week), according to business/staff availability
 * - Every Month + 2 Months → 2 dates (start, start+1 month)
 * - Every Week + 2 Months → 8 dates (one per week for 60 days)
 */

const {
  RECURRENCE_SERVICE_TYPE,
  RECURRENCE_DURATION_UNIT,
  RECURRENCE_DAYS_PER
} = require('../config/constants');

/**
 * Format a Date to YYYY-MM-DD (local date, no timezone shift)
 * @param {Date} d
 * @returns {string}
 */
function formatDateLocal(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse start date from string (YYYY-MM-DD) or Date
 * @param {string|Date} startDate
 * @returns {Date}
 */
function parseStartDate(startDate) {
  if (typeof startDate === 'string' && startDate.includes('-')) {
    const [year, month, day] = startDate.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Calculate recurring appointment dates (backend – matches frontend logic).
 *
 * @param {string} recurringType - e.g. "Every Day", "Every Week", "Every 2 Weeks", "Every Month"
 * @param {string} recurringDuration - e.g. "1 Week", "2 Weeks", "1 Month", "2 Months"
 * @param {string|Date} startDate - First appointment date
 * @returns {string[]} - Array of YYYY-MM-DD date strings
 */
function calculateRecurringDates(recurringType, recurringDuration, startDate) {
  if (!recurringType || recurringType === RECURRENCE_SERVICE_TYPE.REGULAR) {
    const start = parseStartDate(startDate);
    return [formatDateLocal(start)];
  }

  const start = parseStartDate(startDate);
  const dates = [];
  let isMonthBased = false;
  let monthInterval = 0;
  let intervalDays = 0;

  if (recurringType === RECURRENCE_SERVICE_TYPE.EVERY_DAY) {
    intervalDays = 1;
  } else if (recurringType === RECURRENCE_SERVICE_TYPE.EVERY_WEEK) {
    intervalDays = RECURRENCE_DAYS_PER.WEEK;
  } else if (recurringType === RECURRENCE_SERVICE_TYPE.EVERY_2_WEEKS) {
    intervalDays = RECURRENCE_DAYS_PER.WEEK * 2;
  } else if (recurringType === RECURRENCE_SERVICE_TYPE.EVERY_3_WEEKS) {
    intervalDays = RECURRENCE_DAYS_PER.WEEK * 3;
  } else if (recurringType === RECURRENCE_SERVICE_TYPE.EVERY_MONTH) {
    isMonthBased = true;
    monthInterval = 1;
  } else if (recurringType === RECURRENCE_SERVICE_TYPE.EVERY_2_MONTHS) {
    isMonthBased = true;
    monthInterval = 2;
  } else if (recurringType.startsWith(RECURRENCE_SERVICE_TYPE.PREFIX_EVERY)) {
    const match = recurringType.match(/Every\s+(\d+)\s*(Day|Week|Month|Days|Weeks|Months)/i);
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase().replace(/s$/, '');
      if (unit === RECURRENCE_DURATION_UNIT.DAY) intervalDays = amount;
      else if (unit === RECURRENCE_DURATION_UNIT.WEEK) intervalDays = amount * RECURRENCE_DAYS_PER.WEEK;
      else if (unit === RECURRENCE_DURATION_UNIT.MONTH) {
        isMonthBased = true;
        monthInterval = amount;
      }
    }
  }

  let totalAppointments = 1;

  if (isMonthBased) {
    const durationMatch = (recurringDuration || '').match(/(\d+(?:\.\d+)?)\s*(Week|Month|Weeks|Months)/i);
    if (durationMatch) {
      const amount = parseFloat(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase().replace(/s$/, '');
      if (unit === RECURRENCE_DURATION_UNIT.MONTH) {
        totalAppointments = Math.max(1, Math.floor(amount / monthInterval));
      } else if (unit === RECURRENCE_DURATION_UNIT.WEEK) {
        totalAppointments = Math.max(1, Math.floor(amount / 4 / monthInterval));
      }
    }
  } else {
    let totalDurationInDays = 0;
    const durationMatch = (recurringDuration || '').match(/(\d+(?:\.\d+)?)\s*(Week|Month|Weeks|Months)/i);
    if (durationMatch) {
      const amount = parseFloat(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase().replace(/s$/, '');
      if (unit === RECURRENCE_DURATION_UNIT.WEEK) totalDurationInDays = amount * RECURRENCE_DAYS_PER.WEEK;
      else if (unit === RECURRENCE_DURATION_UNIT.MONTH) totalDurationInDays = amount * RECURRENCE_DAYS_PER.MONTH;
    }
    if (intervalDays > 0 && totalDurationInDays > 0) {
      totalAppointments = Math.max(1, Math.floor(totalDurationInDays / intervalDays));
    }
  }

  const firstDate = new Date(start);
  dates.push(formatDateLocal(firstDate));

  if (totalAppointments > 1) {
    const current = new Date(start);
    for (let i = 1; i < totalAppointments; i++) {
      if (isMonthBased) {
        current.setMonth(current.getMonth() + monthInterval);
      } else {
        current.setDate(current.getDate() + intervalDays);
      }
      if (current.getTime() >= start.getTime()) {
        dates.push(formatDateLocal(new Date(current)));
      }
    }
  }

  return dates;
}

module.exports = {
  formatDateLocal,
  parseStartDate,
  calculateRecurringDates,
};
