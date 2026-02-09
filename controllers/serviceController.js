const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const stripe = require('../lib/stripe').stripe;
const { checkUserSubscription } = require('../lib/subscriptionUtils');
const { constants } = require('../config');

// Get all services for the logged-in user
const getAllServices = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Build where clause based on role
    const where = {
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const services = await prisma.service.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        }
      }
    });

    return successResponse(res, {
      services,
      total: services.length
    });

  } catch (error) {
    console.error('Get all services error:', error);
    return errorResponse(res, 'Failed to fetch services', 500);
  }
};

// Get service by ID
const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const where = {
      id,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const service = await prisma.service.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        }
      }
    });

    if (!service) {
      return errorResponse(res, 'Service not found', 404);
    }

    return successResponse(res, service);

  } catch (error) {
    console.error('Get service by ID error:', error);
    return errorResponse(res, 'Failed to fetch service', 500);
  }
};

// Create new service
const createService = async (req, res) => {
  try {
    const { name, notes, category, categoryId, price, duration, color, hideFromClients, earliestTimeToBook, latestTimeToBook, availableDays } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!name || !name.trim()) {
      return errorResponse(res, 'Service name is required', 400);
    }

    if (price === undefined || price === null || price < 0) {
      return errorResponse(res, 'Valid price is required', 400);
    }

    if (!duration || duration <= 0) {
      return errorResponse(res, 'Valid duration (in minutes) is required', 400);
    }

    // Check if user exists and fetch subscription info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        stripeSubscriptionId: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check subscription status
    const { hasActiveSubscription, message: subscriptionMessage } = await checkUserSubscription(user);

    if (!hasActiveSubscription) {
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to create services.', 403);
    }

    // Validate categoryId if provided
    if (categoryId) {
      const categoryExists = await prisma.category.findFirst({
        where: {
          id: categoryId,
          userId,
          isDeleted: false
        }
      });
      if (!categoryExists) {
        return errorResponse(res, 'Category not found', 404);
      }
    }

    // Create service (categoryId set via raw SQL - Prisma client may not include it until regenerated)
    const serviceData = {
      name: name.trim(),
      notes: notes?.trim() || null,
      category: category?.trim() || null,
      price: parseFloat(price),
      duration: parseInt(duration),
      color: color || '#FF257C',
      hideFromClients: hideFromClients || false,
      earliestTimeToBook: earliestTimeToBook?.trim() || null,
      latestTimeToBook: latestTimeToBook?.trim() || null,
      availableDays: Array.isArray(availableDays) ? availableDays : [],
      businessId: userId
    };

    const service = await prisma.service.create({
      data: serviceData,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        }
      }
    });

    // Assign new service to all active team members by default
    const activeStaff = await prisma.staff.findMany({
      where: {
        businessId: userId,
        isDeleted: false,
        isActive: true
      },
      select: { id: true }
    });
    if (activeStaff.length > 0) {
      await prisma.staffService.createMany({
        data: activeStaff.map((s) => ({
          staffId: s.id,
          serviceId: service.id,
          isActive: true
        }))
      });
    }

    // Set categoryId via raw SQL (Prisma client may not support it until prisma generate is run)
    if (categoryId) {
      await prisma.$executeRaw`UPDATE "services" SET "categoryId" = ${categoryId} WHERE id = ${service.id}`;
      service.categoryId = categoryId;
    }

    return successResponse(res, service, 'Service created successfully', 201);

  } catch (error) {
    console.error('Create service error:', error);
    return errorResponse(res, 'Failed to create service', 500);
  }
};

