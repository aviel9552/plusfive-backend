const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { checkUserSubscription } = require('../lib/subscriptionUtils');
const { constants } = require('../config');

// Get business operating hours for the logged-in user
const getBusinessOperatingHours = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get operating hours for this user
    const operatingHours = await prisma.businessOperatingHours.findMany({
      where: { userId },
      orderBy: [
        { day: 'asc' },
        { startTime: 'asc' }
      ]
    });

    return successResponse(res, {
      userId,
      operatingHours,
      total: operatingHours.length
    });

  } catch (error) {
    console.error('Get business operating hours error:', error);
    return errorResponse(res, 'Failed to fetch operating hours', 500);
  }
};

// Create or update operating hours for the business (bulk upsert)
const upsertBusinessOperatingHours = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { workingHours } = req.body; // Frontend format: { 'א\'': { startTime, endTime }, ... }
    
    // Debug logging
    console.log('Received request body:', JSON.stringify(req.body, null, 2));
    console.log('Working hours:', JSON.stringify(workingHours, null, 2));

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

    // Convert to array and filter out entries without both startTime and endTime
    let operatingHoursArray = Object.entries(newWorkingHoursObj)
      .map(([day, data]) => ({
        day,
        startTime: data.startTime,
        endTime: data.endTime,
        isActive: data.active !== undefined ? data.active : (data.isActive !== undefined ? data.isActive : true)
      }))
      .filter(hour => hour.startTime && hour.endTime); // Only include entries with both times
    
    console.log('Processed operating hours array:', JSON.stringify(operatingHoursArray, null, 2));

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
      // Delete existing operating hours for this user
      await tx.businessOperatingHours.deleteMany({
        where: { userId }
      });

      // If no hours to create, return empty array
      if (operatingHoursArray.length === 0) {
        console.log('No operating hours to create, returning empty array');
        return [];
      }

      // Create new operating hours
      const createdHours = await Promise.all(
        operatingHoursArray.map((hour) => {
          console.log('Creating hour:', JSON.stringify(hour, null, 2));
          return tx.businessOperatingHours.create({
            data: {
              userId,
              day: hour.day,
              startTime: hour.startTime,
              endTime: hour.endTime,
              isActive: hour.isActive !== undefined ? hour.isActive : true
            }
          });
        })
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
      userId,
      workingHours: workingHoursResponse,
      operatingHours: result, // Also include array format for backward compatibility
      total: result.length
    }, 'Operating hours updated successfully');

  } catch (error) {
    console.error('Upsert business operating hours error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      meta: error.meta
    });
    return errorResponse(res, error.message || 'Failed to update operating hours', 500);
  }
};

// Update a single operating hour entry
const updateBusinessOperatingHour = async (req, res) => {
  try {
    const { id } = req.params; // Operating hour ID
    const { day, startTime, endTime, isActive } = req.body;
    const userId = req.user.userId;

    // Find the operating hour and verify user ownership
    const operatingHour = await prisma.businessOperatingHours.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true
          }
        }
      }
    });

    if (!operatingHour) {
      return errorResponse(res, 'Operating hour not found', 404);
    }

    // Verify operating hour belongs to user
    if (operatingHour.userId !== userId) {
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
    const updated = await prisma.businessOperatingHours.update({
      where: { id },
      data: {
        ...(day !== undefined && { day }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        user: {
          select: {
            id: true,
            businessName: true
          }
        }
      }
    });

    return successResponse(res, updated, 'Operating hour updated successfully');

  } catch (error) {
    console.error('Update business operating hour error:', error);
    return errorResponse(res, 'Failed to update operating hour', 500);
  }
};

// Delete a single operating hour entry
const deleteBusinessOperatingHour = async (req, res) => {
  try {
    const { id } = req.params; // Operating hour ID
    const userId = req.user.userId;

    // Find the operating hour and verify user ownership
    const operatingHour = await prisma.businessOperatingHours.findUnique({
      where: { id }
    });

    if (!operatingHour) {
      return errorResponse(res, 'Operating hour not found', 404);
    }

    // Verify operating hour belongs to user
    if (operatingHour.userId !== userId) {
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
    await prisma.businessOperatingHours.delete({
      where: { id }
    });

    return successResponse(res, null, 'Operating hour deleted successfully');

  } catch (error) {
    console.error('Delete business operating hour error:', error);
    return errorResponse(res, 'Failed to delete operating hour', 500);
  }
};

// Delete all operating hours for the business
const deleteAllBusinessOperatingHours = async (req, res) => {
  try {
    const userId = req.user.userId;

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

    // Delete all operating hours for this user
    const result = await prisma.businessOperatingHours.deleteMany({
      where: { userId }
    });

    return successResponse(res, { deletedCount: result.count }, 'All operating hours deleted successfully');

  } catch (error) {
    console.error('Delete all business operating hours error:', error);
    return errorResponse(res, 'Failed to delete operating hours', 500);
  }
};

module.exports = {
  getBusinessOperatingHours,
  upsertBusinessOperatingHours,
  updateBusinessOperatingHour,
  deleteBusinessOperatingHour,
  deleteAllBusinessOperatingHours
};
