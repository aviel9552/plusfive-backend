const axios = require('axios');
const { createWhatsappMessageRecord } = require('../../controllers/whatsappMessageController');
const { stripe } = require('../../lib/stripe');

// Global conversation states (shared across all instances)
const globalReviewConversationStates = new Map();

class ReviewService {
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
    
    // Use database for persistent storage + memory for speed
    this.conversationStates = globalReviewConversationStates;
    const { PrismaClient } = require('@prisma/client');
    this.prisma = new PrismaClient();
  }

  // Helper function to send WhatsApp message
  async sendMessage(phoneNumber, message) {
    try {
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
      console.error('Error sending review service message:', error);
      throw error;
    }
  }

  // Helper function to send rating buttons
  async sendRatingButtons(phoneNumber, message) {
    try {
      
      // Send first message with ratings 1-3
      const payload1 = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: message
          },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: {
                  id: 'rating_1',
                  title: '⭐ 1'
                }
              },
              {
                type: 'reply',
                reply: {
                  id: 'rating_2',
                  title: '⭐⭐ 2'
                }
              },
              {
                type: 'reply',
                reply: {
                  id: 'rating_3',
                  title: '⭐⭐⭐ 3'
                }
              }
            ]
          }
        }
      };

      const response1 = await this.client.post('/messages', payload1);
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send second message with ratings 4-5
      const payload2 = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: 'או בחר כאן:'
          },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: {
                  id: 'rating_4',
                  title: '⭐⭐⭐⭐ 4'
                }
              },
              {
                type: 'reply',
                reply: {
                  id: 'rating_5',
                  title: '⭐⭐⭐⭐⭐ 5'
                }
              }
            ]
          }
        }
      };

      const response2 = await this.client.post('/messages', payload2);
      
      // Report usage to Stripe immediately after sending WhatsApp message
      await this.reportUsageToStripe(phoneNumber);

      return {
        message1: response1.data,
        message2: response2.data
      };
    } catch (error) {
      console.error('❌ ReviewService - Error sending rating buttons:', error.message);
      throw error;
    }
  }

  // Report usage to Stripe for metered billing
  async reportUsageToStripe(phoneNumber) {
    try {
      // Find customer by phone number
      const customer = await this.prisma.customers.findFirst({
        where: { customerPhone: phoneNumber },
        include: { user: true }
      });

      if (!customer || !customer.user) {
        console.log(`No customer found for phone: ${phoneNumber}`);
        return;
      }

      const user = customer.user;

      // Check if user has active Stripe subscription
      if (!user.stripeSubscriptionId) {
        console.log(`No Stripe subscription found for user: ${user.email}`);
        return;
      }

      // Get subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      
      // Find the metered subscription item (WhatsApp messages)
      const meteredItem = subscription.items.data.find(item => 
        item.price?.recurring?.usage_type === 'metered'
      );

      if (!meteredItem) {
        console.log(`No metered subscription item found for user: ${user.email}`);
        return;
      }

      // Report 1 usage to Stripe
      await stripe.subscriptionItems.createUsageRecord(
        meteredItem.id,
        {
          quantity: 1,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment' // Add 1 to existing usage
        }
      );

      console.log(`✅ Reported 1 WhatsApp message usage to Stripe for user ${user.email}`);

    } catch (error) {
      console.error('❌ Error reporting usage to Stripe:', error.message);
      // Don't throw error - WhatsApp message was sent successfully
    }
  }

  // Send new customer rating request
  async sendNewCustomerRatingRequest(customerName, businessName, phoneNumber) {
    try {
      const message = `היי ${customerName}, זו עדי מ${businessName}\nאשמח לדעת איך הייתה החוויה שלך בין 1-5?`;
      
      // Set conversation state in both memory and database
      const stateData = {
        step: 'rating_request_sent',
        customerName,
        businessName,
        startTime: new Date(),
        lastMessage: message,
        status: 'at_review',
        conversationType: 'review_collection',
        customerType: 'new'
      };
      
      // Clear any existing conversation states for this customer (risk/lost)
      await this.clearOtherConversationStates(phoneNumber);
      
      // Save to memory for speed
      this.conversationStates.set(phoneNumber, stateData);
      
      // Save to database for persistence
      await this.saveConversationToDatabase(phoneNumber, stateData);
      
      // Create whatsappMessage record for usage tracking
      await createWhatsappMessageRecord(customerName, phoneNumber, 'review_new_customer');
      
      const result = await this.sendRatingButtons(phoneNumber, message);
      
      return {
        step: 1,
        type: 'new_customer_rating_request',
        message,
        customerName,
        businessName,
        phoneNumber,
        customerType: 'new',
        nextAction: 'webhook_will_handle_rating_responses',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('❌ ReviewService - Error sending new customer rating request:', error.message);
      throw error;
    }
  }

  // Send regular customer rating request (option 1)
  async sendRegularCustomerRatingRequest1(customerName, businessName, phoneNumber) {
    try {
      const message = `היי ${customerName} מה קורה?\nנו אז איך הייתה החוויה שלך הפעם בין 1-5?`;
      
      // Set conversation state in both memory and database
      const stateData = {
        step: 'rating_request_sent',
        customerName,
        businessName,
        startTime: new Date(),
        lastMessage: message,
        status: 'at_review',
        conversationType: 'review_collection',
        customerType: 'regular'
      };
      
      // Clear any existing conversation states for this customer (risk/lost)
      await this.clearOtherConversationStates(phoneNumber);
      
      // Save to memory for speed
      this.conversationStates.set(phoneNumber, stateData);
      
      // Save to database for persistence
      await this.saveConversationToDatabase(phoneNumber, stateData);
      
      // Create whatsappMessage record for usage tracking
      await createWhatsappMessageRecord(customerName, phoneNumber, 'review_regular_customer_v1');
      
      const result = await this.sendRatingButtons(phoneNumber, message);
      
      return {
        step: 1,
        type: 'regular_customer_rating_request_v1',
        message,
        customerName,
        businessName,
        phoneNumber,
        customerType: 'regular',
        nextAction: 'webhook_will_handle_rating_responses',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending regular customer rating request v1:', error);
      throw error;
    }
  }

  // Send regular customer rating request (option 2)
  async sendRegularCustomerRatingRequest2(customerName, businessName, phoneNumber) {
    try {
      const message = `היי ${customerName} מה קורה?\nאשמח לדעת איך הייתה החוויה בין 1-5?`;
      
      // Set conversation state in both memory and database
      const stateData = {
        step: 'rating_request_sent',
        customerName,
        businessName,
        startTime: new Date(),
        lastMessage: message,
        status: 'at_review',
        conversationType: 'review_collection',
        customerType: 'regular'
      };
      
      // Clear any existing conversation states for this customer (risk/lost)
      await this.clearOtherConversationStates(phoneNumber);
      
      // Save to memory for speed
      this.conversationStates.set(phoneNumber, stateData);
      
      // Save to database for persistence
      await this.saveConversationToDatabase(phoneNumber, stateData);
      
      // Create whatsappMessage record for usage tracking
      await createWhatsappMessageRecord(customerName, phoneNumber, 'review_regular_customer_v2');
      
      const result = await this.sendRatingButtons(phoneNumber, message);
      
      return {
        step: 1,
        type: 'regular_customer_rating_request_v2',
        message,
        customerName,
        businessName,
        phoneNumber,
        customerType: 'regular',
        nextAction: 'webhook_will_handle_rating_responses',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending regular customer rating request v2:', error);
      throw error;
    }
  }

  // Send thank you message for high rating (4-5 stars)
  async sendHighRatingThankYou(phoneNumber) {
    try {
      const message = `תודה על השיתוף פעולה 😉`;
      
      // Update conversation state in memory
      const state = this.conversationStates.get(phoneNumber);
      if (state) {
        state.step = 'thank_you_sent';
        state.lastMessage = message;
        state.responseTime = new Date();
        state.conversationEnded = true;
        
        // Save to database
        await this.saveConversationToDatabase(phoneNumber, state);
      }
      
      // Create whatsappMessage record for usage tracking
      if (state?.customerName) {
        await createWhatsappMessageRecord(state.customerName, phoneNumber, 'review_high_rating_thankyou');
      }
      
      const result = await this.sendMessage(phoneNumber, message);
      
      return {
        step: 2,
        type: 'high_rating_thank_you',
        message,
        phoneNumber,
        nextAction: 'conversation_completed',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending high rating thank you:', error);
      throw error;
    }
  }

  // Send thank you message for low rating (1-3 stars) to customer
  async sendLowRatingThankYou(phoneNumber) {
    try {
      const message = `תודה על הביקורת, בזכות לקוחות כמוך יש לנו את האפשרות לשפר את השירות והחוייה ולשאוף תמיד לעלות ברמה.`;
      
      // Update conversation state in memory
      const state = this.conversationStates.get(phoneNumber);
      if (state) {
        state.step = 'low_rating_thank_you_sent';
        state.lastMessage = message;
        state.responseTime = new Date();
        state.conversationEnded = true;
        
        // Save to database
        await this.saveConversationToDatabase(phoneNumber, state);
      }
      
      // Create whatsappMessage record for usage tracking
      if (state?.customerName) {
        await createWhatsappMessageRecord(state.customerName, phoneNumber, 'review_low_rating_thankyou');
      }
      
      const result = await this.sendMessage(phoneNumber, message);
      
      return {
        step: 2,
        type: 'low_rating_thank_you',
        message,
        phoneNumber,
        nextAction: 'conversation_completed_will_alert_business',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending low rating thank you:', error);
      throw error;
    }
  }

  // Send alert to business owner for low rating (1-3 stars)
  async sendBusinessOwnerAlert(businessOwnerPhone, businessName, customerName, customerPhone, serviceDetails, lastPayment, rating) {
    try {
      const message = `היי ${businessName} זו עדי מ-Plusfive\nקיבלנו התראה על לקוח שנתן דירוג נמוך מהממוצע ואני ממליצה לך ליצור איתו קשר ולהציע לו חוויה מתקנת 🤍\n\nשם לקוח: ${customerName}\nמספר נייד: ${customerPhone}\nשירות: ${serviceDetails}\nתשלום: ${lastPayment}\nדירוג: ${rating}`;
      
      // Create whatsappMessage record for usage tracking
      await createWhatsappMessageRecord(businessName, businessOwnerPhone, 'review_business_alert');
      
      const result = await this.sendMessage(businessOwnerPhone, message);
      
      return {
        type: 'business_owner_alert',
        message,
        businessName,
        businessOwnerPhone,
        customerDetails: {
          name: customerName,
          phone: customerPhone,
          service: serviceDetails,
          payment: lastPayment,
          rating: rating
        },
        nextAction: 'business_owner_notified',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending business owner alert:', error);
      throw error;
    }
  }

  // Helper function to detect rating (1-5)
  extractRating(messageContent) {
    const text = messageContent.trim();
    
    // Check for button responses first (rating_1, rating_2, etc.)
    const buttonRating = text.match(/rating_([1-5])/);
    if (buttonRating) {
      return parseInt(buttonRating[1]);
    }
    
    // Check for direct numbers 1-5
    const directRating = text.match(/[1-5]/);
    if (directRating) {
      const rating = parseInt(directRating[0]);
      if (rating >= 1 && rating <= 5) {
        return rating;
      }
    }
    
    // Check for star patterns
    const starCount = (text.match(/⭐/g) || []).length;
    if (starCount >= 1 && starCount <= 5) {
      return starCount;
    }
    
    // Check for written numbers in English
    const writtenNumbers = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5
    };
    
    for (const [word, num] of Object.entries(writtenNumbers)) {
      if (text.includes(word)) {
        return num;
      }
    }
    
    // Check for Hebrew written numbers
    const hebrewNumbers = {
      'אחד': 1, 'שתיים': 2, 'שלוש': 3, 'ארבע': 4, 'חמש': 5,
      'אחת': 1, 'שני': 2, 'שלושה': 3, 'ארבעה': 4, 'חמישה': 5
    };
    
    for (const [word, num] of Object.entries(hebrewNumbers)) {
      if (text.includes(word)) {
        return num;
      }
    }
    
    return null; // No valid rating found
  }

  // Main conversation handler - processes incoming messages for rating collection
  async handleIncomingMessage(phoneNumber, messageContent, customerName = null, businessName = null, serviceDetails = null, lastPayment = null, businessOwnerPhone = null) {
    try {
      const state = await this.getConversationState(phoneNumber);
      
      // If no conversation state exists, this might be a general response
      if (!state) {
        return { 
          action: 'no_active_conversation',
          suggestion: 'Start new review conversation or handle as general message'
        };
      }
      
      const rating = this.extractRating(messageContent);
      
      // Handle based on current conversation step
      switch (state.step) {
        case 'rating_request_sent':
          if (rating !== null) {
            // Save rating to state
            state.rating = rating;
            state.ratingReceivedTime = new Date();
            
            if (rating >= 4) {
              // High rating (4-5 stars) - send thank you
              const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
              return await this.sendHighRatingThankYou(statePhoneNumber || phoneNumber);
              
            } else {
              // Low rating (1-3 stars) - send thank you and alert business owner
              const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
              
              // Send thank you to customer first
              const thankYouResult = await this.sendLowRatingThankYou(statePhoneNumber || phoneNumber);
              
              // Then alert business owner if details are provided
              if (businessOwnerPhone && businessName && customerName) {
                try {
                  await this.sendBusinessOwnerAlert(
                    businessOwnerPhone,
                    businessName,
                    customerName,
                    phoneNumber,
                    serviceDetails || 'Service details not provided',
                    lastPayment || 'Payment amount not provided',
                    rating
                  );
                } catch (alertError) {
                  console.error(`❌ [REVIEW] Failed to send business owner alert:`, alertError);
                }
              }
              
              return thankYouResult;
            }
          } else {
            return {
              action: 'invalid_rating',
              message: 'Please provide a rating between 1-5',
              suggestion: 'Ask customer to provide a valid rating'
            };
          }
          
        case 'thank_you_sent':
        case 'low_rating_thank_you_sent':
          // Conversation already ended
          return {
            action: 'conversation_already_completed',
            message: 'This review conversation has already been completed'
          };
          
        default:
          return {
            action: 'unknown_step',
            message: 'Unknown review conversation step'
          };
      }
      
    } catch (error) {
      console.error('Error handling review conversation incoming message:', error);
      throw error;
    }
  }

  // Helper function to find the exact phone number format used in state
  findStatePhoneNumber(phoneNumber) {
    // Try exact match first
    if (this.conversationStates.has(phoneNumber)) return phoneNumber;
    
    // Try with + prefix
    const phoneWithPlus = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    if (this.conversationStates.has(phoneWithPlus)) return phoneWithPlus;
    
    // Try without + prefix
    const phoneWithoutPlus = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
    if (this.conversationStates.has(phoneWithoutPlus)) return phoneWithoutPlus;
    
    return null;
  }

  // Clear other conversation states (risk/lost) when starting a review conversation
  async clearOtherConversationStates(phoneNumber) {
    try {
      // Update existing conversations to mark them as ended instead of deleting
      const updateResult = await this.prisma.conversationState.updateMany({
        where: {
          OR: [
            { phoneNumber: phoneNumber },
            { phoneNumber: `+${phoneNumber.replace('+', '')}` }
          ],
          status: {
            in: ['at_risk', 'at_lost']
          },
          conversationEnded: false
        },
        data: {
          conversationEnded: true,
          closureTime: new Date(),
          customerResponse: 'review_conversation_started'
        }
      });
    } catch (error) {
      console.error('❌ Error clearing other conversation states:', error);
    }
  }

  // Save conversation to database (use same ConversationState table but with different source)
  async saveConversationToDatabase(phoneNumber, stateData) {
    try {
      await this.prisma.conversationState.upsert({
        where: { phoneNumber },
        update: {
          step: stateData.step,
          customerName: stateData.customerName,
          lastMessage: stateData.lastMessage,
          customerResponse: stateData.rating ? stateData.rating.toString() : null,
          status: stateData.status || 'at_review',
          conversationEnded: stateData.conversationEnded || false,
          followupTime: stateData.followupTime || null,
          responseTime: stateData.responseTime || stateData.ratingReceivedTime || null,
          closureTime: stateData.closureTime || null
        },
        create: {
          phoneNumber,
          customerName: stateData.customerName,
          step: stateData.step,
          lastMessage: stateData.lastMessage,
          customerResponse: stateData.rating ? stateData.rating.toString() : null,
          status: stateData.status || 'at_review',
          conversationEnded: stateData.conversationEnded || false,
          startTime: stateData.startTime || new Date(),
          followupTime: stateData.followupTime || null,
          responseTime: stateData.responseTime || stateData.ratingReceivedTime || null,
          closureTime: stateData.closureTime || null
        }
      });
    } catch (error) {
      console.error('Error saving review conversation to database:', error);
    }
  }

  // Load conversation from database
  async loadConversationFromDatabase(phoneNumber) {
    try {
      const conversation = await this.prisma.conversationState.findUnique({
        where: { phoneNumber }
      });

      if (conversation && !conversation.conversationEnded && conversation.status === 'at_review') {
        // Convert database format to memory format
        const stateData = {
          step: conversation.step,
          customerName: conversation.customerName,
          startTime: conversation.startTime,
          lastMessage: conversation.lastMessage,
          rating: conversation.customerResponse ? parseInt(conversation.customerResponse) : null,
          status: conversation.status,
          conversationEnded: conversation.conversationEnded,
          followupTime: conversation.followupTime,
          responseTime: conversation.responseTime,
          ratingReceivedTime: conversation.responseTime,
          closureTime: conversation.closureTime,
          conversationType: 'review_collection'
        };

        // Load into memory
        this.conversationStates.set(phoneNumber, stateData);
        return stateData;
      } else if (conversation && conversation.conversationEnded) {
        return null;
      }
      return null;
    } catch (error) {
      console.error('Error loading review conversation from database:', error);
      return null;
    }
  }

  // Get conversation state for debugging (try both with and without +)
  async getConversationState(phoneNumber) {
    // Try exact match first in memory
    let state = this.conversationStates.get(phoneNumber);
    if (state) {
      if (state.conversationEnded) {
        return null;
      }
      return state;
    }

    // Try with + prefix in memory
    const phoneWithPlus = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    state = this.conversationStates.get(phoneWithPlus);
    if (state) {
      if (state.conversationEnded) {
        return null;
      }
      return state;
    }

    // Try without + prefix in memory
    const phoneWithoutPlus = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
    state = this.conversationStates.get(phoneWithoutPlus);
    if (state) {
      if (state.conversationEnded) {
        return null;
      }
      return state;
    }
    
    // If not in memory, try loading from database
    
    // Try all phone number formats in database
    const phoneFormats = [phoneNumber, phoneWithPlus, phoneWithoutPlus];
    for (const phone of phoneFormats) {
      const dbState = await this.loadConversationFromDatabase(phone);
      if (dbState) {
        return dbState;
      }
    }
    
    return null;
  }

  // Get all active review conversations
  getAllActiveConversations() {
    const activeConversations = [];
    for (const [phoneNumber, state] of this.conversationStates.entries()) {
      if (!state.conversationEnded) {
        activeConversations.push({
          phoneNumber,
          ...state
        });
      }
    }
    return activeConversations;
  }

  // Clear conversation state (for testing/cleanup)
  clearConversationState(phoneNumber) {
    return this.conversationStates.delete(phoneNumber);
  }

  // Clear all conversation states
  clearAllConversationStates() {
    this.conversationStates.clear();
    return { message: 'All review conversation states cleared' };
  }
}

module.exports = ReviewService;
