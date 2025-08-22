const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Apply authentication and admin authorization to all routes
router.use(authenticateToken);
router.use(authorizeRole(['admin']));

// Get monthly performance metrics
// GET /api/admin-dashboard/monthly-performance?month=7&year=2024
router.get('/monthly-performance', adminDashboardController.getMonthlyPerformance);

// Get revenue impact over months
// GET /api/admin-dashboard/revenue-impact?months=6
router.get('/revenue-impact', adminDashboardController.getRevenueImpact);

// Get customer status breakdown
// GET /api/admin-dashboard/customer-status
router.get('/customer-status', adminDashboardController.getCustomerStatusBreakdown);

// Get admin summary
// GET /api/admin-dashboard/admin-summary
router.get('/admin-summary', adminDashboardController.getAdminSummary);

// Get complete dashboard overview (all metrics in one call)
// GET /api/admin-dashboard/overview?month=7&year=2024&months=6
router.get('/overview', adminDashboardController.getDashboardOverview);

module.exports = router;
