const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { hashPassword, verifyPassword } = require('../lib/utils');

// Create user (admin only)
const createUser = async (req, res) => {
  try {
    const { email, password, ...userData } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        ...userData
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        businessName: true,
        businessType: true,
        address: true,
        whatsappNumber: true,
        directChatMessage: true,
        role: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        subscriptionStatus: true,
        isActive: true,
        isDeleted: false,
        createdAt: true,
        updatedAt: true,
      }
    });

    return successResponse(res, newUser, 'User created successfully', 201);
  } catch (error) {
    console.error('Create user error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        businessName: true,
        businessType: true,
        address: true,
        whatsappNumber: true,
        directChatMessage: true,
        role: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        subscriptionStatus: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, user);
  } catch (error) {
    console.error('Get profile error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get user by ID (admin only)
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        businessName: true,
        businessType: true,
        address: true,
        whatsappNumber: true,
        directChatMessage: true,
        role: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        subscriptionStatus: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, user);
  } catch (error) {
    console.error('Get user by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: {
          not: 'admin'
        },
        isDeleted: false // Exclude deleted users
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        businessName: true,
        businessType: true,
        address: true,
        whatsappNumber: true,
        directChatMessage: true,
        role: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        subscriptionStatus: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    return successResponse(res, users);
  } catch (error) {
    console.error('Get all users error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: req.body,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        businessName: true,
        businessType: true,
        address: true,
        whatsappNumber: true,
        directChatMessage: true,
        role: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        subscriptionStatus: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    return successResponse(res, updatedUser, 'Profile updated successfully');
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Update user by ID (admin only)
const updateUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Format phone number if provided
    let updateData = { ...req.body };
    let originalPhoneNumber = null;
    
    if (updateData.phoneNumber) {
      originalPhoneNumber = updateData.phoneNumber; // Store original for response
      updateData.phoneNumber = formatPhoneNumber(updateData.phoneNumber);
      updateData.whatsappNumber = updateData.phoneNumber;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        businessName: true,
        businessType: true,
        address: true,
        whatsappNumber: true,
        directChatMessage: true,
        role: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        subscriptionStatus: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Override phone number in response to show original formatted number
    if (originalPhoneNumber) {
      updatedUser.phoneNumber = originalPhoneNumber;
    }

    return successResponse(res, updatedUser, 'User updated successfully');
  } catch (error) {
    console.error('Update user by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Helper function to format phone number
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return phoneNumber;
  
  // Remove all non-digit characters
  let cleanNumber = phoneNumber.replace(/\D/g, '');
  
  // If number starts with 0, remove it
  if (cleanNumber.startsWith('0')) {
    cleanNumber = cleanNumber.substring(1);
  }
  
  // Add +972 prefix
  return `+972${cleanNumber}`;
};

// Delete user by ID (admin only)
const deleteUserById = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id }
    });

    return successResponse(res, null, 'User deleted successfully');
  } catch (error) {
    console.error('Delete user by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        email: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return errorResponse(res, 'Current password is incorrect', 400);
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword
      }
    });

    return successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Soft delete user account and update customer statuses
const softDeleteUser = async (req, res) => {
  try {
    // Get user ID from authenticated token
    const currentUserId = req.user.userId;

    // First, check if user exists and is not already deleted
    const existingUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        isDeleted: true,
        role: true
      }
    });

    if (!existingUser) {
      return errorResponse(res, 'User not found', 404);
    }

    if (existingUser.isDeleted) {
      return errorResponse(res, 'User is already deleted', 400);
    }

    // Prevent admin users from being deleted
    if (existingUser.role === 'admin') {
      return errorResponse(res, 'Admin users cannot be deleted', 403);
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark user as deleted
      const updatedUser = await tx.user.update({
        where: { id: currentUserId },
        data: { isDeleted: true },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isDeleted: true,
          updatedAt: true
        }
      });

      // 2. Find all customers assigned to this user
      const customerUsers = await tx.customerUser.findMany({
        where: { userId: currentUserId },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              customerPhone: true
            }
          }
        }
      });

      // 3. Update customer status to 'deleted' in CustomerUser table
      if (customerUsers.length > 0) {
        await tx.customerUser.updateMany({
          where: { userId: currentUserId },
          data: { isDeleted: true }
        });
      }

      return {
        user: updatedUser,
        affectedCustomers: customerUsers.length,
        customerDetails: customerUsers.map(cu => ({
          customerId: cu.customer.id,
          customerName: `${cu.customer.firstName || ''} ${cu.customer.lastName || ''}`.trim(),
          phone: cu.customer.customerPhone
        }))
      };
    });

    return successResponse(res, result, `User soft deleted successfully. ${result.affectedCustomers} customers affected.`);
  } catch (error) {
    console.error('Soft delete user error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  createUser,
  getProfile,
  getUserById,
  getAllUsers,
  updateProfile,
  updateUserById,
  deleteUserById,
  changePassword,
  softDeleteUser
}; 