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
    { expiresIn: '7d' }
  );
};

module.exports = {
  authenticateToken,
  generateToken
}; 