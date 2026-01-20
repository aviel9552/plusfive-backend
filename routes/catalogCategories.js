const express = require('express');
const router = express.Router();
const {
  getAllCatalogCategories,
  getCatalogCategoryById,
  createCatalogCategory,
  updateCatalogCategory,
  deleteCatalogCategory,
  deleteMultipleCatalogCategories
} = require('../controllers/catalogCategoryController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

// All catalog category routes require authentication
router.use(authenticateToken);

// GET routes - No subscription check required
// GET /api/catalog-categories - Get all catalog categories
router.get('/', getAllCatalogCategories);

// GET /api/catalog-categories/:id - Get catalog category by ID
router.get('/:id', getCatalogCategoryById);

// POST, PUT, DELETE routes - Require active subscription (checked directly from Stripe)
// POST /api/catalog-categories - Create new catalog category
router.post('/', checkSubscription, createCatalogCategory);

// PUT /api/catalog-categories/:id - Update catalog category
router.put('/:id', checkSubscription, updateCatalogCategory);

// DELETE /api/catalog-categories/bulk/delete - Delete multiple catalog categories (bulk delete)
// Note: This route must come before /:id to avoid route conflicts
router.delete('/bulk/delete', checkSubscription, deleteMultipleCatalogCategories);

// DELETE /api/catalog-categories/:id - Delete catalog category (hard delete)
router.delete('/:id', checkSubscription, deleteCatalogCategory);

module.exports = router;
