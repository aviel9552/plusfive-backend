const express = require('express');
const router = express.Router();
const {
  uploadGalleryImages,
  getGalleryByUser,
  deleteGalleryImage,
  deleteMultipleGalleryImages
} = require('../controllers/businessGalleryController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const upload = require('../middleware/upload');

router.use(authenticateToken);

// GET /api/business-gallery - Get all gallery images for logged-in user (view only, no subscription required)
router.get('/', getGalleryByUser);

// POST /api/business-gallery/upload - Upload multiple images (subscription required)
router.post('/upload', checkSubscription, upload.array('images', 10), uploadGalleryImages);

// POST /api/business-gallery/delete-multiple - Delete multiple gallery images (subscription required)
router.post('/delete-multiple', checkSubscription, deleteMultipleGalleryImages);

// DELETE /api/business-gallery/:id - Delete one gallery image (subscription required)
router.delete('/:id', checkSubscription, deleteGalleryImage);

module.exports = router;
