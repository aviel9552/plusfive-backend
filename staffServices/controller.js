const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { constants } = require('../config');

// Helper function to convert minutes (integer) to Hebrew duration string
const minutesToDurationString = (minutes) => {
  if (!minutes || minutes === 0) return "30 דק'";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    if (hours === 2 && mins === 0) return "שעתיים";
    if (mins > 0) {
      return `${hours} שעה${hours > 1 ? 'ים' : ''} ו-${mins} דק'`;
    }
    return hours === 1 ? "שעה" : `${hours} שעות`;
  }
  return `${mins} דק'`;
};

// Add or update service for staff
// If service doesn't exist, create it
// If service exists but is_active = 0, reactivate it and update price
// If service exists and is_active = 1, update price
const addOrUpdateStaffService = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { serviceId, priceOverride, durationOverride } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Validate required fields
    if (!serviceId) {
      return errorResponse(res, 'Service ID is required', 400);
    }

    // Verify staff exists and belongs to user
    const where = {
      id: staffId,
      isDeleted: false
    };
    if (userRole !== constants.ROLES.ADMIN) {
      where.businessId = userId;
    }

    const staff = await prisma.staff.findFirst({ where });
    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    // Verify service exists and belongs to user
    const serviceWhere = {
      id: serviceId,
      isDeleted: false
    };
    if (userRole !== constants.ROLES.ADMIN) {
      serviceWhere.businessId = userId;
    }

    const service = await prisma.service.findFirst({ where: serviceWhere });
    if (!service) {
      return errorResponse(res, 'Service not found', 404);
    }

    // Check if staff-service relationship already exists
    const existingStaffService = await prisma.staffService.findUnique({
      where: {
        staffId_serviceId: {
          staffId,
          serviceId
        }
      }
    });

    if (existingStaffService) {
      // Update existing relationship
      // If is_active = 0, reactivate it
      // Update price_override and duration_override
      const updateData = {
        isActive: true,
        updatedAt: new Date()
      };

      if (priceOverride !== undefined) {
        updateData.priceOverride = priceOverride;
      } else if (existingStaffService.priceOverride !== null) {
        updateData.priceOverride = existingStaffService.priceOverride;
      }

      if (durationOverride !== undefined) {
        updateData.durationOverride = durationOverride;
      } else if (existingStaffService.durationOverride !== null) {
        updateData.durationOverride = existingStaffService.durationOverride;
      }

      const updatedStaffService = await prisma.staffService.update({
        where: {
          id: existingStaffService.id
        },
        data: updateData,
        include: {
          service: {
            select: {
              id: true,
              name: true,
              price: true,
              duration: true,
              category: true
            }
          }
        }
      });

      return successResponse(res, updatedStaffService, 'Staff service updated successfully');
    } else {
      // Create new relationship
      const newStaffService = await prisma.staffService.create({
        data: {
          staffId,
          serviceId,
          priceOverride: priceOverride !== undefined ? priceOverride : null,
          durationOverride: durationOverride !== undefined ? durationOverride : null,
          isActive: true
        },
        include: {
          service: {
            select: {
              id: true,
              name: true,
              price: true,
              duration: true,
              category: true
            }
          }
        }
      });

      return successResponse(res, newStaffService, 'Staff service added successfully', 201);
    }

  } catch (error) {
    console.error('Add or update staff service error:', error);
    return errorResponse(res, 'Failed to add or update staff service', 500);
  }
};

