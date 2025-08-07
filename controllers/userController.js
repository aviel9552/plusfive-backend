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
        accountStatus: true,
        adCampaignSource: true,
        affiliateId: true,
        affiliateLinkUrl: true,
        deviceInfo: true,
        landingPageUrl: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        termsAccepted: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        isActive: true,
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
        accountStatus: true,
        adCampaignSource: true,
        affiliateId: true,
        affiliateLinkUrl: true,
        deviceInfo: true,
        landingPageUrl: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        termsAccepted: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        isActive: true,
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
        accountStatus: true,
        adCampaignSource: true,
        affiliateId: true,
        affiliateLinkUrl: true,
        deviceInfo: true,
        landingPageUrl: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        termsAccepted: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        isActive: true,
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
        }
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
        accountStatus: true,
        adCampaignSource: true,
        affiliateId: true,
        affiliateLinkUrl: true,
        deviceInfo: true,
        landingPageUrl: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        termsAccepted: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        isActive: true,
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
        accountStatus: true,
        adCampaignSource: true,
        affiliateId: true,
        affiliateLinkUrl: true,
        deviceInfo: true,
        landingPageUrl: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        termsAccepted: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        isActive: true,
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
  console.log('updateUserById', req.body);
  try {
    const { id } = req.params;

    const updatedUser = await prisma.user.update({
      where: { id },
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
        accountStatus: true,
        adCampaignSource: true,
        affiliateId: true,
        affiliateLinkUrl: true,
        deviceInfo: true,
        landingPageUrl: true,
        subscriptionExpirationDate: true,
        subscriptionLtv: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        termsAccepted: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    return successResponse(res, updatedUser, 'User updated successfully');
  } catch (error) {
    console.error('Update user by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
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

module.exports = {
  createUser,
  getProfile,
  getUserById,
  getAllUsers,
  updateProfile,
  updateUserById,
  deleteUserById,
  changePassword
}; 