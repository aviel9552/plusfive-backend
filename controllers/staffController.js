const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const stripe = require('../lib/stripe').stripe;
const { checkUserSubscription } = require('../lib/subscriptionUtils');
const { constants } = require('../config');
const { uploadImage, deleteImage, extractPublicId } = require('../lib/cloudinary');

// Get all staff for the logged-in user
const getAllStaff = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Build where clause based on role
    const where = {
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const staff = await prisma.staff.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        },
        operatingHours: {
          orderBy: [
            { day: 'asc' },
            { startTime: 'asc' }
          ]
        }
      }
    });

    // Transform operating hours from array to object format for frontend
    const staffWithWorkingHours = staff.map(s => {
      const workingHours = {};
      s.operatingHours.forEach(oh => {
        workingHours[oh.day] = {
          startTime: oh.startTime,
          endTime: oh.endTime,
          active: oh.isActive
        };
      });
      return {
        ...s,
        workingHours
      };
    });

    return successResponse(res, {
      staff: staffWithWorkingHours,
      total: staffWithWorkingHours.length
    });

  } catch (error) {
    console.error('Get all staff error:', error);
    return errorResponse(res, 'Failed to fetch staff', 500);
  }
};

// Get staff by ID
const getStaffById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const where = {
      id,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const staff = await prisma.staff.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            email: true
          }
        },
        operatingHours: {
          orderBy: [
            { day: 'asc' },
            { startTime: 'asc' }
          ]
        }
      }
    });

    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    // Transform operating hours from array to object format for frontend
    const workingHours = {};
    staff.operatingHours.forEach(oh => {
      workingHours[oh.day] = {
        startTime: oh.startTime,
        endTime: oh.endTime,
        active: oh.isActive
      };
    });

    return successResponse(res, {
      ...staff,
      workingHours
    });

  } catch (error) {
    console.error('Get staff by ID error:', error);
    return errorResponse(res, 'Failed to fetch staff', 500);
  }
};

// Create new staff
const createStaff = async (req, res) => {
  try {
    const { fullName, phone, email, city, address } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!fullName || !phone) {
      return errorResponse(res, 'Full name and phone are required', 400);
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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to create staff.', 403);
    }

    // Handle image upload if file is present
    let imageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadImage(req.file.buffer, constants.CLOUDINARY_FOLDERS.STAFF);
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return errorResponse(res, 'Failed to upload image', 500);
      }
    }

    // Create staff
    const staff = await prisma.staff.create({
      data: {
        fullName,
        phone,
        email: email || null,
        city: city || null,
        address: address || null,
        image: imageUrl,
        businessId: userId
      },
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

    return successResponse(res, staff, 'Staff created successfully', 201);

  } catch (error) {
    console.error('Create staff error:', error);
    return errorResponse(res, 'Failed to create staff', 500);
  }
};

// Update staff
const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, email, city, address, isActive } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if staff exists and belongs to user
    const where = {
      id,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const existingStaff = await prisma.staff.findFirst({ where });

    if (!existingStaff) {
      return errorResponse(res, 'Staff not found', 404);
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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to update staff.', 403);
    }

    // Validate required fields if provided
    if (fullName !== undefined && !fullName) {
      return errorResponse(res, 'Full name cannot be empty', 400);
    }

    if (phone !== undefined && !phone) {
      return errorResponse(res, 'Phone cannot be empty', 400);
    }

    // Handle image upload if new file is present
    let imageUrl = existingStaff.image; // Keep existing image by default
    if (req.file) {
      try {
        // Delete old image from Cloudinary if it exists
        if (existingStaff.image) {
          const oldPublicId = extractPublicId(existingStaff.image);
          if (oldPublicId) {
            try {
              await deleteImage(oldPublicId);
            } catch (deleteError) {
              console.error('Error deleting old image:', deleteError);
              // Continue even if deletion fails
            }
          }
        }

        // Upload new image
        const uploadResult = await uploadImage(req.file.buffer, constants.CLOUDINARY_FOLDERS.STAFF);
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return errorResponse(res, 'Failed to upload image', 500);
      }
    }

    // Update staff
    const staff = await prisma.staff.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email: email || null }),
        ...(city !== undefined && { city: city || null }),
        ...(address !== undefined && { address: address || null }),
        ...(isActive !== undefined && { isActive }),
        ...(req.file && { image: imageUrl }) // Update image only if new file was uploaded
      },
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

    return successResponse(res, staff, 'Staff updated successfully');

  } catch (error) {
    console.error('Update staff error:', error);
    return errorResponse(res, 'Failed to update staff', 500);
  }
};

