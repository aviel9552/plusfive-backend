const axios = require('axios');
const { createWhatsappMessageRecord } = require('../controllers/whatsappMessageController');

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

  // Send template message
  async sendTemplateMessage(to, templateName, languageCode, components) {
    try {
      const formattedNumber = this.formatPhoneNumber(to);
      if (!formattedNumber) {
        throw new Error('Invalid phone number');
      }

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
      return response.data;
    } catch (error) {
      console.error('Error sending recovered customer notification:', error);
      throw error;
    }
  }

  // Send recovered customer notification to business owner using direct text message
  async sendRecoveredCustomerTemplate(businessName, customerName, customerPhone, futureAppointment, customerService, businessOwnerPhone) {
    try {
      const message = `היי ${businessName} זו עדי מ-Plusfive\nעשינו את זה שוב, החזרנו לקוח שהיה בסיכון 🤍\n\nשם לקוח: ${customerName}\nמספר נייד: ${customerPhone}\nתור עתידי: ${futureAppointment}\nשירות: ${customerService}`;
      
      // Create whatsappMessage record for usage tracking
      await createWhatsappMessageRecord(businessName, businessOwnerPhone, 'recovered_customer_notification');
      
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
