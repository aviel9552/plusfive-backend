const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteMultipleProducts
} = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

router.use(authenticateToken);

router.get('/', getAllProducts);
router.get('/:id', getProductById);

router.post('/', checkSubscription, createProduct);
router.put('/:id', checkSubscription, updateProduct);
router.delete('/bulk/delete', checkSubscription, deleteMultipleProducts);
router.delete('/:id', checkSubscription, deleteProduct);

module.exports = router;
