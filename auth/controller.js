const prisma = require('../lib/prisma');
const { successResponse, errorResponse, hashPassword, verifyPassword } = require('../lib/utils');
const { generateToken, generateCustomerToken } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../lib/emailService');
const { constants } = require('../config');
const { formatIsraeliPhone, formatIsraelPhoneToLocal, isValidIsraelPhone, PHONE_VALIDATION_ERROR_MESSAGE } = require('../lib/phoneUtils');
const crypto = require('crypto');
const { generateUniqueBusinessPublicSlug } = require('../lib/businessSlug');

// Register user
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, ...otherFields } = req.body;
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
      if (!isValidIsraelPhone(phoneNumber)) {
        return errorResponse(res, PHONE_VALIDATION_ERROR_MESSAGE, 400);
      }
      // Format phone number before checking
      const formattedPhoneNumber = formatIsraeliPhone(phoneNumber);
      
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
      phoneNumber: phoneNumber ? formatIsraeliPhone(phoneNumber) : phoneNumber,
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

    // Create user with only valid fields (auto-verify email)
    // Explicitly set subscriptionStatus to 'pending' for new users (no subscription yet)
    const businessPublicSlug = await generateUniqueBusinessPublicSlug(prisma, { length: 7 });
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        referralCode: userReferralCode,
        businessPublicSlug,
        emailVerified: new Date(), // Auto-verify email on registration
        subscriptionStatus: constants.SUBSCRIPTION_STATUS.PENDING, // New users don't have active subscription
        subscriptionPlan: null, // No subscription plan yet
        subscriptionExpirationDate: null, // No expiration date yet
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
        phoneNumber: true,
        businessName: true,
        businessType: true,
        businessPublicSlug: true,
        subscriptionStatus: true,
        subscriptionExpirationDate: true,
        subscriptionPlan: true,
        createdAt: true
      }
    });

    // Generate JWT token for automatic login after registration
    const token = generateToken(user.id, user.email, user.role);

    // Format phone for response (local 0... format)
    let formattedUser = { ...user };
    if (formattedUser.phoneNumber) {
      formattedUser.phoneNumber = formatIsraelPhoneToLocal(formattedUser.phoneNumber);
    }

    // Email is already verified during registration, return token for automatic login
    return successResponse(res, {
      user: formattedUser,
      token,
      message: 'Registration successful. You are now logged in.'
    }, 'User registered successfully');
  } catch (error) {
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

/**
 * Resolve customer portal login by phone only. Requires exactly one eligible customer row.
 * @returns {{ business: object, customer: object } | { error: string, status: number }}
 */
async function resolveCustomerPortalByPhone(customerPhone) {
  if (!isValidIsraelPhone(customerPhone)) {
    return { error: PHONE_VALIDATION_ERROR_MESSAGE, status: 400 };
  }
  const formattedPhone = formatIsraeliPhone(customerPhone);

  const rows = await prisma.customers.findMany({
    where: {
      customerPhone: formattedPhone,
      userId: { not: null },
    },
    include: {
      user: {
        select: {
          id: true,
          businessPublicSlug: true,
          businessName: true,
          isActive: true,
          isDeleted: true,
        },
      },
      customerUsers: {
        where: { isDeleted: false },
      },
    },
  });

  const eligible = [];

  for (const customer of rows) {
    const business = customer.user;
    if (!business || business.isDeleted || !business.isActive) continue;

    const link = customer.customerUsers.find((cu) => cu.userId === customer.userId);
    if (!link || !link.isActive || link.status === 'blocked') continue;

    const { user: _u, customerUsers: _cu, ...customerRest } = customer;

    eligible.push({
      customer: customerRest,
      business: {
        id: business.id,
        businessPublicSlug: business.businessPublicSlug,
        businessName: business.businessName,
        isActive: business.isActive,
      },
    });
  }

  if (eligible.length === 0) {
    return { error: 'No account found for this phone number', status: 401 };
  }
  if (eligible.length > 1) {
    return {
      error:
        'This phone is linked to more than one business. Use the customer sign-in link from the business you booked with.',
      status: 409,
    };
  }

  return { business: eligible[0].business, customer: eligible[0].customer };
}

function customerSafeFields(customer) {
  const out = { ...customer };
  if (out.customerPhone && out.customerPhone.startsWith('+972')) {
    out.customerPhone = '0' + out.customerPhone.substring(4);
  }
  return out;
}

// Customer portal login (phone only — must match exactly one business customer record)
const customerLogin = async (req, res) => {
  try {
    const { customerPhone } = req.body;
    const ctx = await resolveCustomerPortalByPhone(customerPhone);
    if (ctx.error) {
      return errorResponse(res, ctx.error, ctx.status);
    }
    const { business, customer } = ctx;

    const token = generateCustomerToken(customer.id, business.id);

    return successResponse(
      res,
      {
        customer: customerSafeFields(customer),
        business: {
          id: business.id,
          businessPublicSlug: business.businessPublicSlug,
          businessName: business.businessName,
        },
        token,
      },
      'Login successful'
    );
  } catch (e) {
    console.error('customerLogin:', e);
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
    const user = await prisma.user.findFirst({
      where: { 
        email,
        isDeleted: false
      }
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
    const user = await prisma.user.findFirst({
      where: { 
        email,
        isDeleted: false
      }
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

module.exports = {
  register,
  login,
  customerLogin,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword
}; 