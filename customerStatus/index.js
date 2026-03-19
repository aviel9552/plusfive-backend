const express = require('express');
const router = express.Router();
const {
  getStatusStatistics,
  getCustomersByStatus,
  updateSingleCustomerStatus
} = require('./controller');

// Management endpoints (for dashboard/admin)
router.get('/statistics', getStatusStatistics);                         // Get status stats
router.get('/status/:status', getCustomersByStatus);                    // Get customers by status
router.put('/customer/:customerId/update', updateSingleCustomerStatus); // Manual status update

module.exports = router;
