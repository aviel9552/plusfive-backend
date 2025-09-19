const { successResponse, errorResponse } = require('../lib/utils');
const N8nMessageService = require('../services/N8nMessageService');

// Test controller for n8n webhook integration
class N8nTestController {
  constructor() {
    this.n8nService = new N8nMessageService();
  }

  // Test at-risk message trigger
  async testAtRiskTrigger(req, res) {
    try {
      const {
        customerName = 'Test Customer',
        customerPhone = '972524684119',
        businessName = 'Test Business',
        businessType = 'barbershop',
        customerService = 'Test Service',
        businessOwnerPhone = '972523042776',
        lastVisitDate = '2024-01-10',
        whatsappPhone
      } = req.body;

      const webhookParams = {
        customerName,
        customerPhone,
        businessName,
        businessType,
        customerService,
        businessOwnerPhone,
        lastVisitDate,
        whatsappPhone: whatsappPhone || customerPhone
      };

      const result = await this.n8nService.triggerAtRiskMessage(webhookParams);

      return successResponse(res, {
        trigger: 'at_risk',
        params: webhookParams,
        result
      }, 'At-risk trigger test completed');

    } catch (error) {
      console.error('At-risk trigger test error:', error);
      return errorResponse(res, 'Failed to test at-risk trigger', 500);
    }
  }

  // Test lost message trigger
  async testLostTrigger(req, res) {
    try {
      const {
        customerName = 'Test Customer',
        customerPhone = '972524684119',
        businessName = 'Test Business',
        businessType = 'barbershop',
        customerService = 'Test Service',
        businessOwnerPhone = '972523042776',
        lastVisitDate = '2024-01-10',
        whatsappPhone
      } = req.body;

      const webhookParams = {
        customerName,
        customerPhone,
        businessName,
        businessType,
        customerService,
        businessOwnerPhone,
        lastVisitDate,
        whatsappPhone: whatsappPhone || customerPhone
      };

      const result = await this.n8nService.triggerLostMessage(webhookParams);

      return successResponse(res, {
        trigger: 'lost',
        params: webhookParams,
        result
      }, 'Lost trigger test completed');

    } catch (error) {
      console.error('Lost trigger test error:', error);
      return errorResponse(res, 'Failed to test lost trigger', 500);
    }
  }

  // Test review request trigger
  async testReviewTrigger(req, res) {
    try {
      const {
        customerName = 'Test Customer',
        customerPhone = '972524684119',
        businessName = 'Test Business',
        businessType = 'barbershop',
        customerService = 'Test Service',
        businessOwnerPhone = '972523042776',
        lastVisitDate = new Date().toISOString().split('T')[0],
        whatsappPhone,
        customerStatus = 'new'
      } = req.body;

      const webhookParams = {
        customerName,
        customerPhone,
        businessName,
        businessType,
        customerService,
        businessOwnerPhone,
        lastVisitDate,
        whatsappPhone: whatsappPhone || customerPhone,
        customerStatus
      };

      const result = await this.n8nService.triggerReviewRequest(webhookParams);

      return successResponse(res, {
        trigger: 'review_request',
        params: webhookParams,
        result
      }, 'Review request trigger test completed');

    } catch (error) {
      console.error('Review request trigger test error:', error);
      return errorResponse(res, 'Failed to test review request trigger', 500);
    }
  }


  // Test recovered customer notification trigger
  async testRecoveredTrigger(req, res) {
    try {
      const {
        customerName = 'Test Customer',
        customerPhone = '972524684119',
        businessName = 'Test Business',
        businessType = 'barbershop',
        customerService = 'Test Service',
        businessOwnerPhone = '972523042776',
        lastVisitDate = new Date().toISOString().split('T')[0],
        whatsappPhone,
        futureAppointment = '2024-02-15',
        previousStatus = 'at_risk'
      } = req.body;

      const webhookParams = {
        customerName,
        customerPhone,
        businessName,
        businessType,
        customerService,
        businessOwnerPhone,
        lastVisitDate,
        whatsappPhone: whatsappPhone || customerPhone,
        futureAppointment,
        previousStatus
      };

      const result = await this.n8nService.triggerRecoveredCustomerNotification(webhookParams);

      return successResponse(res, {
        trigger: 'recovered_customer',
        params: webhookParams,
        result
      }, 'Recovered customer notification trigger test completed');

    } catch (error) {
      console.error('Recovered customer notification trigger test error:', error);
      return errorResponse(res, 'Failed to test recovered customer notification trigger', 500);
    }
  }

  // Test custom webhook trigger
  async testCustomTrigger(req, res) {
    try {
      const webhookData = req.body;

      if (!webhookData.action || !webhookData.customer_name) {
        return errorResponse(res, 'Missing required fields: action, customer_name', 400);
      }

      const result = await this.n8nService.triggerCustomMessage(webhookData);

      return successResponse(res, {
        trigger: 'custom',
        params: webhookData,
        result
      }, 'Custom trigger test completed');

    } catch (error) {
      console.error('Custom trigger test error:', error);
      return errorResponse(res, 'Failed to test custom trigger', 500);
    }
  }
}

const n8nTestController = new N8nTestController();

module.exports = {
  testAtRiskTrigger: n8nTestController.testAtRiskTrigger.bind(n8nTestController),
  testLostTrigger: n8nTestController.testLostTrigger.bind(n8nTestController),
  testReviewTrigger: n8nTestController.testReviewTrigger.bind(n8nTestController),
  testRecoveredTrigger: n8nTestController.testRecoveredTrigger.bind(n8nTestController),
  testCustomTrigger: n8nTestController.testCustomTrigger.bind(n8nTestController)
};
