const axios = require('axios');

// Global conversation states (shared across all instances)
const globalLostConversationStates = new Map();

class LostService {
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
    this.conversationStates = globalLostConversationStates;
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
      console.error('Error sending lost service message:', error);
      throw error;
    }
  }

  // Step 1: Send initial Hebrew lost customer greeting (ONLY API CALL)
  async sendInitialGreeting(customerName, phoneNumber) {
    try {
      const message = `היי ${customerName} מה קורה?`;
      
      // Set conversation state in both memory and database
      const stateData = {
        step: 'initial_sent',
        customerName,
        startTime: new Date(),
        lastMessage: message,
        status: 'at_lost'
      };
      
      // Save to memory for speed
      this.conversationStates.set(phoneNumber, stateData);
      
      // Save to database for persistence
      await this.saveConversationToDatabase(phoneNumber, stateData);
      
      const result = await this.sendMessage(phoneNumber, message);
      
      return {
        step: 1,
        type: 'lost_initial_greeting',
        message,
        customerName,
        phoneNumber,
        nextAction: 'webhook_will_handle_responses_automatically',
        note: 'Only initial message sent via API. Customer responses will trigger webhook flow.',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending lost initial greeting:', error);
      throw error;
    }
  }

  // Step 2: Send follow-up message (after customer responds to greeting)
  async sendFollowUpMessage(phoneNumber) {
    try {
      const message = `לא ראינו אותך מלא זמן ואני רואה שלא קבעת תור עדיין, מוכן לרענון?`;
      
      // Find the exact phone number format used in state
      const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
      const actualPhoneNumber = statePhoneNumber || phoneNumber;
      
      // Update conversation state in memory and database
      const currentState = this.conversationStates.get(actualPhoneNumber);
      
      if (currentState) {
        currentState.step = 'followup_sent';
        currentState.lastMessage = message;
        currentState.followupTime = new Date();
        
        // Save to database
        await this.saveConversationToDatabase(actualPhoneNumber, currentState);
      }
      
      const result = await this.sendMessage(phoneNumber, message);
      
      return {
        step: 2,
        type: 'lost_followup_message',
        message,
        phoneNumber,
        nextAction: 'waiting_for_yes_no_response',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending lost follow-up message:', error);
      throw error;
    }
  }

  // Step 3a: Send YES response (customer wants refresh/appointment)
  async sendYesResponse(phoneNumber) {
    try {
      const message = `אוקי אני אדאג שיחזרו אלייך במיידי`;
      
      // Find the exact phone number format used in state
      const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
      const actualPhoneNumber = statePhoneNumber || phoneNumber;
      
      // Update conversation state in memory
      const state = this.conversationStates.get(actualPhoneNumber);
      if (state) {
        state.step = 'yes_response_sent';
        state.customerResponse = 'yes';
        state.lastMessage = message;
        state.responseTime = new Date();
        // DON'T end conversation here - wait for customer acknowledgment
        state.conversationEnded = false;
        
        // Save to database
        await this.saveConversationToDatabase(actualPhoneNumber, state);
      }
      
      const result = await this.sendMessage(phoneNumber, message);
      
      return {
        step: '3a',
        type: 'lost_yes_response',
        message,
        phoneNumber,
        customerResponse: 'yes',
        nextAction: 'waiting_for_customer_acknowledgment',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending lost YES response:', error);
      throw error;
    }
  }

  // Step 3b: Send NO response (ask for reason)
  async sendNoResponse(phoneNumber) {
    try {
      const message = `מה הסיבה?`;
      
      // Find the exact phone number format used in state
      const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
      const actualPhoneNumber = statePhoneNumber || phoneNumber;
      
      // Update conversation state in memory
      const state = this.conversationStates.get(actualPhoneNumber);
      if (state) {
        state.step = 'no_response_sent';
        state.customerResponse = 'no';
        state.lastMessage = message;
        state.responseTime = new Date();
        
        // Save to database
        await this.saveConversationToDatabase(actualPhoneNumber, state);
      }
      
      const result = await this.sendMessage(phoneNumber, message);
      
      return {
        step: '3b',
        type: 'lost_no_response',
        message,
        phoneNumber,
        customerResponse: 'no',
        nextAction: 'waiting_for_reason',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending lost NO response:', error);
      throw error;
    }
  }

  // Step 4: Send closure message (after receiving reason or any response)
  async sendClosureMessage(phoneNumber) {
    try {
      const message = `אוקיי.. אם צריך עוד משהו אני כאן 😉`;
      
      // Find the exact phone number format used in state
      const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
      const actualPhoneNumber = statePhoneNumber || phoneNumber;
      
      // Update conversation state in memory
      const state = this.conversationStates.get(actualPhoneNumber);
      if (state) {
        state.step = 'closure_sent';
        state.lastMessage = message;
        state.closureTime = new Date();
        state.conversationEnded = true;
        
        // Save to database
        await this.saveConversationToDatabase(actualPhoneNumber, state);
      }
      
      const result = await this.sendMessage(phoneNumber, message);
      
      return {
        step: 4,
        type: 'lost_closure_message',
        message,
        phoneNumber,
        nextAction: 'conversation_completed',
        whatsappResponse: result
      };
    } catch (error) {
      console.error('Error sending lost closure message:', error);
      throw error;
    }
  }

  // Helper function to detect Hebrew/English Yes/No responses
  checkHebrewResponse(messageContent) {
    const lowerMessage = messageContent.toLowerCase().trim();
    
    // Hebrew Yes variations + English variations + all possible formats
    const yesWords = [
      // Hebrew Yes
      'כן', 'בטח', 'אוקי', 'בסדר', 'מוכן', 'מעוניין', 'רוצה', 'כן!', 'בטח!', 'אוקיי',
      // English Yes - all formats
      'yes', 'y', 'yeah', 'yep', 'ok', 'okay', 'sure', 'absolutely', 'definitely',
      'YES', 'Y', 'YEAH', 'YEP', 'OK', 'OKAY', 'SURE', 'ABSOLUTELY', 'DEFINITELY',
      'Yes', 'Yeah', 'Yep', 'Ok', 'Okay', 'Sure', 'Absolutely', 'Definitely',
      // Numbers that mean yes
      '1', 'one', 'ONE', 'One',
      // Other positive responses
      'good', 'great', 'perfect', 'fine', 'agreed', 'accept', 'approved',
      'GOOD', 'GREAT', 'PERFECT', 'FINE', 'AGREED', 'ACCEPT', 'APPROVED'
    ];
    
    // Hebrew No variations + English variations + all possible formats  
    const noWords = [
      // Hebrew No
      'לא', 'לא מעוניין', 'לא רוצה', 'אין לי זמן', 'לא!', 'לא תודה', 'לא צריך',
      // English No - all formats
      'no', 'n', 'nope', 'never', 'not', 'nah', 'negative',
      'NO', 'N', 'NOPE', 'NEVER', 'NOT', 'NAH', 'NEGATIVE',
      'No', 'Nope', 'Never', 'Not', 'Nah', 'Negative',
      // Numbers that mean no
      '2', 'two', 'TWO', 'Two',
      // Other negative responses
      'bad', 'wrong', 'refuse', 'reject', 'decline', 'cancel', 'denied',
      'BAD', 'WRONG', 'REFUSE', 'REJECT', 'DECLINE', 'CANCEL', 'DENIED',
      // Not interested variations
      'not interested', 'NOT INTERESTED', 'Not Interested',
      'no thanks', 'NO THANKS', 'No Thanks', 'no thank you', 'NO THANK YOU'
    ];
    
    // Check for YES responses
    if (yesWords.some(word => lowerMessage.includes(word.toLowerCase()))) {
      return 'yes';
    }
    
    // Check for NO responses
    if (noWords.some(word => lowerMessage.includes(word.toLowerCase()))) {
      return 'no';
    }
    
    return 'unknown';
  }

  // Main conversation handler - processes incoming messages and decides next step
  async handleIncomingMessage(phoneNumber, messageContent, customerName = null) {
    try {
      const state = await this.getConversationState(phoneNumber);
      
      // If no conversation state exists, this might be a general response
      if (!state) {
        return { 
          action: 'no_active_conversation',
          suggestion: 'Start new lost customer conversation or handle as general message'
        };
      }
      
      const responseType = this.checkHebrewResponse(messageContent);
      
      // Handle based on current conversation step
      switch (state.step) {
        case 'initial_sent':
          // Customer responded to initial greeting - send follow-up
          const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
          return await this.sendFollowUpMessage(statePhoneNumber || phoneNumber);
          
        case 'followup_sent':
          // Customer responded to follow-up - check if yes/no
          
          if (responseType === 'yes') {
            // Use the same phone format as stored in state
            const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
            return await this.sendYesResponse(statePhoneNumber || phoneNumber);
            
          } else if (responseType === 'no') {
            const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
            return await this.sendNoResponse(statePhoneNumber || phoneNumber);
            
          } else {
            const statePhoneNumber = this.findStatePhoneNumber(phoneNumber);
            return await this.sendNoResponse(statePhoneNumber || phoneNumber);
          }
          
        case 'no_response_sent':
          // Customer provided reason - send closure
          const statePhoneNumberNo = this.findStatePhoneNumber(phoneNumber);
          return await this.sendClosureMessage(statePhoneNumberNo || phoneNumber);
          
        case 'yes_response_sent':
          // Customer acknowledged YES response - send closure
          const statePhoneNumberYes = this.findStatePhoneNumber(phoneNumber);
          return await this.sendClosureMessage(statePhoneNumberYes || phoneNumber);
          
        case 'closure_sent':
          // Conversation already ended
          return {
            action: 'conversation_already_completed',
            message: 'This lost customer conversation has already been completed'
          };
          
        default:
          return {
            action: 'unknown_step',
            message: 'Unknown lost customer conversation step'
          };
      }
      
    } catch (error) {
      console.error('Error handling lost customer incoming message:', error);
      throw error;
    }
  }

  // Start lost customer conversation (API sends ONLY initial message, webhook handles rest)
  async startLostConversation(customerName, phoneNumber) {
    try {
      // Only send initial greeting - webhook will handle the rest
      const initialResult = await this.sendInitialGreeting(customerName, phoneNumber);
      
      return {
        flowType: 'lost_customer_conversation_started',
        customerName,
        phoneNumber,
        initialMessage: `היי ${customerName} מה קורה?`,
        flowSteps: [
          '✅ 1. API sends: היי [customerName] מה קורה?',
          '⏳ 2. Webhook waits for customer response',
          '🤖 3. Webhook sends: לא ראינו אותך מלא זמן ואני רואה שלא קבעת תור עדיין, מוכן לרענון?',
          '⏳ 4. Webhook waits for YES/NO response',
          '🤖 5a. If YES: אוקי אני אדאג שיחזרו אלייך במיידי',
          '🤖 5b. If NO: מה הסיבה? -> אוקיי.. אם צריך עוד משהו אני כאן 😉'
        ],
        apiSent: initialResult,
        nextActions: 'Webhook will handle all customer responses automatically'
      };
      
    } catch (error) {
      console.error('Error starting lost customer conversation:', error);
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

  // Save conversation to database (use same ConversationState table but with different source)
  async saveConversationToDatabase(phoneNumber, stateData) {
    try {
      await this.prisma.conversationState.upsert({
        where: { phoneNumber },
        update: {
          step: stateData.step,
          customerName: stateData.customerName,
          lastMessage: stateData.lastMessage,
          customerResponse: stateData.customerResponse || null,
          status: stateData.status || 'at_lost',
          conversationEnded: stateData.conversationEnded || false,
          followupTime: stateData.followupTime || null,
          responseTime: stateData.responseTime || null,
          closureTime: stateData.closureTime || null
        },
        create: {
          phoneNumber,
          customerName: stateData.customerName,
          step: stateData.step,
          lastMessage: stateData.lastMessage,
          customerResponse: stateData.customerResponse || null,
          status: stateData.status || 'at_lost', // Lost customer status
          conversationEnded: stateData.conversationEnded || false,
          startTime: stateData.startTime || new Date(),
          followupTime: stateData.followupTime || null,
          responseTime: stateData.responseTime || null,
          closureTime: stateData.closureTime || null
        }
      });
    } catch (error) {
      console.error('Error saving lost conversation to database:', error);
    }
  }

  // Load conversation from database
  async loadConversationFromDatabase(phoneNumber) {
    try {
      const conversation = await this.prisma.conversationState.findUnique({
        where: { phoneNumber }
      });

      if (conversation && !conversation.conversationEnded && conversation.status === 'at_lost') {
        // Convert database format to memory format
        const stateData = {
          step: conversation.step,
          customerName: conversation.customerName,
          startTime: conversation.startTime,
          lastMessage: conversation.lastMessage,
          customerResponse: conversation.customerResponse,
          status: conversation.status,
          conversationEnded: conversation.conversationEnded,
          followupTime: conversation.followupTime,
          responseTime: conversation.responseTime,
          closureTime: conversation.closureTime,
          conversationType: 'lost_customer'
        };

        // Load into memory
        this.conversationStates.set(phoneNumber, stateData);
        return stateData;
      } else if (conversation && conversation.conversationEnded) {
        return null;
      }
      return null;
    } catch (error) {
      console.error('Error loading lost conversation from database:', error);
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

  // Get all active lost conversations
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
    return { message: 'All lost conversation states cleared' };
  }
}

module.exports = LostService;
