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

// Get all products
const getAllProducts = async (req, res) => {
  try {
    if (!prisma.product) {
      console.error('Prisma client error: product model not found. Please run: npx prisma generate');
      return errorResponse(res, 'Database model not initialized. Please contact support.', 500);
    }

    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause - only show non-deleted products
    const where = {
      isDeleted: false
    };

    // Regular users can only see their own products, admin can see all
    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const products = await ensureMinimumDelay(
      prisma.product.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
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
        orderBy: {
          createdAt: 'desc'
        }
      })
    );

    // Format products for frontend (include userId and user for admin catalog filter)
    const formattedProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      supplierPrice: product.supplierPrice,
      customerPrice: product.customerPrice,
      grossProfitPercentage: product.grossProfitPercentage,
      currentQuantity: product.currentQuantity,
      lowStockThreshold: product.lowStockThreshold,
      reorderQuantity: product.reorderQuantity,
      lowStockAlerts: product.lowStockAlerts,
      enableCommission: product.enableCommission,
      supplier: product.supplier?.name || null,
      supplierId: product.supplierId,
      status: product.status,
      userId: product.userId,
      user: product.user ? { id: product.user.id, email: product.user.email, firstName: product.user.firstName, lastName: product.user.lastName, businessName: product.user.businessName } : null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));

    return successResponse(res, { products: formattedProducts }, 'Products fetched successfully');
  } catch (error) {
    console.error('Get all products error:', error);
    return errorResponse(res, 'Failed to fetch products', 500);
  }
};

// Get product by ID
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const where = {
      id,
      isDeleted: false
    };

    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const product = await prisma.product.findFirst({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            status: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            businessName: true
          }
        }
      }
    });

    if (!product) {
      return errorResponse(res, 'Product not found', 404);
    }

    const formattedProduct = {
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      supplierPrice: product.supplierPrice,
      customerPrice: product.customerPrice,
      grossProfitPercentage: product.grossProfitPercentage,
      currentQuantity: product.currentQuantity,
      lowStockThreshold: product.lowStockThreshold,
      reorderQuantity: product.reorderQuantity,
      lowStockAlerts: product.lowStockAlerts,
      enableCommission: product.enableCommission,
      supplier: product.supplier?.name || null,
      supplierId: product.supplierId,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };

    return successResponse(res, formattedProduct, 'Product fetched successfully');
  } catch (error) {
    console.error('Get product by ID error:', error);
    return errorResponse(res, 'Failed to fetch product', 500);
  }
};

