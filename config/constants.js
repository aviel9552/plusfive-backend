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
    CUSTOMER: 'Customer'
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
  })()
};
