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

// Get all suppliers
const getAllSuppliers = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause - only show non-deleted suppliers
    const where = {
      isDeleted: false
    };

    // Regular users can only see their own suppliers, admin can see all
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const suppliers = await ensureMinimumDelay(
      prisma.supplier.findMany({
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
          },
          _count: {
            select: {
              products: true // Count products for each supplier
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    );

    return successResponse(res, {
      suppliers,
      total: suppliers.length
    });

  } catch (error) {
    console.error('Get all suppliers error:', error);
    return errorResponse(res, 'Failed to fetch suppliers', 500);
  }
};

// Get supplier by ID
const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause
    const where = {
      id,
      isDeleted: false
    };

    // Regular users can only access their own suppliers
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const supplier = await ensureMinimumDelay(
      prisma.supplier.findFirst({
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
          },
          products: {
            where: {
              isDeleted: false
            },
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          _count: {
            select: {
              products: true
            }
          }
        }
      })
    );

    if (!supplier) {
      return errorResponse(res, 'Supplier not found', 404);
    }

    return successResponse(res, supplier);

  } catch (error) {
    console.error('Get supplier by ID error:', error);
    return errorResponse(res, 'Failed to fetch supplier', 500);
  }
};

// Create new supplier
const createSupplier = async (req, res) => {
  try {
    const { name, phone, email, status } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!name || !name.trim()) {
      return errorResponse(res, 'Supplier name is required', 400);
    }

    // Check if supplier with same name already exists for this user (non-deleted)
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        name: name.trim(),
        userId: userId,
        isDeleted: false
      }
    });

    if (existingSupplier) {
      return errorResponse(res, 'Supplier with this name already exists', 400);
    }

    // Create supplier associated with the user
    const supplier = await ensureMinimumDelay(
      prisma.supplier.create({
        data: {
          name: name.trim(),
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          status: status || constants.SUPPLIER_STATUS.ACTIVE,
          userId: userId
        }
      })
    );

    return successResponse(res, supplier, 'Supplier created successfully', 201);

  } catch (error) {
    console.error('Create supplier error:', error);
    return errorResponse(res, 'Failed to create supplier', 500);
  }
};

// Update supplier
const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, status } = req.body;
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause to check if supplier exists
    const where = {
      id,
      isDeleted: false
    };

    // Regular users can only update their own suppliers
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    // Check if supplier exists
    const existingSupplier = await prisma.supplier.findFirst({
      where
    });

    if (!existingSupplier) {
      return errorResponse(res, 'Supplier not found', 404);
    }

    // Validate required fields if provided
    if (name !== undefined && !name.trim()) {
      return errorResponse(res, 'Supplier name cannot be empty', 400);
    }

    // Check if another supplier with same name exists for this user (excluding current supplier)
    if (name !== undefined && name.trim() !== existingSupplier.name) {
      const duplicateWhere = {
        name: name.trim(),
        isDeleted: false,
        id: { not: id }
      };

      // Regular users can only check duplicates within their own suppliers
      if (userRole !== constants.ROLES.ADMIN) {
        duplicateWhere.userId = userId;
      }

      const duplicateSupplier = await prisma.supplier.findFirst({
        where: duplicateWhere
      });

      if (duplicateSupplier) {
        return errorResponse(res, 'Supplier with this name already exists', 400);
      }
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (status !== undefined) updateData.status = status;

    // Update supplier
    const supplier = await ensureMinimumDelay(
      prisma.supplier.update({
        where: { id },
        data: updateData
      })
    );

    return successResponse(res, supplier, 'Supplier updated successfully');

  } catch (error) {
    console.error('Update supplier error:', error);
    return errorResponse(res, 'Failed to update supplier', 500);
  }
};

// Delete supplier (hard delete)
const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause to check if supplier exists
    const where = {
      id,
      isDeleted: false
    };

    // Regular users can only delete their own suppliers
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    // Check if supplier exists
    const supplier = await prisma.supplier.findFirst({
      where,
      include: {
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    if (!supplier) {
      return errorResponse(res, 'Supplier not found', 404);
    }

    // Check if supplier has products (optional validation - you can remove this if you want to allow deletion)
    if (supplier._count.products > 0) {
      return errorResponse(res, `Cannot delete supplier. ${supplier._count.products} product(s) are associated with this supplier. Please remove or reassign products first.`, 400);
    }

    // Hard delete supplier - permanently remove from database
    await ensureMinimumDelay(
      prisma.supplier.delete({
        where: { id }
      })
    );

    // SOFT DELETE CODE (COMMENTED OUT - KEPT FOR REFERENCE)
    // // Soft delete supplier
    // const deletedSupplier = await prisma.supplier.update({
    //   where: { id },
    //   data: {
    //     isDeleted: true
    //   }
    // });
    // return successResponse(res, {
    //   message: 'Supplier deleted successfully',
    //   supplier: deletedSupplier
    // }, 'Supplier deleted successfully');

    return successResponse(res, {
      message: 'Supplier deleted successfully',
      supplierId: id
    }, 'Supplier deleted successfully');

  } catch (error) {
    console.error('Delete supplier error:', error);
    return errorResponse(res, 'Failed to delete supplier', 500);
  }
};

// Delete multiple suppliers (bulk hard delete)
const deleteMultipleSuppliers = async (req, res) => {
  try {
    const { supplierIds } = req.body;
    const userRole = req.user.role;
    const userId = req.user.userId;

    if (!supplierIds || !Array.isArray(supplierIds) || supplierIds.length === 0) {
      return errorResponse(res, 'Supplier IDs array is required', 400);
    }

    // Build where clause
    const where = {
      id: { in: supplierIds },
      isDeleted: false
    };

    // Regular users can only delete their own suppliers
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    // Check if any suppliers have products
    const suppliersWithProducts = await prisma.supplier.findMany({
      where,
      include: {
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    const suppliersWithProductsList = suppliersWithProducts.filter(s => s._count.products > 0);
    if (suppliersWithProductsList.length > 0) {
      const supplierNames = suppliersWithProductsList.map(s => s.name).join(', ');
      return errorResponse(res, `Cannot delete supplier(s): ${supplierNames}. They have associated products. Please remove or reassign products first.`, 400);
    }

    // Hard delete multiple suppliers - permanently remove from database
    const result = await ensureMinimumDelay(
      prisma.supplier.deleteMany({
        where
      })
    );

    // SOFT DELETE CODE (COMMENTED OUT - KEPT FOR REFERENCE)
    // // Soft delete multiple suppliers
    // const result = await prisma.supplier.updateMany({
    //   where,
    //   data: {
    //     isDeleted: true
    //   }
    // });

    return successResponse(res, {
      message: `${result.count} supplier/suppliers deleted successfully`,
      deletedCount: result.count
    }, 'Suppliers deleted successfully');

  } catch (error) {
    console.error('Delete multiple suppliers error:', error);
    return errorResponse(res, 'Failed to delete suppliers', 500);
  }
};

module.exports = {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  deleteMultipleSuppliers
};
