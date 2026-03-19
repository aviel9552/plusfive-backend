const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const CustomerStatusService = require('../services/CustomerStatusService');

// Initialize CustomerStatusService
const customerStatusService = new CustomerStatusService();

// Test endpoints for CustomerStatusService (requires authentication)
router.get('/run-cron', authenticateToken, async (req, res) => {
  try {
    
    // Process all customers and find at-risk ones
    const result = await customerStatusService.processAllCustomerStatuses(req.user.userId);
    
    res.json({
      success: true,
      message: 'At-Risk customer processing completed',
      data: {
        processResult: result,
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process at-risk customers',
      error: error.message
    });
  }
});

router.get('/process-lost', authenticateToken, async (req, res) => {
  try {
    
    // Process all customers and find lost ones
    const result = await customerStatusService.processAllCustomerStatuses(req.user.userId);
    
    // Get lost customers specifically
    const lostCustomers = await customerStatusService.getCustomersByStatus('lost', req.user.userId);
    
    res.json({
      success: true,
      message: 'Lost customer processing completed',
      data: {
        processResult: result,
        lostCustomers: lostCustomers,
        totalLost: lostCustomers.length
      }
    });
  } catch (error) {
    console.error('❌ Test Lost Processing Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process lost customers',
      error: error.message
    });
  }
});

// Get status statistics
router.get('/status-stats', authenticateToken, async (req, res) => {
  try {
    
    const stats = await customerStatusService.getStatusStatistics(req.user.userId);
    
    res.json({
      success: true,
      message: 'Status statistics retrieved',
      data: stats
    });
  } catch (error) {
    console.error('❌ Status Statistics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status statistics',
      error: error.message
    });
  }
});

// Get recent status changes
router.get('/recent-changes', authenticateToken, async (req, res) => {
  try {
    const limitHours = req.query.hours || 24; // Default last 24 hours
    
    const recentChanges = await customerStatusService.getRecentStatusChanges(limitHours);
    
    res.json({
      success: true,
      message: 'Recent status changes retrieved',
      data: {
        changes: recentChanges,
        timeframe: `Last ${limitHours} hours`,
        totalChanges: recentChanges.length
      }
    });
  } catch (error) {
    console.error('❌ Recent Changes Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent changes',
      error: error.message
    });
  }
});

// Test specific customer status determination
router.get('/check-customer/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const determinedStatus = await customerStatusService.determineCustomerStatus(customerId, req.user.userId);
    const lastVisitDate = await customerStatusService.getLastVisitDate(customerId);
    const averageDays = await customerStatusService.calculateAverageDaysBetweenVisits(customerId);
    
    res.json({
      success: true,
      message: 'Customer status checked',
      data: {
        customerId: customerId,
        determinedStatus: determinedStatus,
        lastVisitDate: lastVisitDate,
        averageDaysBetweenVisits: averageDays,
        thresholds: customerStatusService.statusThresholds,
        testMode: customerStatusService.isTestMode
      }
    });
  } catch (error) {
    console.error('❌ Customer Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check customer status',
      error: error.message
    });
  }
});

// Get customers by specific status
router.get('/customers/:status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;
    
    const customers = await customerStatusService.getCustomersByStatus(status, req.user.userId);
    
    res.json({
      success: true,
      message: `Customers with ${status} status retrieved`,
      data: {
        status: status,
        customers: customers,
        total: customers.length
      }
    });
  } catch (error) {
    console.error('❌ Get Customers By Status Error:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get ${status} customers`,
      error: error.message
    });
  }
});

module.exports = router;