// Delete staff (soft delete)
const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if staff exists and belongs to user
    const where = {
      id,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const existingStaff = await prisma.staff.findFirst({ where });

    if (!existingStaff) {
      return errorResponse(res, 'Staff not found', 404);
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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to delete staff.', 403);
    }

    // Delete image from Cloudinary if it exists
    if (existingStaff.image) {
      try {
        const publicId = extractPublicId(existingStaff.image);
        if (publicId) {
          await deleteImage(publicId);
        }
      } catch (deleteError) {
        console.error('Error deleting image from Cloudinary:', deleteError);
        // Continue with soft delete even if image deletion fails
      }
    }

    // Soft delete
    await prisma.staff.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false
      }
    });

    return successResponse(res, null, 'Staff deleted successfully');

  } catch (error) {
    console.error('Delete staff error:', error);
    return errorResponse(res, 'Failed to delete staff', 500);
  }
};

// Delete multiple staff (bulk delete)
const deleteMultipleStaff = async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'Staff IDs array is required', 400);
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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to delete staff.', 403);
    }

    // Build where clause
    const where = {
      id: { in: ids },
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    // Get staff members to delete their images
    const staffToDelete = await prisma.staff.findMany({
      where,
      select: { id: true, image: true }
    });

    // Delete images from Cloudinary
    for (const staff of staffToDelete) {
      if (staff.image) {
        try {
          const publicId = extractPublicId(staff.image);
          if (publicId) {
            await deleteImage(publicId);
          }
        } catch (deleteError) {
          console.error(`Error deleting image for staff ${staff.id}:`, deleteError);
          // Continue even if image deletion fails
        }
      }
    }

    // Soft delete all
    await prisma.staff.updateMany({
      where,
      data: {
        isDeleted: true,
        isActive: false
      }
    });

    return successResponse(res, { deletedCount: ids.length }, 'Staff deleted successfully');

  } catch (error) {
    console.error('Delete multiple staff error:', error);
    return errorResponse(res, 'Failed to delete staff', 500);
  }
};

// ==================== Staff Operating Hours CRUD Operations ====================

