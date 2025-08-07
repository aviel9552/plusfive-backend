const prisma = require('../lib/prisma');
const { successResponse, errorResponse, hashPassword, verifyPassword } = require('../lib/utils');
const { generateToken } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../lib/emailService');
const crypto = require('crypto');

// Register user
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, ...otherFields } = req.body;

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
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        ...otherFields
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        createdAt: true
      }
    });

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
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
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

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

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

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword
}; 