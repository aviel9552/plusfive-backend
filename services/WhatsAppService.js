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
          preview_url: true,
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
      const formattedNumber = this.formatPhoneNumber(to);
      if (!formattedNumber) {
        throw new Error('Invalid phone number');
      }

      console.log('=== Sending WhatsApp Template ===');
      console.log('To:', formattedNumber);
      console.log('Template:', templateName);
      console.log('Language:', languageCode);
      console.log('Components:', JSON.stringify(components, null, 2));

      const response = await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode
          },
          components: components
        }
      });

      console.log('Template Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending WhatsApp template:', error.response?.data || error.message);
      throw error;
    }
  }





  // Send review request using test_link_eng_temp1 template with button (360dialog)
  async sendEngTemplateReview(customerName, phoneNumber, reviewLink) {
    try {
      // reviewLink is already just query parameters, no need to extract
      const urlParams = reviewLink;
      
      const components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: urlParams } // Pass the query parameters as {{2}}
          ]
        }
      ];

      return await this.sendTemplateMessage(phoneNumber, 'test_link_eng_temp1', 'en', components);
    } catch (error) {
      console.error('Error sending test_link_eng_temp1 template:', error);
      throw error;
    }
  }

  // Send At Risk message using at_risk_eng_temp template (360dialog)
  async sendAtRiskTemplate(customerName, phoneNumber) {
    try {
      const components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName }
          ]
        }
      ];

      return await this.sendTemplateMessage(phoneNumber, 'at_risk_eng_temp', 'en', components);
    } catch (error) {
      console.error('Error sending at_risk_eng_temp template:', error);
      throw error;
    }
  }

  // Send Lost message using lost_eng_temp template (360dialog)
  async sendLostTemplate(customerName, phoneNumber) {
    try {
      const components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName }
          ]
        }
      ];

      return await this.sendTemplateMessage(phoneNumber, 'lost_eng_temp', 'en', components);
    } catch (error) {
      console.error('Error sending lost_eng_temp template:', error);
      throw error;
    }
  }

  // Send Recovered notification to business owner using recovered_eng_temp template (360dialog)
  async sendRecoveredTemplate(businessName, lastStatus, customerName, customerPhone, futureAppointment, businessOwnerPhone) {
    try {
      const components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: businessName },        // {{1}} Business name
            { type: 'text', text: lastStatus },          // {{2}} Last status (at_risk/lost)
            { type: 'text', text: customerName },        // {{3}} Customer name
            { type: 'text', text: customerPhone },       // {{4}} Customer phone
            { type: 'text', text: futureAppointment }    // {{5}} Future appointment
          ]
        }
      ];

      return await this.sendTemplateMessage(businessOwnerPhone, 'recovered_eng_temp', 'en', components);
    } catch (error) {
      console.error('Error sending recovered_eng_temp template:', error);
      throw error;
    }
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