// Get operating hours for a staff member
const getStaffOperatingHours = async (req, res) => {
  try {
    const { staffId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Verify staff exists and belongs to user
    const where = {
      id: staffId,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const staff = await prisma.staff.findFirst({ where });

    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    // Get operating hours for this staff member
    const operatingHours = await prisma.staffOperatingHours.findMany({
      where: { staffId },
      orderBy: [
        { day: 'asc' },
        { startTime: 'asc' }
      ]
    });

    return successResponse(res, {
      staffId,
      operatingHours,
      total: operatingHours.length
    });

  } catch (error) {
    console.error('Get staff operating hours error:', error);
    return errorResponse(res, 'Failed to fetch operating hours', 500);
  }
};

// Create or update operating hours for a staff member (bulk upsert)
const upsertStaffOperatingHours = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { workingHours } = req.body; // Frontend format: { 'א\'': { startTime, endTime, active }, ... }
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Verify staff exists and belongs to user first
    const where = {
      id: staffId,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const staff = await prisma.staff.findFirst({ where });

    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    // Get existing operating hours to merge with new data
    const existingHours = await prisma.staffOperatingHours.findMany({
      where: { staffId }
    });

    // Convert existing hours to object format for easy merging
    const existingHoursObj = {};
    existingHours.forEach(oh => {
      existingHoursObj[oh.day] = {
        startTime: oh.startTime,
        endTime: oh.endTime,
        active: oh.isActive
      };
    });

    // Validate input - accept both formats for flexibility
    let newWorkingHoursObj = {};
    
    if (req.body.operatingHours && Array.isArray(req.body.operatingHours)) {
      // Backend format: array of objects - convert to object format
      req.body.operatingHours.forEach(hour => {
        if (hour.day) {
          newWorkingHoursObj[hour.day] = {
            startTime: hour.startTime || hour.start,
            endTime: hour.endTime || hour.ending || hour.end,
            active: hour.active !== undefined ? hour.active : (hour.isActive !== undefined ? hour.isActive : true)
          };
        }
      });
    } else if (workingHours && typeof workingHours === 'object') {
      // Frontend format: object with day keys
      Object.entries(workingHours).forEach(([day, data]) => {
        if (data && typeof data === 'object') {
          newWorkingHoursObj[day] = {
            startTime: data.startTime || data.start,
            endTime: data.endTime || data.ending || data.end,
            active: data.active !== undefined ? data.active : (data.isActive !== undefined ? data.isActive : true)
          };
        }
      });
    } else {
      return errorResponse(res, 'Operating hours data is required (workingHours object or operatingHours array)', 400);
    }

    // Merge new data with existing data (new data takes precedence)
    const mergedWorkingHours = { ...existingHoursObj, ...newWorkingHoursObj };

    // Convert to array and filter out entries without both startTime and endTime
    let operatingHoursArray = Object.entries(mergedWorkingHours)
      .map(([day, data]) => ({
        day,
        startTime: data.startTime,
        endTime: data.endTime,
        isActive: data.active !== undefined ? data.active : true
      }))
      .filter(hour => hour.startTime && hour.endTime); // Only include entries with both times

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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to manage operating hours.', 403);
    }

    // Validate each operating hour entry
    for (const hour of operatingHoursArray) {
      if (!hour.day || !hour.startTime || !hour.endTime) {
        return errorResponse(res, 'Each operating hour must have day, startTime, and endTime', 400);
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(hour.startTime) || !timeRegex.test(hour.endTime)) {
        return errorResponse(res, 'Time format must be HH:MM (24-hour format)', 400);
      }

      // Validate that endTime is after startTime
      const [startHour, startMin] = hour.startTime.split(':').map(Number);
      const [endHour, endMin] = hour.endTime.split(':').map(Number);
      const startTotalMinutes = startHour * 60 + startMin;
      const endTotalMinutes = endHour * 60 + endMin;

      if (endTotalMinutes <= startTotalMinutes) {
        return errorResponse(res, `End time must be after start time for ${hour.day}`, 400);
      }
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing operating hours for this staff
      await tx.staffOperatingHours.deleteMany({
        where: { staffId }
      });

      // Create new operating hours
      const createdHours = await Promise.all(
        operatingHoursArray.map((hour) =>
          tx.staffOperatingHours.create({
            data: {
              staffId,
              day: hour.day,
              startTime: hour.startTime,
              endTime: hour.endTime,
              isActive: hour.isActive !== undefined ? hour.isActive : true
            }
          })
        )
      );

      return createdHours;
    });

    // Transform back to frontend format
    const workingHoursResponse = {};
    result.forEach(oh => {
      workingHoursResponse[oh.day] = {
        startTime: oh.startTime,
        endTime: oh.endTime,
        active: oh.isActive
      };
    });

    return successResponse(res, {
      staffId,
      workingHours: workingHoursResponse,
      operatingHours: result, // Also include array format for backward compatibility
      total: result.length
    }, 'Operating hours updated successfully');

  } catch (error) {
    console.error('Upsert staff operating hours error:', error);
    return errorResponse(res, 'Failed to update operating hours', 500);
  }
};

