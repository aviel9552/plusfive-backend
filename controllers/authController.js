const prisma = require('../lib/prisma');
const { successResponse, errorResponse, hashPassword, verifyPassword } = require('../lib/utils');
const { generateToken } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../lib/emailService');
const crypto = require('crypto');

// Register user
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, referralCode, phoneNumber, ...otherFields } = req.body;
    // Check if user already exists with this email (excluding soft deleted users)
    const existingUserByEmail = await prisma.user.findFirst({
      where: { 
        email,
        isDeleted: false  // Only check non-deleted users
      }
    });

    // Allow registration even if user exists - the compound unique constraint will handle it
    // if (existingUserByEmail) {
    //   return errorResponse(res, 'User with this email already exists', 400);
    // }

    // Check if user already exists with this phone number (excluding soft deleted users)
    if (phoneNumber) {
      // Format phone number before checking
      const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
      
      const existingUserByPhone = await prisma.user.findFirst({
        where: { 
          phoneNumber: formattedPhoneNumber,
          isDeleted: false  // Only check non-deleted users
        }
      });

      if (existingUserByPhone) {
        return errorResponse(res, 'User with this phone number already exists', 400);
      }
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Filter valid fields for user creation
    const validUserFields = {
      phoneNumber: phoneNumber ? formatPhoneNumber(phoneNumber) : phoneNumber,
      businessName: otherFields.businessName,
      businessType: otherFields.businessType,
      address: otherFields.address,
      whatsappNumber: otherFields.whatsappNumber,
      directChatMessage: otherFields.directChatMessage
    };

    // Generate random 6-character alphanumeric referral code for the new user
    const currentYear = new Date().getFullYear();
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = '';
    for (let i = 0; i < 6; i++) {
      randomCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const userReferralCode = `PLUSFIVE${currentYear}${randomCode}`;

    // Create user with only valid fields
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        referralCode: userReferralCode,
        ...validUserFields
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        referralCode: true,
        createdAt: true
      }
    });

    // If referral code provided, create referral
    if (referralCode) {
      try {
        // Find referrer by referral code
        const referrer = await prisma.user.findUnique({
          where: { referralCode: referralCode }
        });

        if (referrer && referrer.id !== user.id) {
          // Create referral
          await prisma.referral.create({
            data: {
              referrerId: referrer.id,
              referredUserId: user.id,
              status: 'pending',
              commission: 0
            }
          });
        }
      } catch (referralError) {
        console.error('Referral creation failed:', referralError);
        // Don't fail registration if referral fails
      }
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save verification token
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expires
      }
    });

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken, firstName);
      return successResponse(res, {
        user,
        message: 'Registration successful. Please check your email to verify your account.'
      }, 'User registered successfully');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return errorResponse(res, 'Registration successful but failed to send verification email. Please contact support.', 500);
    }
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle compound unique constraint errors
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('email')) {
        return errorResponse(res, 'User with this email already exists', 400);
      }
      if (error.meta?.target?.includes('businessName')) {
        return errorResponse(res, 'Business name already exists', 400);
      }
      if (error.meta?.target?.includes('phoneNumber')) {
        return errorResponse(res, 'Phone number already exists', 400);
      }
    }
    
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user (use findFirst since we have compound unique constraint)
    const user = await prisma.user.findFirst({
      where: { 
        email,
        isDeleted: false  // Only find active users
      }
    });

    if (!user) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Check if user is active
    if (!user.isActive) {
      return errorResponse(res, 'Account is deactivated', 401);
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return errorResponse(res, 'Please verify your email address before logging in. Check your email for verification link.', 401);
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Generate JWT token
    const token = generateToken(user.id, user.email, user.role);

    // Remove password from response and format phone number
    const { password: _, ...userWithoutPassword } = user;
    
    // Format phone number - remove +972 prefix
    if (userWithoutPassword.phoneNumber && userWithoutPassword.phoneNumber.startsWith('+972')) {
      userWithoutPassword.phoneNumber = '0' + userWithoutPassword.phoneNumber.substring(4);
    }

    return successResponse(res, {
      user: userWithoutPassword,
      token
    }, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Verify email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    // Find verification token
    const verification = await prisma.emailVerification.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!verification) {
      return errorResponse(res, 'Invalid verification token', 400);
    }

    if (verification.expires < new Date()) {
      return errorResponse(res, 'Verification token has expired', 400);
    }

    // Update user email verification
    await prisma.user.update({
      where: { id: verification.userId },
      data: { emailVerified: new Date() }
    });

    // Delete verification token
    await prisma.emailVerification.delete({
      where: { id: verification.id }
    });

    // Send welcome email
    try {
      await sendWelcomeEmail(verification.user.email, verification.user.firstName);
    } catch (emailError) {
      console.error('Welcome email sending failed:', emailError);
    }

    return successResponse(res, null, 'Email verified successfully');
  } catch (error) {
    console.error('Email verification error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Resend verification email
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    if (user.emailVerified) {
      return errorResponse(res, 'Email is already verified', 400);
    }

    // Delete existing verification tokens
    await prisma.emailVerification.deleteMany({
      where: { userId: user.id }
    });

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save new verification token
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expires
      }
    });

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken, user.firstName);
      return successResponse(res, null, 'Verification email sent successfully');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return errorResponse(res, 'Failed to send verification email. Please try again later.', 500);
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Return error if user doesn't exist
      return errorResponse(res, 'No account found with this email address', 404);
    }

    // Delete existing password reset tokens
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id }
    });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: resetToken,
        expires
      }
    });

    // Send password reset email
    try {
      await sendPasswordResetEmail(email, resetToken, user.firstName);
      return successResponse(res, null, 'Password reset email sent successfully. Please check your email.');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return errorResponse(res, 'Failed to send password reset email. Please try again later.', 500);
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params; // Get token from URL params
    const { password } = req.body;

    if (!token) {
      return errorResponse(res, 'Reset token is required', 400);
    }

    if (!password) {
      return errorResponse(res, 'New password is required', 400);
    }

    // Find reset token
    const resetToken = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!resetToken) {
      return errorResponse(res, 'Invalid reset token', 400);
    }

    if (resetToken.expires < new Date()) {
      return errorResponse(res, 'Reset token has expired', 400);
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword }
    });

    // Delete reset token
    await prisma.passwordReset.delete({
      where: { id: resetToken.id }
    });

    return successResponse(res, null, 'Password reset successfully');
  } catch (error) {
    console.error('Reset password error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Change password (authenticated user)
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      return errorResponse(res, 'Current password is incorrect', 400);
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    return successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Account soft delete - toggle isDeleted field
const accountSoftDelete = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    // Prevent admin from soft deleting their account
    if (userRole === 'admin') {
      return errorResponse(res, 'Admin accounts cannot be soft deleted', 403);
    }
    
    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isDeleted: true, role: true }
    });

    if (!currentUser) {
      return errorResponse(res, 'User not found', 404);
    }

    // Double check admin role from database
    if (currentUser.role === 'admin') {
      return errorResponse(res, 'Admin accounts cannot be soft deleted', 403);
    }

    // Toggle isDeleted field
    const newIsDeletedValue = !currentUser.isDeleted;

    // Update user's isDeleted status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isDeleted: newIsDeletedValue },
      select: {
        id: true,
        email: true,
        businessName: true,
        isDeleted: true,
        isActive: false
      }
    });

    return successResponse(res, {
      user: updatedUser,
      message: newIsDeletedValue ? 'Account soft deleted successfully' : 'Account restored successfully'
    }, newIsDeletedValue ? 'Account soft deleted' : 'Account restored');

  } catch (error) {
    console.error('Account soft delete error:', error);
    return errorResponse(res, 'Failed to update account status', 500);
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

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  accountSoftDelete
}; 