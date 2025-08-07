const { z } = require('zod');

// User validation schemas
const userRegistrationSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().optional(),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  address: z.string().optional(),
  whatsappNumber: z.string().optional(),
  directChatMessage: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
  
  // Additional fields
  accountStatus: z.string().default('active'),
  adCampaignSource: z.string().optional(),
  affiliateId: z.string().optional(),
  affiliateLinkUrl: z.string().url('Invalid affiliate link URL').optional(),
  deviceInfo: z.record(z.any()).optional(),
  landingPageUrl: z.string().url('Invalid landing page URL').optional(),
  subscriptionExpirationDate: z.date().optional(),
  subscriptionLtv: z.number().default(0.00),
  subscriptionPlan: z.string().optional(),
  subscriptionStartDate: z.date().optional(),
  termsAccepted: z.boolean().default(false),
  subscriptionStatus: z.string().default('active'),
  stripeCustomerId: z.string().optional(),
});

// User creation schema (admin only)
const userCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().optional(),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  address: z.string().optional(),
  whatsappNumber: z.string().optional(),
  directChatMessage: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
  
  // Additional fields
  accountStatus: z.string().default('active'),
  adCampaignSource: z.string().optional(),
  affiliateId: z.string().optional(),
  affiliateLinkUrl: z.string().url('Invalid affiliate link URL').optional(),
  deviceInfo: z.record(z.any()).optional(),
  landingPageUrl: z.string().url('Invalid landing page URL').optional(),
  subscriptionExpirationDate: z.date().optional(),
  subscriptionLtv: z.number().default(0.00),
  subscriptionPlan: z.string().optional(),
  subscriptionStartDate: z.date().optional(),
  termsAccepted: z.boolean().default(false),
  subscriptionStatus: z.string().default('active'),
  stripeCustomerId: z.string().optional(),
});

const userLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const userUpdateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phoneNumber: z.string().optional(),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  address: z.string().optional(),
  whatsappNumber: z.string().optional(),
  directChatMessage: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
  
  // Additional fields
  accountStatus: z.string().optional(),
  adCampaignSource: z.string().optional(),
  affiliateId: z.string().optional(),
  affiliateLinkUrl: z.string().url('Invalid affiliate link URL').optional(),
  deviceInfo: z.record(z.any()).optional(),
  landingPageUrl: z.string().url('Invalid landing page URL').optional(),
  subscriptionExpirationDate: z.date().optional(),
  subscriptionLtv: z.number().optional(),
  subscriptionPlan: z.string().optional(),
  subscriptionStartDate: z.date().optional(),
  termsAccepted: z.boolean().optional(),
  subscriptionStatus: z.string().optional(),
  stripeCustomerId: z.string().optional(),
});

// Admin user update schema (includes email and password)
const adminUserUpdateSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phoneNumber: z.string().optional(),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  address: z.string().optional(),
  whatsappNumber: z.string().optional(),
  directChatMessage: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
  
  // Additional fields
  accountStatus: z.string().optional(),
  adCampaignSource: z.string().optional(),
  affiliateId: z.string().optional(),
  affiliateLinkUrl: z.string().url('Invalid affiliate link URL').optional(),
  deviceInfo: z.record(z.any()).optional(),
  landingPageUrl: z.string().url('Invalid landing page URL').optional(),
  subscriptionExpirationDate: z.date().optional(),
  subscriptionLtv: z.number().optional(),
  subscriptionPlan: z.string().optional(),
  subscriptionStartDate: z.date().optional(),
  termsAccepted: z.boolean().optional(),
  subscriptionStatus: z.string().optional(),
  stripeCustomerId: z.string().optional(),
});

// Email verification schemas
const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

// Order validation schemas
const orderCreateSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('USD'),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const orderUpdateSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Payment validation schemas
const paymentCreateSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('USD'),
  paymentMethod: z.string().optional(),
  transactionId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// QR Code validation schemas
const qrCodeCreateSchema = z.object({
  name: z.string().optional(),
  code: z.string().min(1, 'QR code is required'),
  directGenerate: z.boolean().optional(),
  size: z.number().min(50).max(1000).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
});

const qrCodeUpdateSchema = z.object({
  name: z.string().optional(),
  code: z.string().min(1, 'QR code is required').optional(),
  isActive: z.boolean().optional(),
});

// Support ticket validation schemas
const supportTicketCreateSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  category: z.string().optional(),
});

const supportTicketUpdateSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  category: z.string().optional(),
});

module.exports = {
  userRegistrationSchema,
  userCreateSchema,
  userLoginSchema,
  userUpdateSchema,
  adminUserUpdateSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  orderCreateSchema,
  orderUpdateSchema,
  paymentCreateSchema,
  qrCodeCreateSchema,
  qrCodeUpdateSchema,
  supportTicketCreateSchema,
  supportTicketUpdateSchema
}; 