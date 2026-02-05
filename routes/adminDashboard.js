const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Apply authentication and role-based authorization to all routes
router.use(authenticateToken);
router.use(authorizeRole(['admin', 'user'])); // Allow both admin and business owners

// Get monthly performance metrics
// GET /api/admin-dashboard/monthly-performance (current month/year, no query params)
router.get('/monthly-performance', adminDashboardController.getMonthlyPerformance);

// Get customer status breakdown
// GET /api/admin-dashboard/customer-status
router.get('/customer-status', adminDashboardController.getCustomerStatusBreakdown);

// Get QR Code Analytics with ScanCount and ShareCount
// GET /api/admin-dashboard/qr-analytics (current month; no query params)
router.get('/qr-analytics', adminDashboardController.getQRCodeAnalytics);

// Get revenue impact over months
// GET /api/admin-dashboard/revenue-impacts
router.get('/revenue-impacts', adminDashboardController.getRevenueImpacts);

// Get monthly LTV Count data
// GET /api/admin-dashboard/monthly-ltv-count
router.get('/monthly-ltv-count', adminDashboardController.getMonthlyLTVCount);

// Get revenue counts
// GET /api/admin-dashboard/revenue-counts
router.get('/revenue-counts', adminDashboardController.getRevenueCounts);

// Get revenue counts
// GET /api/admin-dashboard/average-rating-counts
router.get('/average-rating-counts', adminDashboardController.getAverageRatingCounts);

module.exports = router;
