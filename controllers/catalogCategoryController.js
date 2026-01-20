const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { constants } = require('../config');

// Helper function to ensure minimum delay for better UX (loader visibility)
const ensureMinimumDelay = async (promise, minDelayMs = 2000) => {
  const startTime = Date.now();
  const result = await promise;
  const elapsed = Date.now() - startTime;
  const remainingDelay = minDelayMs - elapsed;
  
  if (remainingDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }
  
  return result;
};

// Get all catalog categories
const getAllCatalogCategories = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause - only show non-deleted categories
    const where = {
      isDeleted: false
    };

    // Regular users can only see their own categories, admin can see all
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const categories = await ensureMinimumDelay(
      prisma.catalogCategory.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              businessName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    );

    return successResponse(res, {
      categories,
      total: categories.length
    });

  } catch (error) {
    console.error('Get all catalog categories error:', error);
    return errorResponse(res, 'Failed to fetch catalog categories', 500);
  }
};

// Get catalog category by ID
const getCatalogCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause
    const where = {
      id,
      isDeleted: false
    };

    // Regular users can only access their own categories
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const category = await ensureMinimumDelay(
      prisma.catalogCategory.findFirst({
        where
      })
    );

    if (!category) {
      return errorResponse(res, 'Catalog category not found', 404);
    }

    return successResponse(res, category);

  } catch (error) {
    console.error('Get catalog category by ID error:', error);
    return errorResponse(res, 'Failed to fetch catalog category', 500);
  }
};

// Create new catalog category
const createCatalogCategory = async (req, res) => {
  try {
    const { title, status } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!title || !title.trim()) {
      return errorResponse(res, 'Catalog category title is required', 400);
    }

    // Check if category with same title already exists for this user (non-deleted)
    const existingCategory = await prisma.catalogCategory.findFirst({
      where: {
        title: title.trim(),
        userId: userId,
        isDeleted: false
      }
    });

    if (existingCategory) {
      return errorResponse(res, 'Catalog category with this title already exists', 400);
    }

    // Create category associated with the user
    const category = await ensureMinimumDelay(
      prisma.catalogCategory.create({
        data: {
          title: title.trim(),
          status: status || constants.STATUS.ACTIVE,
          userId: userId
        }
      })
    );

    return successResponse(res, category, 'Catalog category created successfully', 201);

  } catch (error) {
    console.error('Create catalog category error:', error);
    return errorResponse(res, 'Failed to create catalog category', 500);
  }
};

// Update catalog category
const updateCatalogCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status } = req.body;
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause to check if category exists
    const where = {
      id,
      isDeleted: false
    };

    // Regular users can only update their own categories
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    // Check if category exists
    const existingCategory = await prisma.catalogCategory.findFirst({
      where
    });

    if (!existingCategory) {
      return errorResponse(res, 'Catalog category not found', 404);
    }

    // Validate required fields if provided
    if (title !== undefined && !title.trim()) {
      return errorResponse(res, 'Catalog category title cannot be empty', 400);
    }

    // Check if another category with same title exists for this user (excluding current category)
    if (title !== undefined && title.trim() !== existingCategory.title) {
      const duplicateWhere = {
        title: title.trim(),
        isDeleted: false,
        id: { not: id }
      };

      // Regular users can only check duplicates within their own categories
      if (userRole !== constants.ROLES.ADMIN) {
        duplicateWhere.userId = userId;
      }

      const duplicateCategory = await prisma.catalogCategory.findFirst({
        where: duplicateWhere
      });

      if (duplicateCategory) {
        return errorResponse(res, 'Catalog category with this title already exists', 400);
      }
    }

    // Build update data
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (status !== undefined) updateData.status = status;

    // Update category
    const category = await ensureMinimumDelay(
      prisma.catalogCategory.update({
        where: { id },
        data: updateData
      })
    );

    return successResponse(res, category, 'Catalog category updated successfully');

  } catch (error) {
    console.error('Update catalog category error:', error);
    return errorResponse(res, 'Failed to update catalog category', 500);
  }
};

// Delete catalog category (hard delete)
const deleteCatalogCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause to check if category exists
    const where = {
      id,
      isDeleted: false
    };

    // Regular users can only delete their own categories
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    // Check if category exists
    const category = await prisma.catalogCategory.findFirst({
      where
    });

    if (!category) {
      return errorResponse(res, 'Catalog category not found', 404);
    }

    // Hard delete category - permanently remove from database
    await ensureMinimumDelay(
      prisma.catalogCategory.delete({
        where: { id }
      })
    );

    return successResponse(res, {
      message: 'Catalog category deleted successfully',
      categoryId: id
    }, 'Catalog category deleted successfully');

  } catch (error) {
    console.error('Delete catalog category error:', error);
    return errorResponse(res, 'Failed to delete catalog category', 500);
  }
};

// Delete multiple catalog categories (bulk hard delete)
const deleteMultipleCatalogCategories = async (req, res) => {
  try {
    const { categoryIds } = req.body;
    const userRole = req.user.role;
    const userId = req.user.userId;

    if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
      return errorResponse(res, 'Category IDs array is required', 400);
    }

    // Build where clause
    const where = {
      id: { in: categoryIds },
      isDeleted: false
    };

    // Regular users can only delete their own categories
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    // Hard delete multiple categories - permanently remove from database
    const result = await ensureMinimumDelay(
      prisma.catalogCategory.deleteMany({
        where
      })
    );

    return successResponse(res, {
      message: `${result.count} catalog category/categories deleted successfully`,
      deletedCount: result.count
    }, 'Catalog categories deleted successfully');

  } catch (error) {
    console.error('Delete multiple catalog categories error:', error);
    return errorResponse(res, 'Failed to delete catalog categories', 500);
  }
};

module.exports = {
  getAllCatalogCategories,
  getCatalogCategoryById,
  createCatalogCategory,
  updateCatalogCategory,
  deleteCatalogCategory,
  deleteMultipleCatalogCategories
};
