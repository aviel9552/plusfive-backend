const { successResponse, errorResponse } = require('../lib/utils');
const CustomerStatusService = require('../services/CustomerStatusService');
const { constants } = require('../config');

// Initialize services
const customerStatusService = new CustomerStatusService();

// Get customer status statistics (for dashboard)
const getStatusStatistics = async (req, res) => {
  try {
    const { userId } = req.query;

    const stats = await customerStatusService.getStatusStatistics(userId);

    return successResponse(res, {
      statistics: stats,
      timestamp: new Date().toISOString()
    }, 'Status statistics retrieved successfully', 200);

  } catch (error) {
    console.error('Get status statistics error:', error);
    return errorResponse(res, 'Failed to get status statistics', 500);
  }
};

// Get customers by status (for management)
const getCustomersByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const { userId, page = 1, limit = 10 } = req.query;

    if (![constants.CUSTOMER_STATUS.NEW, constants.CUSTOMER_STATUS.ACTIVE, constants.CUSTOMER_STATUS.AT_RISK, constants.CUSTOMER_STATUS.LOST, constants.CUSTOMER_STATUS.RECOVERED].includes(status)) {
      return errorResponse(res, `Invalid status. Must be: ${constants.CUSTOMER_STATUS.NEW}, ${constants.CUSTOMER_STATUS.ACTIVE}, ${constants.CUSTOMER_STATUS.AT_RISK}, ${constants.CUSTOMER_STATUS.LOST}, ${constants.CUSTOMER_STATUS.RECOVERED}`, 400);
    }

    const customers = await customerStatusService.getCustomersByStatus(status, userId);

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedCustomers = customers.slice(skip, skip + parseInt(limit));

    return successResponse(res, {
      status: status,
      customers: paginatedCustomers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: customers.length,
        pages: Math.ceil(customers.length / parseInt(limit))
      }
    }, `${status} customers retrieved successfully`, 200);

  } catch (error) {
    console.error('Get customers by status error:', error);
    return errorResponse(res, 'Failed to get customers by status', 500);
  }
};

// Manual status update for single customer (for testing/management)
const updateSingleCustomerStatus = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { userId } = req.query; // Optional: specific business owner

    const newStatus = await customerStatusService.determineCustomerStatus(customerId, userId);
    
    if (!newStatus) {
      return errorResponse(res, 'Customer not found or error determining status', 404);
    }

    const updatedCustomer = await customerStatusService.updateCustomerStatus(customerId, newStatus, userId);

    return successResponse(res, {
      customerId,
      userId: userId || 'auto-detected',
      previousStatus: updatedCustomer.currentStatus,
      newStatus: newStatus,
      updatedAt: new Date().toISOString()
    }, 'Customer status updated successfully', 200);

  } catch (error) {
    console.error('Update single customer status error:', error);
    return errorResponse(res, 'Failed to update customer status', 500);
  }
};

module.exports = {
  getStatusStatistics,
  getCustomersByStatus,
  updateSingleCustomerStatus
};
