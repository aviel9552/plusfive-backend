const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.apiKey = 'ymWPt3GJehmPFw4cYrckhm6pAK';
    this.baseURL = 'https://waba-v2.360dialog.io';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'D360-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
    this.messageHistory = new Map(); // Store message history to prevent repetition
  }

  // Format phone number
  formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    if (phoneNumber.startsWith('+')) return phoneNumber;
    return phoneNumber.startsWith('91') ? `+${phoneNumber}` : `+91${phoneNumber}`;
  }

  // Check WhatsApp number status
  async checkNumberStatus(phoneNumber) {
    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      // console.log('Checking number status:', formattedNumber);

      const response = await this.client.post('/contacts', {
        blocking: 'wait',
        contacts: [formattedNumber]
      });

      // console.log('Number status response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error checking number status:', error.response?.data || error.message);
      return null;
    }
  }

  // Simple test message
  async testWhatsApp(to) {
    try {
      const formattedNumber = this.formatPhoneNumber(to);
      if (!formattedNumber) {
        throw new Error('Invalid phone number');
      }

      // console.log('=== WhatsApp Test Details ===');
      // console.log('Phone Number:', formattedNumber);
      // console.log('API Key:', this.apiKey);
      // console.log('Base URL:', this.baseURL);

      // Try template message first
      const templatePayload = {
        messaging_product: 'whatsapp',
        to: formattedNumber,
        type: 'template',
        template: {
          name: 'hello_world',
          language: {
            code: 'en'
          }
        }
      };

      // console.log('Template Request Payload:', JSON.stringify(templatePayload, null, 2));

      try {
        const templateResponse = await this.client.post('/messages', templatePayload);
        // console.log('Template Response:', JSON.stringify(templateResponse.data, null, 2));
        return true;
      } catch (templateError) {
        // console.log('Template message failed, trying text message...');
        
        // Fallback to text message
        const textPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedNumber,
          type: 'text',
          text: {
            preview_url: false,
            body: 'Hello! This is a test message from Rebook AI.'
          }
        };

        // console.log('Text Request Payload:', JSON.stringify(textPayload, null, 2));
        const textResponse = await this.client.post('/messages', textPayload);
        // console.log('Text Response:', JSON.stringify(textResponse.data, null, 2));
        return true;
      }
    } catch (error) {
      console.error('=== Error Details ===');
      console.error('Error Message:', error.message);
      if (error.response) {
        console.error('Error Response:', error.response.data);
        console.error('Error Status:', error.response.status);
        console.error('Error Headers:', error.response.headers);
      }
      return false;
    }
  }

  // Send message with rate limiting and history tracking
  async sendMessage(to, message, type) {
    try {
      const formattedNumber = this.formatPhoneNumber(to);
      if (!formattedNumber) {
        throw new Error('Invalid phone number');
      }

      // console.log('=== Sending WhatsApp Message ===');
      // console.log('To:', formattedNumber);
      // console.log('Message:', message);
      // console.log('Type:', type);

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('WhatsApp API Response:', JSON.stringify(response.data, null, 2));

      return true;
    } catch (error) {
      console.error('=== WhatsApp Error Details ===');
      console.error('Error Message:', error.message);
      if (error.response) {
        console.error('Error Response:', error.response.data);
        console.error('Error Status:', error.response.status);
        console.error('Error Headers:', error.response.headers);
      }
      return false;
    }
  }

  // Send template message
  async sendTemplateMessage(to, templateName, languageCode, components) {
    try {
      const response = await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode
          },
          components: components
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error sending WhatsApp template:', error);
      throw error;
    }
  }

  // Send review request
  async sendReviewRequest(customer, businessName) {
    if (!businessName) {
      throw new Error('Business name is required');
    }
    const message = `Hi ${customer.fullName}! How was your experience at ${businessName}? Please rate your visit from 1 to 5 stars. Reply with a number between 1-5.`;
    return this.sendMessage(customer.phoneNumber, message, 'review_request');
  }

  // Send thank you message with review link
  async sendThankYouMessage(customer, businessName, reviewLink) {
    const message = `Thank you for your positive feedback! Would you mind sharing your experience on Google? Here's our review link: ${reviewLink}`;
    return this.sendMessage(customer.phoneNumber, message, 'thank_you');
  }

  // Notify business owner about low rating
  async notifyBusinessOwner(customer, rating, feedback) {
    const message = `⚠️ Low Rating Alert: ${customer.fullName} rated their experience ${rating}/5. Feedback: ${feedback || 'No feedback provided'}`;
    return this.sendMessage(process.env.BUSINESS_OWNER_PHONE, message, 'low_rating_alert');
  }

  // Send re-engagement message to at-risk customers
  async sendReEngagementMessage(customer, businessName, bookingLink, specialOffer) {
    const message = `Hi ${customer.fullName}! We miss you at ${businessName}. Book your next visit now and get ${specialOffer}. Click here to book: ${bookingLink}`;
    return this.sendMessage(customer.phoneNumber, message, 're_engagement');
  }

  // Send lost customer recovery message
  async sendRecoveryMessage(customer, businessName, bookingLink, specialOffer) {
    const message = `Hi ${customer.fullName}! We'd love to have you back at ${businessName}. As a special welcome back offer, you'll get ${specialOffer}. Book now: ${bookingLink}`;
    return this.sendMessage(customer.phoneNumber, message, 'recovery');
  }

  // Get message status
  async getMessageStatus(messageId) {
    try {
      const response = await this.client.get(`/messages/${messageId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting message status:', error);
      throw error;
    }
  }
}

module.exports = WhatsAppService;