// Update service
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, notes, category, categoryId, price, duration, color, hideFromClients, isActive, earliestTimeToBook, latestTimeToBook, availableDays } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if service exists and belongs to user
    const where = {
      id,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const existingService = await prisma.service.findFirst({ where });

    if (!existingService) {
      return errorResponse(res, 'Service not found', 404);
    }

    // Fetch user to check subscription status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        stripeSubscriptionId: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check subscription status
    const { hasActiveSubscription, message: subscriptionMessage } = await checkUserSubscription(user);

    if (!hasActiveSubscription) {
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to update services.', 403);
    }

    // Validate required fields if provided
    if (name !== undefined && !name.trim()) {
      return errorResponse(res, 'Service name cannot be empty', 400);
    }

    if (price !== undefined && (price < 0 || isNaN(price))) {
      return errorResponse(res, 'Price must be a valid positive number', 400);
    }

    if (duration !== undefined && (duration <= 0 || isNaN(duration))) {
      return errorResponse(res, 'Duration must be a valid positive number', 400);
    }

    // Validate categoryId if provided
    if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
      const categoryExists = await prisma.category.findFirst({
        where: {
          id: categoryId,
          userId,
          isDeleted: false
        }
      });
      if (!categoryExists) {
        return errorResponse(res, 'Category not found', 404);
      }
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (category !== undefined) updateData.category = category?.trim() || null;
    // categoryId: handled separately via raw SQL (Prisma client may not include it until regenerated)
    const categoryIdToSet = categoryId !== undefined ? (categoryId || null) : undefined;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (duration !== undefined) updateData.duration = parseInt(duration);
    if (color !== undefined) updateData.color = color || '#FF257C';
    if (hideFromClients !== undefined) updateData.hideFromClients = hideFromClients;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (earliestTimeToBook !== undefined) updateData.earliestTimeToBook = earliestTimeToBook?.trim() || null;
    if (latestTimeToBook !== undefined) updateData.latestTimeToBook = latestTimeToBook?.trim() || null;
    if (availableDays !== undefined) updateData.availableDays = Array.isArray(availableDays) ? availableDays : [];

    // Update service
    const service = await prisma.service.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        }
      }
    });

    // Update categoryId via raw SQL (Prisma client may not support it until prisma generate is run)
    if (categoryIdToSet !== undefined) {
      await prisma.$executeRaw`UPDATE "services" SET "categoryId" = ${categoryIdToSet} WHERE id = ${id}`;
      service.categoryId = categoryIdToSet;
    }

    return successResponse(res, service, 'Service updated successfully');

  } catch (error) {
    console.error('Update service error:', error);
    return errorResponse(res, 'Failed to update service', 500);
  }
};

// Delete service (soft delete)
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if service exists and belongs to user
    const where = {
      id,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const existingService = await prisma.service.findFirst({ where });

    if (!existingService) {
      return errorResponse(res, 'Service not found', 404);
    }

    // Fetch user to check subscription status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        stripeSubscriptionId: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check subscription status
    const { hasActiveSubscription, message: subscriptionMessage } = await checkUserSubscription(user);

    if (!hasActiveSubscription) {
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to delete services.', 403);
    }

    // Soft delete
    await prisma.service.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false
      }
    });

    return successResponse(res, null, 'Service deleted successfully');

  } catch (error) {
    console.error('Delete service error:', error);
    return errorResponse(res, 'Failed to delete service', 500);
  }
};

// Delete multiple services (bulk delete)
const deleteMultipleServices = async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'Service IDs array is required', 400);
    }

    // Fetch user to check subscription status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        stripeSubscriptionId: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check subscription status
    const { hasActiveSubscription, message: subscriptionMessage } = await checkUserSubscription(user);

    if (!hasActiveSubscription) {
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to delete services.', 403);
    }

    // Build where clause
    const where = {
      id: { in: ids },
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    // Soft delete all
    await prisma.service.updateMany({
      where,
      data: {
        isDeleted: true,
        isActive: false
      }
    });

    return successResponse(res, { deletedCount: ids.length }, 'Services deleted successfully');

  } catch (error) {
    console.error('Delete multiple services error:', error);
    return errorResponse(res, 'Failed to delete services', 500);
  }
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  deleteMultipleServices
};
