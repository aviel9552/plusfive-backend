/**
 * Phone number formatting utilities for the backend.
 * Use these globally for consistent Israeli phone handling (storage, lookups, display).
 */

/**
 * Normalize Israeli phone number to E.164 storage format: +972XXXXXXXXX
 * Use for: DB storage, customer lookups, webhooks, APIs.
 * @param {string|number|null|undefined} phoneNumber - Raw phone input
 * @returns {string|null} - "+972..." or null if input is falsy
 */
function formatIsraeliPhone(phoneNumber) {
  if (!phoneNumber) return null;

  // Remove any existing country code or special characters
  let cleanPhone = phoneNumber.toString().replace(/[\s\-\(\)\+]/g, '');

  // If phone already starts with 972, just add +
  if (cleanPhone.startsWith('972')) {
    return `+${cleanPhone}`;
  }

  // If phone starts with 0, remove it and add +972
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  // Add Israel country code +972
  return `+972${cleanPhone}`;
}

/**
 * Convert stored E.164 Israeli number (+972...) to local display format (0...)
 * Use when returning phone to frontend for display in Israeli format.
 * @param {string|null|undefined} phoneNumber - Stored phone (e.g. +972501234567)
 * @returns {string|null} - "0501234567" or null if input is falsy
 */
function formatIsraelPhoneToLocal(phoneNumber) {
  if (!phoneNumber) return null;

  let cleaned = String(phoneNumber).replace(/[\s\-\(\)]/g, '');

  if (cleaned.startsWith('+972')) {
    return '0' + cleaned.substring(4);
  }
  if (cleaned.startsWith('972')) {
    return '0' + cleaned.substring(3);
  }
  if (cleaned.startsWith('0')) {
    return cleaned;
  }
  if (cleaned.startsWith('5') && cleaned.length === 9) {
    return '0' + cleaned;
  }

  return cleaned;
}

/**
 * Validate Israeli phone: must be 10 digits in local form (0 + 9 digits) or 9 digits.
 * After normalization to +972, the number must have exactly 9 digits.
 * @param {string|number|null|undefined} phoneNumber - Raw phone input
 * @returns {boolean} - true if valid (10 digits e.g. 0501234567)
 */
function isValidIsraelPhone(phoneNumber) {
  if (!phoneNumber) return false;
  const normalized = formatIsraeliPhone(phoneNumber);
  if (!normalized || !normalized.startsWith('+972')) return false;
  const digitsOnly = normalized.replace(/\D/g, '');
  const after972 = digitsOnly.startsWith('972') ? digitsOnly.slice(3) : digitsOnly;
  return after972.length === 9 && /^[0-9]{9}$/.test(after972);
}

/** Standard validation error message (EN + HE) for use across all APIs */
const PHONE_VALIDATION_ERROR_MESSAGE = 'Invalid phone number. Must be 10 digits (e.g. 0501234567). מספר הטלפון לא תקין - חייב להכיל 10 ספרות.';

module.exports = {
  formatIsraeliPhone,
  formatIsraelPhoneToLocal,
  isValidIsraelPhone,
  PHONE_VALIDATION_ERROR_MESSAGE,
};
