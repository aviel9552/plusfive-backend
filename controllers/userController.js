const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { hashPassword, verifyPassword } = require('../lib/utils');
const { constants } = require('../config');

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

// Helper function to format Israeli phone numbers
const formatIsraeliPhone = (phoneNumber) => {
  if (!phoneNumber) return phoneNumber;
  
  // Remove all spaces and special characters
  let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // If starts with +972, replace with 0
  if (cleaned.startsWith('+972')) {
    return '0' + cleaned.substring(4);
  }
  
  // If starts with 972, replace with 0
  if (cleaned.startsWith('972')) {
    return '0' + cleaned.substring(3);
  }
  
  // If already starts with 0, return as is
  if (cleaned.startsWith('0')) {
    return cleaned;
  }
  
  // If starts with Israeli mobile prefix (5), add 0
  if (cleaned.startsWith('5') && cleaned.length === 9) {
    return '0' + cleaned;
  }
  
  return phoneNumber; // Return original if no pattern matches
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

    // Format phone numbers before sending response
    const formattedUser = {
      ...user,
      phoneNumber: formatIsraeliPhone(user.phoneNumber),
      whatsappNumber: formatIsraeliPhone(user.whatsappNumber)
    };

    return successResponse(res, formattedUser);
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
          not: constants.ROLES.ADMIN
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
    // Validate token payload
    if (!req.user || !req.user.userId) {
      return errorResponse(res, 'Invalid token: user ID not found. Please log in again.', 401);
    }

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
      return errorResponse(res, 'Account not found. It may have been deleted already.', 404);
    }

    if (existingUser.isDeleted) {
      return errorResponse(res, 'This account is already deactivated.', 400);
    }

    // Prevent admin users from being deleted
    if (existingUser.role === constants.ROLES.ADMIN) {
      return errorResponse(res, 'Admin accounts cannot be deactivated from this action.', 403);
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark user as deleted and inactive
      const updatedUser = await tx.user.update({
        where: { id: currentUserId },
        data: { 
          isDeleted: true,
          isActive: false 
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isDeleted: true,
          isActive: true,
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
          data: { isDeleted: true, isActive: false }
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

    return successResponse(res, result, `Account deactivated successfully. ${result.affectedCustomers} customer link(s) updated.`);
  } catch (error) {
    console.error('Soft delete user error:', error);

    // Prisma known error codes
    if (error.code === 'P2025') {
      return errorResponse(res, 'Account not found. It may have been deleted already.', 404);
    }
    if (error.code === 'P2003') {
      return errorResponse(res, 'Cannot deactivate account: related data must be resolved first.', 400);
    }
    if (error.code && error.code.startsWith('P')) {
      return errorResponse(res, 'Unable to deactivate account. Please try again later.', 400);
    }

    return errorResponse(res, 'Unable to deactivate account. Please try again later.', 500);
  }
};

module.exports = {
  createUser,
  getUserById,
  getAllUsers,
  updateUserById,
  deleteUserById,
  changePassword,
  softDeleteUser
}; 