// Create product
const createProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      barcode,
      supplierPrice,
      customerPrice,
      currentQuantity,
      lowStockThreshold,
      reorderQuantity,
      lowStockAlerts,
      enableCommission,
      supplierId,
      status
    } = req.body;
    const userId = req.user.userId;

    if (!name || !name.trim()) {
      return errorResponse(res, 'Product name is required', 400);
    }

    if (!customerPrice || parseFloat(customerPrice) <= 0) {
      return errorResponse(res, 'Customer price must be greater than 0', 400);
    }

    // Calculate gross profit percentage
    const supplierPriceNum = parseFloat(supplierPrice) || 0;
    const customerPriceNum = parseFloat(customerPrice);
    const grossProfitPercentage = supplierPriceNum > 0 && customerPriceNum > 0
      ? parseFloat(((customerPriceNum - supplierPriceNum) / supplierPriceNum * 100).toFixed(1))
      : null;

    // Find supplier by name if supplierId is not provided but supplier name is
    let finalSupplierId = supplierId;
    if (!finalSupplierId && req.body.supplier && req.body.supplier.trim()) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          name: req.body.supplier.trim(),
          userId: userId,
          isDeleted: false
        }
      });
      if (supplier) {
        finalSupplierId = supplier.id;
      }
    }

    const product = await ensureMinimumDelay(
      prisma.product.create({
        data: {
          name: name.trim(),
          category: category?.trim() || null,
          barcode: barcode?.trim() || null,
          supplierPrice: supplierPriceNum || null,
          customerPrice: customerPriceNum,
          grossProfitPercentage: grossProfitPercentage,
          currentQuantity: parseInt(currentQuantity) || 0,
          lowStockThreshold: parseInt(lowStockThreshold) || 0,
          reorderQuantity: parseInt(reorderQuantity) || 0,
          lowStockAlerts: lowStockAlerts || false,
          enableCommission: enableCommission || false,
          supplierId: finalSupplierId || null,
          status: status || constants.PRODUCT_STATUS.ACTIVE,
          userId: userId
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              status: true
            }
          }
        }
      })
    );

    const formattedProduct = {
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      supplierPrice: product.supplierPrice,
      customerPrice: product.customerPrice,
      grossProfitPercentage: product.grossProfitPercentage,
      currentQuantity: product.currentQuantity,
      lowStockThreshold: product.lowStockThreshold,
      reorderQuantity: product.reorderQuantity,
      lowStockAlerts: product.lowStockAlerts,
      enableCommission: product.enableCommission,
      supplier: product.supplier?.name || null,
      supplierId: product.supplierId,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };

    return successResponse(res, formattedProduct, 'Product created successfully', 201);
  } catch (error) {
    console.error('Create product error:', error);
    return errorResponse(res, 'Failed to create product', 500);
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    const {
      name,
      category,
      barcode,
      supplierPrice,
      customerPrice,
      currentQuantity,
      lowStockThreshold,
      reorderQuantity,
      lowStockAlerts,
      enableCommission,
      supplierId,
      status
    } = req.body;

    // Check if product exists and belongs to user
    const where = {
      id,
      isDeleted: false
    };

    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const existingProduct = await prisma.product.findFirst({ where });

    if (!existingProduct) {
      return errorResponse(res, 'Product not found', 404);
    }

    // Calculate gross profit percentage if prices are provided
    let grossProfitPercentage = existingProduct.grossProfitPercentage;
    if (supplierPrice !== undefined || customerPrice !== undefined) {
      const supplierPriceNum = supplierPrice !== undefined 
        ? (parseFloat(supplierPrice) || 0) 
        : existingProduct.supplierPrice || 0;
      const customerPriceNum = customerPrice !== undefined 
        ? parseFloat(customerPrice) 
        : existingProduct.customerPrice;
      
      if (supplierPriceNum > 0 && customerPriceNum > 0) {
        grossProfitPercentage = parseFloat(((customerPriceNum - supplierPriceNum) / supplierPriceNum * 100).toFixed(1));
      } else {
        grossProfitPercentage = null;
      }
    }

    // Find supplier by name if supplierId is not provided but supplier name is
    let finalSupplierId = supplierId !== undefined ? supplierId : existingProduct.supplierId;
    if (req.body.supplier && req.body.supplier.trim() && !finalSupplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          name: req.body.supplier.trim(),
          userId: userId,
          isDeleted: false
        }
      });
      if (supplier) {
        finalSupplierId = supplier.id;
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (category !== undefined) updateData.category = category?.trim() || null;
    if (barcode !== undefined) updateData.barcode = barcode?.trim() || null;
    if (supplierPrice !== undefined) updateData.supplierPrice = parseFloat(supplierPrice) || null;
    if (customerPrice !== undefined) updateData.customerPrice = parseFloat(customerPrice);
    if (grossProfitPercentage !== undefined) updateData.grossProfitPercentage = grossProfitPercentage;
    if (currentQuantity !== undefined) updateData.currentQuantity = parseInt(currentQuantity) || 0;
    if (lowStockThreshold !== undefined) updateData.lowStockThreshold = parseInt(lowStockThreshold) || 0;
    if (reorderQuantity !== undefined) updateData.reorderQuantity = parseInt(reorderQuantity) || 0;
    if (lowStockAlerts !== undefined) updateData.lowStockAlerts = lowStockAlerts;
    if (enableCommission !== undefined) updateData.enableCommission = enableCommission;
    if (finalSupplierId !== undefined) updateData.supplierId = finalSupplierId || null;
    if (status !== undefined) updateData.status = status;

    const product = await ensureMinimumDelay(
      prisma.product.update({
        where: { id },
        data: updateData,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              status: true
            }
          }
        }
      })
    );

    const formattedProduct = {
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      supplierPrice: product.supplierPrice,
      customerPrice: product.customerPrice,
      grossProfitPercentage: product.grossProfitPercentage,
      currentQuantity: product.currentQuantity,
      lowStockThreshold: product.lowStockThreshold,
      reorderQuantity: product.reorderQuantity,
      lowStockAlerts: product.lowStockAlerts,
      enableCommission: product.enableCommission,
      supplier: product.supplier?.name || null,
      supplierId: product.supplierId,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };

    return successResponse(res, formattedProduct, 'Product updated successfully');
  } catch (error) {
    console.error('Update product error:', error);
    return errorResponse(res, 'Failed to update product', 500);
  }
};

// Delete product (hard delete)
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const where = {
      id,
      isDeleted: false
    };

    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    const existingProduct = await prisma.product.findFirst({ where });

    if (!existingProduct) {
      return errorResponse(res, 'Product not found', 404);
    }

    // Hard delete - actually remove from database
    await ensureMinimumDelay(
      prisma.product.delete({
        where: { id }
      })
    );

    // Soft delete code (commented out for reference):
    // await ensureMinimumDelay(
    //   prisma.product.update({
    //     where: { id },
    //     data: { isDeleted: true }
    //   })
    // );

    return successResponse(res, { id }, 'Product deleted successfully');
  } catch (error) {
    console.error('Delete product error:', error);
    return errorResponse(res, 'Failed to delete product', 500);
  }
};

// Delete multiple products (hard delete)
const deleteMultipleProducts = async (req, res) => {
  try {
    const { productIds } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return errorResponse(res, 'Product IDs array is required', 400);
    }

    const where = {
      id: { in: productIds },
      isDeleted: false
    };

    if (userRole !== constants.ROLES.ADMIN) {
      where.userId = userId;
    }

    // Hard delete - actually remove from database
    const deleteResult = await ensureMinimumDelay(
      prisma.product.deleteMany({
        where
      })
    );

    // Soft delete code (commented out for reference):
    // await ensureMinimumDelay(
    //   prisma.product.updateMany({
    //     where,
    //     data: { isDeleted: true }
    //   })
    // );

    return successResponse(res, { deletedCount: deleteResult.count }, 'Products deleted successfully');
  } catch (error) {
    console.error('Delete multiple products error:', error);
    return errorResponse(res, 'Failed to delete products', 500);
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteMultipleProducts
};
