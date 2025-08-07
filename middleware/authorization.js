const { errorResponse } = require('../lib/utils');

// Role-based authorization middleware
const authorize = (roles = []) => {
  return (req, res, next) => {
    try {
      // Check if user exists in request (from auth middleware)
      if (!req.user) {
        return errorResponse(res, 'Authentication required', 401);
      }

      // If no specific roles required, allow access
      if (!roles || roles.length === 0) {
        return next();
      }

      // Check if user has required role
      if (!req.user.role || !roles.includes(req.user.role)) {
        return errorResponse(res, 'Insufficient permissions', 403);
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return errorResponse(res, 'Authorization failed', 500);
    }
  };
};

// Admin only middleware
const adminOnly = authorize(['admin']);

// User or admin middleware
const userOrAdmin = authorize(['user', 'admin']);

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return errorResponse(res, 'Admin access required', 403);
  }
  next();
};

// Check if user is admin or regular user
const isUserOrAdmin = (req, res, next) => {
  if (!req.user || !['user', 'admin'].includes(req.user.role)) {
    return errorResponse(res, 'User or admin access required', 403);
  }
  next();
};

module.exports = {
  authorize,
  adminOnly,
  userOrAdmin,
  isAdmin,
  isUserOrAdmin
}; 