// Remove service from staff (soft delete - set is_active = 0)
const removeStaffService = async (req, res) => {
  try {
    const { staffId, serviceId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Verify staff exists and belongs to user
    const where = {
      id: staffId,
      isDeleted: false
    };
    if (userRole !== constants.ROLES.ADMIN) {
      where.businessId = userId;
    }

    const staff = await prisma.staff.findFirst({ where });
    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    // Find staff-service relationship
    const staffService = await prisma.staffService.findUnique({
      where: {
        staffId_serviceId: {
          staffId,
          serviceId
        }
      }
    });

    if (!staffService) {
      return errorResponse(res, 'Staff service relationship not found', 404);
    }

    // Soft delete - set is_active = 0 (never actually delete)
    const updatedStaffService = await prisma.staffService.update({
      where: {
        id: staffService.id
      },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    return successResponse(res, updatedStaffService, 'Staff service removed successfully');

  } catch (error) {
    console.error('Remove staff service error:', error);
    return errorResponse(res, 'Failed to remove staff service', 500);
  }
};

// Get all services for a staff member (only active ones)
const getStaffServices = async (req, res) => {
  try {
    const { staffId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Verify staff exists and belongs to user
    const where = {
      id: staffId,
      isDeleted: false
    };
    if (userRole !== constants.ROLES.ADMIN) {
      where.businessId = userId;
    }

    const staff = await prisma.staff.findFirst({ where });
    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    // Get all active staff services
    const staffServices = await prisma.staffService.findMany({
      where: {
        staffId,
        isActive: true // Only show active services
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
            duration: true,
            category: true,
            color: true,
            notes: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Transform to include final price and duration (override or service base)
    const servicesWithFinalValues = staffServices.map(ss => {
      // If durationOverride exists (string), use it; otherwise convert service.duration (int) to string
      const finalDuration = ss.durationOverride !== null && ss.durationOverride !== undefined
        ? ss.durationOverride
        : minutesToDurationString(ss.service.duration);
      
      return {
        id: ss.id,
        staffId: ss.staffId,
        serviceId: ss.serviceId,
        priceOverride: ss.priceOverride,
        durationOverride: ss.durationOverride,
        finalPrice: ss.priceOverride !== null ? ss.priceOverride : ss.service.price,
        finalDuration: finalDuration,
        isActive: ss.isActive,
        service: ss.service,
        createdAt: ss.createdAt,
        updatedAt: ss.updatedAt
      };
    });

    return successResponse(res, {
      services: servicesWithFinalValues,
      total: servicesWithFinalValues.length
    });

  } catch (error) {
    console.error('Get staff services error:', error);
    return errorResponse(res, 'Failed to fetch staff services', 500);
  }
};

// Get all available services for a staff member (including ones not assigned)
// This is useful for showing all services with indication of which are assigned
const getAvailableServicesForStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Verify staff exists and belongs to user
    const where = {
      id: staffId,
      isDeleted: false
    };
    if (userRole !== constants.ROLES.ADMIN) {
      where.businessId = userId;
    }

    const staff = await prisma.staff.findFirst({ where });
    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    // Get all services for this business
    const serviceWhere = {
      isDeleted: false,
      isActive: true
    };
    if (userRole !== constants.ROLES.ADMIN) {
      serviceWhere.businessId = userId;
    }

    const allServices = await prisma.service.findMany({
      where: serviceWhere,
      orderBy: { name: 'asc' }
    });

    // Get all staff services (including inactive ones for history)
    const staffServices = await prisma.staffService.findMany({
      where: {
        staffId
      },
      include: {
        service: true
      }
    });

    // Create a map of serviceId -> staffService
    const staffServiceMap = new Map();
    staffServices.forEach(ss => {
      staffServiceMap.set(ss.serviceId, ss);
    });

    // Combine services with staff service info
    const servicesWithStatus = allServices.map(service => {
      const staffService = staffServiceMap.get(service.id);
      return {
        id: service.id,
        name: service.name,
        basePrice: service.price,
        baseDuration: service.duration,
        category: service.category,
        color: service.color,
        notes: service.notes,
        isAssigned: staffService ? staffService.isActive : false,
        priceOverride: staffService?.priceOverride || null,
        durationOverride: staffService?.durationOverride || null,
        finalPrice: staffService?.priceOverride !== null && staffService?.priceOverride !== undefined
          ? staffService.priceOverride
          : service.price,
        finalDuration: staffService?.durationOverride !== null && staffService?.durationOverride !== undefined
          ? staffService.durationOverride
          : minutesToDurationString(service.duration),
        staffServiceId: staffService?.id || null
      };
    });

    // Sort: assigned services first, then unassigned
    servicesWithStatus.sort((a, b) => {
      if (a.isAssigned && !b.isAssigned) return -1;
      if (!a.isAssigned && b.isAssigned) return 1;
      return a.name.localeCompare(b.name);
    });

    return successResponse(res, {
      services: servicesWithStatus,
      total: servicesWithStatus.length
    });

  } catch (error) {
    console.error('Get available services for staff error:', error);
    return errorResponse(res, 'Failed to fetch available services', 500);
  }
};

module.exports = {
  addOrUpdateStaffService,
  removeStaffService,
  getStaffServices,
  getAvailableServicesForStaff
};
