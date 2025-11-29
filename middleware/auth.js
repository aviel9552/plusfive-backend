const jwt = require('jsonwebtoken');
const { errorResponse } = require('../lib/utils');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return errorResponse(res, 'Access token required', 401);
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) {
      return errorResponse(res, 'Invalid or expired token', 403);
    }
    req.user = user;
    next();
  });
};

const generateToken = (userId, email, role = 'user') => {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(res, 'Insufficient permissions', 403);
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  generateToken,
  authorizeRole
}; 