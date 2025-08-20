const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.apiKey = process.env.WHATSAPP_API_KEY;
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

  // Send At Risk message (Hebrew - Initial)
  async sendAtRiskMessageHebrew(customerName, phoneNumber) {
    try {
      const message = `היי ${customerName} מה קורה?`;
     
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('At Risk Hebrew Initial Message Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending at risk Hebrew message:', error);
      throw error;
    }
  }

  // Send At Risk follow-up message (Hebrew)
  async sendAtRiskFollowUpHebrew(phoneNumber) {
    try {
      const message = `לא ראינו אותך מלא זמן ואני רואה שלא קבעת תור עדיין, מוכן לרענון?`;
     
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('At Risk Hebrew Follow-up Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending at risk follow-up Hebrew message:', error);
      throw error;
    }
  }

  // Send response for "YES" answer (Hebrew)
  async sendAtRiskYesResponseHebrew(phoneNumber) {
    try {
      const message = `אוקי אני אדאג שיחזרו אלייך במיידי`;
     
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('At Risk YES Response Hebrew:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending at risk YES response Hebrew:', error);
      throw error;
    }
  }

  // Send response for "NO" answer (Hebrew)
  async sendAtRiskNoResponseHebrew(phoneNumber) {
    try {
      const message = `מה הסיבה?`;
     
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('At Risk NO Response Hebrew:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending at risk NO response Hebrew:', error);
      throw error;
    }
  }

  // Send final closure message (Hebrew)
  async sendAtRiskClosureHebrew(phoneNumber) {
    try {
      const message = `אוקיי.. אם צריך עוד משהו אני כאן 😉`;
     
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('At Risk Closure Hebrew:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending at risk closure Hebrew:', error);
      throw error;
    }
  }


  
  // Send Lost message (without template)
  async sendLostMessage(customerName, phoneNumber) {
    try {
      const message = `Hi ${customerName}, we miss you! It's been a while since your last visit. We have special offers waiting for you. Come back and let us serve you again!`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('Lost Customer Message Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending lost customer message:', error);
      throw error;
    }
  }

  // Send Recovered notification to business owner (without template)
  async sendRecoveredNotification(businessName, lastStatus, customerName, customerPhone, futureAppointment, businessOwnerPhone) {
    try {
      const message = `🎉 Great news for ${businessName}!\n\nA customer who was "${lastStatus}" has returned!\n\nCustomer Details:\n• Name: ${customerName}\n• Phone: ${customerPhone}\n• Status Changed: ${lastStatus} → Active\n• Future Appointment: ${futureAppointment}\n\nWell done on recovering this customer! 👏`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: businessOwnerPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('Recovered Customer Notification Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending recovered customer notification:', error);
      throw error;
    }
  }



  // Send custom rating request - NEW CUSTOMER (first purchase)
  async sendNewCustomerRatingRequest(customerName, businessName, phoneNumber) {
    try {
      const message = `Hi ${customerName}, this is Edi from ${businessName}.\nI'd love to know how was your experience between 1-5?`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('New Customer Rating Request Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending new customer rating request:', error);
      throw error;
    }
  }

  // Send custom rating request - REGULAR CUSTOMER (repeat purchase)
  async sendRegularCustomerRatingRequest(customerName, phoneNumber, variant = 1) {
    try {
      let message;
      
      if (variant === 1) {
        message = `Hi ${customerName}, what's up?\nSo how was your experience this time between 1-5?`;
      } else {
        message = `Hi ${customerName}, what's up?\nI'd love to know how was your experience between 1-5?`;
      }
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('Regular Customer Rating Request Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending regular customer rating request:', error);
      throw error;
    }
  }

  // Send thank you message for LOW rating (1-3 stars) to CUSTOMER
  async sendLowRatingThankYou(phoneNumber) {
    try {
      const message = `Thank you for the review, thanks to customers like you we have the opportunity to improve our service and experience and always strive to raise the level.`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('Low Rating Thank You Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending low rating thank you:', error);
      throw error;
    }
  }

  // Send alert to BUSINESS OWNER for LOW rating (1-3 stars)
  async sendLowRatingAlertToBusiness(businessName, customerName, customerPhone, customerService, lastPayment, rating, businessOwnerPhone) {
    try {
      const message = `Hi ${businessName}, this is Edi from Plusfive.\nWe received an alert about a customer who gave a below-average rating and I recommend you contact them and offer them a corrective experience 🤍\n\nCustomer name: ${customerName}\nMobile number: ${customerPhone}\nService: ${customerService}\nPayment: ${lastPayment}\nRating: ${rating}`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: businessOwnerPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('Low Rating Business Alert Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending low rating business alert:', error);
      throw error;
    }
  }

  // Send thank you message for HIGH rating (4-5 stars) to CUSTOMER
  async sendHighRatingThankYou(phoneNumber) {
    try {
      const message = `Thank you for your cooperation 😉`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await this.client.post('/messages', payload);
      console.log('High Rating Thank You Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error sending high rating thank you:', error);
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
