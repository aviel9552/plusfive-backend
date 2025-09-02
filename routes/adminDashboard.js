const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Apply authentication and role-based authorization to all routes
router.use(authenticateToken);
router.use(authorizeRole(['admin', 'user'])); // Allow both admin and business owners

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

// Get QR Code Analytics with ScanCount and ShareCount
// GET /api/admin-dashboard/qr-analytics?period=monthly
router.get('/qr-analytics', adminDashboardController.getQRCodeAnalytics);

// Get revenue impact over months
// GET /api/admin-dashboard/revenue-impacts
router.get('/revenue-impacts', adminDashboardController.getRevenueImpacts);

// Get revenue counts
// GET /api/admin-dashboard/revenue-counts
router.get('/revenue-counts', adminDashboardController.getRevenueCounts);

// Get revenue counts
// GET /api/admin-dashboard/average-rating-counts
router.get('/average-rating-counts', adminDashboardController.getAverageRatingCounts);

module.exports = router;
