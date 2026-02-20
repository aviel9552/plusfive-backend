const express = require('express');
const router = express.Router();
const {
  uploadGalleryImages,
  getGalleryByUser,
  deleteGalleryImage,
  deleteMultipleGalleryImages
} = require('../controllers/businessGalleryController');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticateToken);

// GET /api/business-gallery - Get all gallery images for logged-in user
router.get('/', getGalleryByUser);

// POST /api/business-gallery/upload - Upload multiple images (field name: images, max 10)
router.post('/upload', upload.array('images', 10), uploadGalleryImages);

// POST /api/business-gallery/delete-multiple - Delete multiple gallery images (body: { ids: string[] })
router.post('/delete-multiple', deleteMultipleGalleryImages);

// DELETE /api/business-gallery/:id - Delete one gallery image
router.delete('/:id', deleteGalleryImage);

module.exports = router;
