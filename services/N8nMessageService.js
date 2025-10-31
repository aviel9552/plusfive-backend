const axios = require('axios');

class N8nMessageService {
  constructor() {
    this.webhookUrl = 'https://n8n.plusfive.io/webhook/msg-in';
    this.client = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send webhook to n8n for WhatsApp message triggers
   * @param {Object} data - The webhook payload data
   */
  async sendWebhookTrigger(data) {
    try {
      const response = await this.client.post(this.webhookUrl, data);
      return {
        success: true,
        status: response.status,
        data: response.data
      };
    } catch (error) {
      console.error('❌ N8n Service - Error sending webhook:', error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        fullError: error
      };
    }
  }

  /**
   * Trigger at-risk customer message
   * @param {Object} params - Customer and business details
   */
  async triggerAtRiskMessage(params) {
    // Directly use webhook field names to avoid confusion
    const webhookData = {
      action: 'client',
      customer_name: params.customer_name,
      customer_phone: params.customer_phone,
      customer_status: 'at_risk',
      business_name: params.business_name,
      business_type: params.business_type || 'general',
      customer_service: params.customer_service || '',
      business_owner_phone: params.business_owner_phone,
      last_visit_date: params.last_visit_date,
      whatsapp_phone: params.whatsapp_phone || params.customer_phone
    };

    return await this.sendWebhookTrigger(webhookData);
  }

  /**
   * Trigger lost customer message
   * @param {Object} params - Customer and business details
   */
  async triggerLostMessage(params) {
    // Directly use webhook field names to avoid confusion
    const webhookData = {
      action: 'client',
      customer_name: params.customer_name,
      customer_phone: params.customer_phone,
      customer_status: 'lost',
      business_name: params.business_name,
      business_type: params.business_type || 'general',
      customer_service: params.customer_service || '',
      business_owner_phone: params.business_owner_phone,
      last_visit_date: params.last_visit_date,
      whatsapp_phone: params.whatsapp_phone || params.customer_phone
    };

    return await this.sendWebhookTrigger(webhookData);
  }

  /**
   * Trigger review request after customer payment
   * @param {Object} params - Customer and business details
   */
  async triggerReviewRequest(params) {
    // Directly use webhook field names to avoid confusion
    const webhookData = {
      action: 'client',
      customer_name: params.customer_name,
      customer_phone: params.customer_phone,
      customer_status: params.customer_status || 'active',
      business_name: params.business_name,
      business_type: params.business_type || 'general',
      customer_service: params.customer_service || '',
      business_owner_phone: params.business_owner_phone,
      last_visit_date: params.last_visit_date,
      whatsapp_phone: params.whatsapp_phone || params.customer_phone,
      trigger_type: 'review_request',
      review_id: params.review_id || null, // ✅ Include review_id in webhook
      payment_webhook_id: params.payment_webhook_id || null // ✅ Include payment_webhook_id in webhook
    };

    return await this.sendWebhookTrigger(webhookData);
  }

  /**
   * Trigger bad review notification to business owner
   * NOTE: This is typically called FROM n8n when it receives a bad rating via WhatsApp,
   * not TO n8n from the backend. Ratings come through WhatsApp messages first.
   * @param {Object} params - Customer and business details
   */
  async triggerBadReviewAlert(params) {
    const {
      customerName,
      customerPhone,
      businessName,
      businessType = 'general',
      customerService,
      businessOwnerPhone,
      lastVisitDate,
      whatsappPhone,
      rating,
      lastPayment
    } = params;

    const webhookData = {
      action: 'owner', // notification to business owner
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_status: 'active',
      business_name: businessName,
      business_type: businessType,
      customer_service: customerService || '',
      business_owner_phone: businessOwnerPhone,
      last_visit_date: lastVisitDate,
      whatsapp_phone: whatsappPhone || customerPhone,
      trigger_type: 'bad_review_alert',
      rating: rating,
      last_payment: lastPayment
    };

    return await this.sendWebhookTrigger(webhookData);
  }

  /**
   * Trigger recovered customer notification to business owner
   * @param {Object} params - Customer and business details
   */
  async triggerRecoveredCustomerNotification(params) {
    const {
      customerName,
      customerPhone,
      businessName,
      businessType = 'general',
      customerService,
      businessOwnerPhone,
      lastVisitDate,
      whatsappPhone,
      futureAppointment,
      previousStatus = 'at_risk'
    } = params;

    const webhookData = {
      action: 'owner', // notification to business owner
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_status: 'recovered',
      business_name: businessName,
      business_type: businessType,
      customer_service: customerService || '',
      business_owner_phone: businessOwnerPhone,
      last_visit_date: lastVisitDate,
      whatsapp_phone: whatsappPhone || customerPhone,
      trigger_type: 'recovered_customer',
      future_appointment: futureAppointment,
      previous_status: previousStatus
    };

    return await this.sendWebhookTrigger(webhookData);
  }

  /**
   * Trigger new customer welcome message
   * @param {Object} params - Customer and business details
   */
  async triggerNewCustomerWelcome(params) {
    const {
      customerName,
      customerPhone,
      businessName,
      businessType = 'general',
      customerService,
      businessOwnerPhone,
      lastVisitDate,
      whatsappPhone
    } = params;

    const webhookData = {
      action: 'client',
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_status: 'new',
      business_name: businessName,
      business_type: businessType,
      customer_service: customerService || '',
      business_owner_phone: businessOwnerPhone,
      last_visit_date: lastVisitDate,
      whatsapp_phone: whatsappPhone || customerPhone,
      trigger_type: 'new_customer_welcome'
    };

    return await this.sendWebhookTrigger(webhookData);
  }

  /**
   * Generic trigger method for custom scenarios
   * @param {Object} webhookData - Complete webhook payload
   */
  async triggerCustomMessage(webhookData) {
    return await this.sendWebhookTrigger(webhookData);
  }
}

module.exports = N8nMessageService;