// Update a single operating hour entry
const updateStaffOperatingHour = async (req, res) => {
  try {
    const { id } = req.params; // Operating hour ID
    const { day, startTime, endTime, isActive } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Find the operating hour and verify staff ownership
    const operatingHour = await prisma.staffOperatingHours.findUnique({
      where: { id },
      include: {
        staff: {
          select: {
            id: true,
            businessId: true,
            isDeleted: true
          }
        }
      }
    });

    if (!operatingHour) {
      return errorResponse(res, 'Operating hour not found', 404);
    }

    // Verify staff belongs to user and is not deleted
    if (operatingHour.staff.isDeleted) {
      return errorResponse(res, 'Staff not found', 404);
    }

    if (userRole !== constants.ROLES.ADMIN && operatingHour.staff.businessId !== userId) {
      return errorResponse(res, 'Unauthorized', 403);
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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to update operating hours.', 403);
    }

    // Validate time format if provided
    if (startTime || endTime) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      const finalStartTime = startTime || operatingHour.startTime;
      const finalEndTime = endTime || operatingHour.endTime;

      if (startTime && !timeRegex.test(startTime)) {
        return errorResponse(res, 'Start time format must be HH:MM (24-hour format)', 400);
      }

      if (endTime && !timeRegex.test(endTime)) {
        return errorResponse(res, 'End time format must be HH:MM (24-hour format)', 400);
      }

      // Validate that endTime is after startTime
      const [startHour, startMin] = finalStartTime.split(':').map(Number);
      const [endHour, endMin] = finalEndTime.split(':').map(Number);
      const startTotalMinutes = startHour * 60 + startMin;
      const endTotalMinutes = endHour * 60 + endMin;

      if (endTotalMinutes <= startTotalMinutes) {
        return errorResponse(res, 'End time must be after start time', 400);
      }
    }

    // Update operating hour
    const updated = await prisma.staffOperatingHours.update({
      where: { id },
      data: {
        ...(day !== undefined && { day }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        staff: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    return successResponse(res, updated, 'Operating hour updated successfully');

  } catch (error) {
    console.error('Update staff operating hour error:', error);
    return errorResponse(res, 'Failed to update operating hour', 500);
  }
};

// Delete a single operating hour entry
const deleteStaffOperatingHour = async (req, res) => {
  try {
    const { id } = req.params; // Operating hour ID
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Find the operating hour and verify staff ownership
    const operatingHour = await prisma.staffOperatingHours.findUnique({
      where: { id },
      include: {
        staff: {
          select: {
            id: true,
            businessId: true,
            isDeleted: true
          }
        }
      }
    });

    if (!operatingHour) {
      return errorResponse(res, 'Operating hour not found', 404);
    }

    // Verify staff belongs to user and is not deleted
    if (operatingHour.staff.isDeleted) {
      return errorResponse(res, 'Staff not found', 404);
    }

    if (userRole !== constants.ROLES.ADMIN && operatingHour.staff.businessId !== userId) {
      return errorResponse(res, 'Unauthorized', 403);
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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to delete operating hours.', 403);
    }

    // Delete operating hour
    await prisma.staffOperatingHours.delete({
      where: { id }
    });

    return successResponse(res, null, 'Operating hour deleted successfully');

  } catch (error) {
    console.error('Delete staff operating hour error:', error);
    return errorResponse(res, 'Failed to delete operating hour', 500);
  }
};

// Delete all operating hours for a staff member
const deleteAllStaffOperatingHours = async (req, res) => {
  try {
    const { staffId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Verify staff exists and belongs to user
    const where = {
      id: staffId,
      isDeleted: false,
      ...(userRole !== constants.ROLES.ADMIN && { businessId: userId })
    };

    const staff = await prisma.staff.findFirst({ where });

    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
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
      return errorResponse(res, subscriptionMessage || 'No active subscription found. Please subscribe to delete operating hours.', 403);
    }

    // Delete all operating hours for this staff
    const result = await prisma.staffOperatingHours.deleteMany({
      where: { staffId }
    });

    return successResponse(res, { deletedCount: result.count }, 'All operating hours deleted successfully');

  } catch (error) {
    console.error('Delete all staff operating hours error:', error);
    return errorResponse(res, 'Failed to delete operating hours', 500);
  }
};

module.exports = {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  deleteMultipleStaff,
  // Staff Operating Hours
  getStaffOperatingHours,
  upsertStaffOperatingHours,
  updateStaffOperatingHour,
  deleteStaffOperatingHour,
  deleteAllStaffOperatingHours
};
