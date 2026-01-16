const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Get all categories
const getAllCategories = async (req, res) => {
  try {
    const userRole = req.user.role;

    // Build where clause - only show non-deleted categories
    const where = {
      isDeleted: false
    };

    const categories = await prisma.category.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, {
      categories,
      total: categories.length
    });

  } catch (error) {
    console.error('Get all categories error:', error);
    return errorResponse(res, 'Failed to fetch categories', 500);
  }
};

// Get category by ID
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findFirst({
      where: {
        id,
        isDeleted: false
      }
    });

    if (!category) {
      return errorResponse(res, 'Category not found', 404);
    }

    return successResponse(res, category);

  } catch (error) {
    console.error('Get category by ID error:', error);
    return errorResponse(res, 'Failed to fetch category', 500);
  }
};

// Create new category
const createCategory = async (req, res) => {
  try {
    const { title, status } = req.body;
    const userRole = req.user.role;

    // Only admin users can create categories
    if (userRole !== 'admin') {
      return errorResponse(res, 'Access denied. Only admin users can create categories.', 403);
    }

    // Validate required fields
    if (!title || !title.trim()) {
      return errorResponse(res, 'Category title is required', 400);
    }

    // Check if category with same title already exists (non-deleted)
    const existingCategory = await prisma.category.findFirst({
      where: {
        title: title.trim(),
        isDeleted: false
      }
    });

    if (existingCategory) {
      return errorResponse(res, 'Category with this title already exists', 400);
    }

    // Create category
    const category = await prisma.category.create({
      data: {
        title: title.trim(),
        status: status || 'active'
      }
    });

    return successResponse(res, category, 'Category created successfully', 201);

  } catch (error) {
    console.error('Create category error:', error);
    return errorResponse(res, 'Failed to create category', 500);
  }
};

// Update category
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status } = req.body;
    const userRole = req.user.role;

    // Only admin users can update categories
    if (userRole !== 'admin') {
      return errorResponse(res, 'Access denied. Only admin users can update categories.', 403);
    }

    // Check if category exists
    const existingCategory = await prisma.category.findFirst({
      where: {
        id,
        isDeleted: false
      }
    });

    if (!existingCategory) {
      return errorResponse(res, 'Category not found', 404);
    }

    // Validate required fields if provided
    if (title !== undefined && !title.trim()) {
      return errorResponse(res, 'Category title cannot be empty', 400);
    }

    // Check if another category with same title exists (excluding current category)
    if (title !== undefined && title.trim() !== existingCategory.title) {
      const duplicateCategory = await prisma.category.findFirst({
        where: {
          title: title.trim(),
          isDeleted: false,
          id: { not: id }
        }
      });

      if (duplicateCategory) {
        return errorResponse(res, 'Category with this title already exists', 400);
      }
    }

    // Build update data
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (status !== undefined) updateData.status = status;

    // Update category
    const category = await prisma.category.update({
      where: { id },
      data: updateData
    });

    return successResponse(res, category, 'Category updated successfully');

  } catch (error) {
    console.error('Update category error:', error);
    return errorResponse(res, 'Failed to update category', 500);
  }
};

// Delete category (soft delete)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;

    // Only admin users can delete categories
    if (userRole !== 'admin') {
      return errorResponse(res, 'Access denied. Only admin users can delete categories.', 403);
    }

    // Check if category exists
    const category = await prisma.category.findFirst({
      where: {
        id,
        isDeleted: false
      }
    });

    if (!category) {
      return errorResponse(res, 'Category not found', 404);
    }

    // Soft delete category
    const deletedCategory = await prisma.category.update({
      where: { id },
      data: {
        isDeleted: true
      }
    });

    return successResponse(res, {
      message: 'Category deleted successfully',
      category: deletedCategory
    }, 'Category deleted successfully');

  } catch (error) {
    console.error('Delete category error:', error);
    return errorResponse(res, 'Failed to delete category', 500);
  }
};

// Delete multiple categories (bulk delete)
const deleteMultipleCategories = async (req, res) => {
  try {
    const { categoryIds } = req.body;
    const userRole = req.user.role;

    // Only admin users can delete categories
    if (userRole !== 'admin') {
      return errorResponse(res, 'Access denied. Only admin users can delete categories.', 403);
    }

    if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
      return errorResponse(res, 'Category IDs array is required', 400);
    }

    // Soft delete multiple categories
    const result = await prisma.category.updateMany({
      where: {
        id: { in: categoryIds },
        isDeleted: false
      },
      data: {
        isDeleted: true
      }
    });

    return successResponse(res, {
      message: `${result.count} category/categories deleted successfully`,
      deletedCount: result.count
    }, 'Categories deleted successfully');

  } catch (error) {
    console.error('Delete multiple categories error:', error);
    return errorResponse(res, 'Failed to delete categories', 500);
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  deleteMultipleCategories
};
