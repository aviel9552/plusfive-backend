const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  deleteMultipleCategories
} = require('../controllers/categoryController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All category routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/categories - Get all categories
router.get('/', getAllCategories);

// GET /api/categories/:id - Get category by ID
router.get('/:id', getCategoryById);

// POST, PUT, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/categories - Create new category
router.post('/', checkSubscription, createCategory);

// PUT /api/categories/:id - Update category
router.put('/:id', checkSubscription, updateCategory);

// DELETE /api/categories/bulk/delete - Delete multiple categories (bulk delete)
// Note: This route must come before /:id to avoid route conflicts
router.delete('/bulk/delete', checkSubscription, deleteMultipleCategories);

// DELETE /api/categories/:id - Delete category (hard delete)
router.delete('/:id', checkSubscription, deleteCategory);

module.exports = router;
