const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { uploadImage, deleteImage, extractPublicId } = require('../lib/cloudinary');
const { constants } = require('../config');

const FOLDER = constants.CLOUDINARY_FOLDERS.BUSINESS_GALLERY;
const MAX_FILES = 10;

/**
 * Upload multiple images to Cloudinary and save to BusinessGallery (fileName, userId, fileUrl)
 * POST /api/business-gallery/upload
 * Form-data: images[] (multiple files)
 */
const uploadGalleryImages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = req.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return errorResponse(res, 'No images provided. Send at least one image.', 400);
    }

    if (files.length > MAX_FILES) {
      return errorResponse(res, `Maximum ${MAX_FILES} images per request.`, 400);
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploadResult = await uploadImage(file.buffer, FOLDER);
        const fileUrl = uploadResult.secure_url;
        const fileName = file.originalname || `image-${Date.now()}-${i}`;

        const record = await prisma.businessGallery.create({
          data: {
            fileName,
            fileUrl,
            userId
          }
        });
        results.push(record);
      } catch (err) {
        console.error(`BusinessGallery upload error for file ${i}:`, err);
        errors.push({ index: i, name: file.originalname, message: err.message });
      }
    }

    if (results.length === 0) {
      return errorResponse(res, errors.length ? errors[0].message : 'Failed to upload images', 500);
    }

    return successResponse(
      res,
      {
        uploaded: results,
        total: results.length,
        ...(errors.length > 0 && { errors })
      },
      `${results.length} image(s) uploaded successfully`,
      201
    );
  } catch (error) {
    console.error('Upload gallery images error:', error);
    return errorResponse(res, 'Failed to upload gallery images', 500);
  }
};

/**
 * Get all gallery images for the logged-in user
 * GET /api/business-gallery
 */
const getGalleryByUser = async (req, res) => {
  try {
    const userId = req.user.userId;

    const gallery = await prisma.businessGallery.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, {
      gallery,
      total: gallery.length
    });
  } catch (error) {
    console.error('Get gallery error:', error);
    return errorResponse(res, 'Failed to fetch gallery', 500);
  }
};

/**
 * Delete one gallery image by id (and from Cloudinary)
 * DELETE /api/business-gallery/:id
 */
const deleteGalleryImage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const record = await prisma.businessGallery.findFirst({
      where: { id, userId }
    });

    if (!record) {
      return errorResponse(res, 'Gallery image not found', 404);
    }

    const publicId = extractPublicId(record.fileUrl);
    if (publicId) {
      try {
        await deleteImage(publicId);
      } catch (deleteErr) {
        console.error('Cloudinary delete error:', deleteErr);
        // Continue to remove DB record even if Cloudinary delete fails
      }
    }

    await prisma.businessGallery.delete({
      where: { id }
    });

    return successResponse(res, { id }, 'Gallery image deleted successfully');
  } catch (error) {
    console.error('Delete gallery image error:', error);
    return errorResponse(res, 'Failed to delete gallery image', 500);
  }
};

/**
 * Delete multiple gallery images by ids (and from Cloudinary). Only images belonging to userId are deleted.
 * POST /api/business-gallery/delete-multiple
 * Body: { ids: string[] }
 */
const deleteMultipleGalleryImages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'No image ids provided. Send an array of ids.', 400);
    }

    const records = await prisma.businessGallery.findMany({
      where: { id: { in: ids }, userId }
    });

    const deletedIds = [];
    const errors = [];

    for (const record of records) {
      try {
        const publicId = extractPublicId(record.fileUrl);
        if (publicId) {
          try {
            await deleteImage(publicId);
          } catch (deleteErr) {
            console.error('Cloudinary delete error:', deleteErr);
          }
        }
        await prisma.businessGallery.delete({ where: { id: record.id } });
        deletedIds.push(record.id);
      } catch (err) {
        console.error(`Delete gallery image ${record.id} error:`, err);
        errors.push(record.id);
      }
    }

    return successResponse(res, {
      deleted: deletedIds,
      total: deletedIds.length,
      ...(errors.length > 0 && { failed: errors })
    }, `${deletedIds.length} image(s) deleted successfully`);
  } catch (error) {
    console.error('Delete multiple gallery images error:', error);
    return errorResponse(res, 'Failed to delete gallery images', 500);
  }
};

module.exports = {
  uploadGalleryImages,
  getGalleryByUser,
  deleteGalleryImage,
  deleteMultipleGalleryImages
};
