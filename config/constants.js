// Application Constants
// Centralized constants for the application

module.exports = {
  // User Roles
  ROLES: {
    ADMIN: 'admin',
    USER: 'user',
    CUSTOMER: 'customer'
  },

  // Status Values
  STATUS: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    PENDING: 'pending',
    DELETED: 'deleted'
  },

  // Subscription Status
  SUBSCRIPTION_STATUS: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    PENDING: 'pending',
    CANCELED: 'canceled',
    EXPIRED: 'expired'
  },

  // Customer Status
  CUSTOMER_STATUS: {
    NEW: 'new',
    ACTIVE: 'active',
    AT_RISK: 'at_risk',
    RISK: 'risk',
    LOST: 'lost',
    RECOVERED: 'recovered'
  },

  // Customer Status Colors (for charts, badges, API responses - shared with frontend)
  CUSTOMER_STATUS_COLORS: {
    New: '#ff257c',
    Active: '#ff4e94',
    'At Risk': '#ff7db1',
    Lost: '#ffb7d4',
    Recovered: '#ffd5e6',
    Lead: '#f70964'
  },

  // Webhook Types
  WEBHOOK_TYPES: {
    APPOINTMENT: 'appointment',
    PAYMENT_CHECKOUT: 'payment_checkout',
    RATING: 'rating'
  },

  // Webhook Status
  WEBHOOK_STATUS: {
    PENDING: 'pending',
    PROCESSED: 'processed',
    FAILED: 'failed'
  },

  // Review Status
  REVIEW_STATUS: {
    SENT: 'sent',
    RECEIVED: 'received',
    PROCESSED: 'processed',
    RESPONDED: 'responded'
  },

  // Support Ticket Status
  SUPPORT_STATUS: {
    OPEN: 'open',
    IN_PROGRESS: 'in_progress',
    RESOLVED: 'resolved',
    CLOSED: 'closed'
  },

  // Support Ticket Priority
  SUPPORT_PRIORITY: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  },

  // Payment Status
  PAYMENT_STATUS: {
    SUCCESS: 'success',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    PENDING: 'pending'
  },

  // Cloudinary Folders
  CLOUDINARY_FOLDERS: {
    STAFF: 'Staff',
    CUSTOMER: 'Customer',
    BUSINESS_GALLERY: 'BusinessGallery'
  },

  // Supplier Status
  SUPPLIER_STATUS: {
    ACTIVE: 'פעיל',
    INACTIVE: 'לא פעיל'
  },

  // Supplier Status Boolean
  SUPPLIER_STATUS_BOOLEAN: {
    ACTIVE: true,
    INACTIVE: false
  },

  // Product Status
  PRODUCT_STATUS: {
    ACTIVE: 'פעיל',
    INACTIVE: 'לא פעיל'
  },

  // Product Status Boolean
  PRODUCT_STATUS_BOOLEAN: {
    ACTIVE: true,
    INACTIVE: false
  },

  // Waitlist Status
  WAITLIST_STATUS: {
    WAITING: 'waiting',
    EXPIRED: 'expired',
    BOOKED: 'booked'
  },

  // Appointment status: booked, cancelled, scheduled (matches Prisma enum AppointmentStatus)
  APPOINTMENT_STATUS: {
    BOOKED: 'booked',
    CANCELLED: 'cancelled',
    SCHEDULED: 'scheduled'
  },

  // Days of the week – client format: English key + Hebrew label (index 0 = Sunday … 6 = Saturday)
  DAYS_OF_WEEK: [
    { key: 'sunday', label: 'ראשון' },
    { key: 'monday', label: 'שני' },
    { key: 'tuesday', label: 'שלישי' },
    { key: 'wednesday', label: 'רביעי' },
    { key: 'thursday', label: 'חמישי' },
    { key: 'friday', label: 'שישי' },
    { key: 'saturday', label: 'שבת' },
  ],
  DAYS_OF_WEEK_KEYS: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],

  // JS getDay() 0–6 → Hebrew abbrev (for availability/operating hours). Day key = DAYS_OF_WEEK_KEYS[index].
  JS_DAY_TO_HEBREW: ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"],

  // Map Hebrew day abbrev to English key (for normalizing staff operating hours API response). Keep in sync with frontend.
  HEBREW_TO_DAY_KEY: (() => {
    const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const out = {};
    ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"].forEach((h, i) => { out[h] = keys[i]; });
    return out;
  })(),

  /** Normalize day string (Hebrew א', ב' or English sunday, monday) to English key. Use when building API responses. */
  normalizeDayKey(day) {
    if (!day) return null;
    const d = String(day).trim();
    const lower = d.toLowerCase();
    if (this.DAYS_OF_WEEK_KEYS.includes(lower)) return lower;
    return this.HEBREW_TO_DAY_KEY[d] || lower;
  },

  // Recurrence service type values (match frontend – use in recurrenceHelper)
  RECURRENCE_SERVICE_TYPE: {
    REGULAR: 'Regular Appointment',
    EVERY_DAY: 'Every Day',
    EVERY_WEEK: 'Every Week',
    EVERY_2_WEEKS: 'Every 2 Weeks',
    EVERY_3_WEEKS: 'Every 3 Weeks',
    EVERY_MONTH: 'Every Month',
    EVERY_2_MONTHS: 'Every 2 Months',
    PREFIX_EVERY: 'Every '
  },

  // Recurrence duration unit (parsed from duration string – lowercase)
  RECURRENCE_DURATION_UNIT: {
    DAY: 'day',
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year'
  },

  // Recurrence – days per unit (for day-based calculations)
  RECURRENCE_DAYS_PER: {
    WEEK: 7,
    MONTH: 28,
    YEAR: 365
  },

  // Time Options - Generate time options from 00:00 to 23:55 in 5-minute intervals
  TIME_OPTIONS: (() => {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        const hourStr = hour.toString().padStart(2, '0');
        const minuteStr = minute.toString().padStart(2, '0');
        times.push(`${hourStr}:${minuteStr}`);
      }
    }
    return times;
  })(),

  // Client permissions – dropdown key/value options (shared with frontend)
  // Time options: value = minutes (string), used for min advance, max advance, cancel before
  CLIENT_PERMISSIONS_TIME_OPTIONS: [
    { value: '10', label: '10 דקות' },
    { value: '15', label: '15 דקות' },
    { value: '30', label: 'חצי שעה' },
    { value: '60', label: 'שעה' },
    { value: '120', label: 'שעתיים' },
    { value: '180', label: '3 שעות' },
    { value: '300', label: '5 שעות' },
    { value: '480', label: '8 שעות' },
    { value: '600', label: '10 שעות' },
    { value: '1440', label: 'יום' },
    { value: '2880', label: 'יומיים' },
    { value: '4320', label: '3 ימים' },
    { value: '10080', label: 'שבוע' },
    { value: '20160', label: 'שבועיים' },
    { value: '30240', label: '3 שבועות' },
    { value: '43200', label: 'חודש' },
    { value: '86400', label: 'חודשיים' },
  ],

  // Time slot interval: value = slug, label = Hebrew
  CLIENT_PERMISSIONS_TIME_SLOT_INTERVAL_OPTIONS: [
    { value: '15-minutes', label: '15 דקות' },
    { value: '30-minutes', label: '30 דקות' },
    { value: 'half-hour', label: 'חצי שעה' },
    { value: 'hour', label: 'שעה' },
  ],

  // Appointment limit: value = 'unlimited' or count string, label = Hebrew
  CLIENT_PERMISSIONS_APPOINTMENT_LIMIT_OPTIONS: [
    { value: 'unlimited', label: 'ללא הגבלה' },
    { value: '1', label: '1 תור' },
    { value: '2', label: '2 תורים' },
    { value: '3', label: '3 תורים' },
    { value: '5', label: '5 תורים' },
    { value: '10', label: '10 תורים' },
  ],

  // Service calendar color palette – same as frontend (הצבע של השירות ביומן). Stored in DB as hex.
  SERVICE_COLOR_PALETTE: [
    { name: 'קרם', value: '#FDF2DD' },
    { name: 'אפרסק', value: '#FFE6D6' },
    { name: 'קורל', value: '#FFDBCB' },
    { name: 'ורוד בהיר', value: '#FADDD9' },
    { name: 'ורוד', value: '#F5DEE6' },
    { name: 'ורוד-סגול', value: '#F7E8F3' },
    { name: 'סגול בהיר', value: '#F8F7FF' },
    { name: 'סגול', value: '#E4E1FF' },
    { name: 'סגול-כחול', value: '#D0D1FF' },
    { name: 'כחול בהיר', value: '#D6E8FF' },
    { name: 'תכלת', value: '#D0F4F0' },
    { name: 'ירוק בהיר', value: '#D4F4DD' },
    { name: 'צהוב בהיר', value: '#FFF9D0' },
    { name: 'כתום בהיר', value: '#FFE8D0' },
    { name: 'אדום בהיר', value: '#FFE0E0' },
    { name: 'אפור בהיר', value: '#F0F0F0' },
    { name: 'ורוד בוהק', value: '#FF257C' },
    { name: 'כחול', value: '#014773' },
    { name: 'ירוק', value: '#10b981' },
    { name: 'סגול כהה', value: '#8e4e78' },
  ],
  DEFAULT_SERVICE_COLOR: '#FDF2DD', // First palette color (קרם); keep in sync with SERVICE_COLOR_PALETTE[0].value
};
