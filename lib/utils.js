const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

const verifyPassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const successResponse = (res, data, message = 'Operation successful') => {
  return res.json({
    success: true,
    message,
    data
  });
};

const errorResponse = (res, message, status = 400) => {
  return res.status(status).json({
    success: false,
    message,
    error: message
  });
};

const generateRandomString = (length = 32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const sanitizeInput = (input) => {
  return input.trim().replace(/[<>]/g, '');
};

module.exports = {
  hashPassword,
  verifyPassword,
  successResponse,
  errorResponse,
  generateRandomString,
  formatCurrency,
  validateEmail,
  sanitizeInput
}; 