const axios = require('axios');

class WhatsAppService {
  constructor() {
    // Facebook/Meta WhatsApp Business API only
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.baseURL = `https://graph.facebook.com/v19.0/${this.phoneNumberId}`;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
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

      const response = await this.client.post('/contacts', {
        blocking: 'wait',
        contacts: [formattedNumber]
      });

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

      try {
        const templateResponse = await this.client.post('/messages', templatePayload);
        return true;
      } catch (templateError) {
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

        const textResponse = await this.client.post('/messages', textPayload);
        return true;
      }
    } catch (error) {
      console.error('WhatsApp test error:', error.message);
      if (error.response) {
        console.error('Error Response:', error.response.data);
        console.error('Error Status:', error.response.status);
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

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'text',
        text: {
          preview_url: true,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      return true;
    } catch (error) {
      console.error('WhatsApp send message error:', error.message);
      if (error.response) {
        console.error('Error Response:', error.response.data);
        console.error('Error Status:', error.response.status);
      }
      return false;
    }
  }

  // Note: All template and message sending functions removed - now handled by N8N only
  // Kept only testWhatsApp and sendMessage for debugging purposes
}

module.exports = WhatsAppService;
