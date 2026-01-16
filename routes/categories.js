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

// All category routes require authentication
router.use(authenticateToken);

// GET routes - Accessible to all authenticated users (admin and user)
// GET /api/categories - Get all categories
router.get('/', getAllCategories);

// GET /api/categories/:id - Get category by ID
router.get('/:id', getCategoryById);

// POST, PUT, DELETE routes - Only admin users can access (role check in controller)
// POST /api/categories - Create new category
router.post('/', createCategory);

// PUT /api/categories/:id - Update category
router.put('/:id', updateCategory);

// DELETE /api/categories/bulk/delete - Delete multiple categories (bulk delete)
// Note: This route must come before /:id to avoid route conflicts
router.delete('/bulk/delete', deleteMultipleCategories);

// DELETE /api/categories/:id - Delete category (soft delete)
router.delete('/:id', deleteCategory);

module.exports = router;
