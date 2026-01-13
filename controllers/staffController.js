const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const stripe = require('../lib/stripe').stripe;

// Helper function to check if user has active subscription (Stripe API only)
const checkUserSubscription = async (user) => {
  // Admin users don't need subscription
  if (user.role === 'admin') {
    return { hasActiveSubscription: true };
  }

  // Check Stripe API directly - no database fallback
  if (!user.stripeSubscriptionId) {
    return { hasActiveSubscription: false, reason: 'No subscription found. Please subscribe to continue.' };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    
    // Check subscription status from Stripe
    const stripeStatus = subscription.status?.toLowerCase();
    if (!stripeStatus || 
        stripeStatus === 'canceled' || 
        stripeStatus === 'unpaid' ||
        stripeStatus === 'past_due' ||
        stripeStatus === 'incomplete' ||
        stripeStatus === 'incomplete_expired') {
      return { hasActiveSubscription: false, reason: 'Subscription not active' };
    }

    // Check current_period_end from Stripe (Unix timestamp in seconds)
    if (subscription.current_period_end) {
      const expiryTimestamp = subscription.current_period_end * 1000; // Convert to milliseconds
      const now = Date.now();
      if (expiryTimestamp < now) {
        return { hasActiveSubscription: false, reason: 'Subscription expired' };
      }
    }

    // Stripe subscription is active and not expired
    return { hasActiveSubscription: true };
  } catch (stripeError) {
    // If Stripe API call fails, return false
    console.error('Error checking Stripe subscription:', stripeError.message);
    return { hasActiveSubscription: false, reason: 'Failed to verify subscription. Please try again.' };
  }
};

// Get all staff for the logged-in user
const getAllStaff = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Build where clause based on role
    const where = {
      isDeleted: false,
      ...(userRole !== 'admin' && { businessId: userId })
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
        }
      }
    });

    return successResponse(res, {
      staff,
      total: staff.length
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
      ...(userRole !== 'admin' && { businessId: userId })
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
        }
      }
    });

    if (!staff) {
      return errorResponse(res, 'Staff not found', 404);
    }

    return successResponse(res, staff);

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

    // Create staff
    const staff = await prisma.staff.create({
      data: {
        fullName,
        phone,
        email: email || null,
        city: city || null,
        address: address || null,
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
    const { fullName, phone, email, city, address } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if staff exists and belongs to user
    const where = {
      id,
      isDeleted: false,
      ...(userRole !== 'admin' && { businessId: userId })
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

    // Update staff
    const staff = await prisma.staff.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email: email || null }),
        ...(city !== undefined && { city: city || null }),
        ...(address !== undefined && { address: address || null })
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
      ...(userRole !== 'admin' && { businessId: userId })
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
      ...(userRole !== 'admin' && { businessId: userId })
    };

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

module.exports = {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  deleteMultipleStaff
};
