const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  verifyEmail, 
  resendVerification, 
  forgotPassword, 
  resetPassword
} = require('../controllers/authController');
const { validateRequest } = require('../middleware/validation');
const { 
  userRegistrationSchema, 
  userLoginSchema, 
  resendVerificationSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema
} = require('../lib/validations');

// POST /api/auth/register - User registration
// router.post('/register', validateRequest(userRegistrationSchema), register);
router.post('/register', register);

// POST /api/auth/login - User login
router.post('/login', validateRequest(userLoginSchema), login);

// GET /api/auth/verify-email/:token - Verify email
router.get('/verify-email/:token', verifyEmail);

// POST /api/auth/resend-verification - Resend verification email
router.post('/resend-verification', validateRequest(resendVerificationSchema), resendVerification);

// POST /api/auth/forgot-password - Forgot password
router.post('/forgot-password', validateRequest(forgotPasswordSchema), forgotPassword);

// POST /api/auth/reset-password/:token - Reset password
router.post('/reset-password/:token', validateRequest(resetPasswordSchema), resetPassword);

module.exports = router; 