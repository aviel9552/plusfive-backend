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
  }
};
