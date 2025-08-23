const express = require('express');
const router = express.Router();
const { 
  createUser,
  getProfile, 
  updateProfile, 
  getUserById, 
  getAllUsers, 
  updateUserById, 
  deleteUserById,
  changePassword,
  softDeleteUser
} = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { userCreateSchema, userUpdateSchema, adminUserUpdateSchema, changePasswordSchema } = require('../lib/validations');
const { adminOnly } = require('../middleware/authorization');

// Admin routes (admin only)
// POST /api/users - Create new user
router.post('/', authenticateToken, adminOnly, validateRequest(userCreateSchema), createUser);

// GET /api/users - Get all users
router.get('/', authenticateToken, adminOnly, getAllUsers);

// User profile routes (for authenticated users) - PUT THESE BEFORE PARAMETERIZED ROUTES
// GET /api/users/profile - Get user profile
router.get('/profile', authenticateToken, getProfile);

// PUT /api/users/profile - Update user profile
router.put('/profile', authenticateToken, validateRequest(userUpdateSchema), updateProfile);

// PUT /api/users/change-password - Change password
router.put('/change-password', authenticateToken, validateRequest(changePasswordSchema), changePassword);

// PATCH /api/users/soft-delete - Soft delete user account (self-deletion)
router.patch('/soft-delete', authenticateToken, softDeleteUser);

// Parameterized routes (admin only) - PUT THESE AFTER SPECIFIC ROUTES
// GET /api/users/:id - Get user by ID
router.get('/:id', authenticateToken, adminOnly, getUserById);

// PUT /api/users/:id - Update user by ID
router.put('/:id', authenticateToken, validateRequest(adminUserUpdateSchema), updateUserById);

// DELETE /api/users/:id - Delete user by ID
router.delete('/:id', authenticateToken, adminOnly, deleteUserById);

module.exports = router; 