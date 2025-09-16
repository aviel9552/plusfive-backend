const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import Cron Job Service
const CronJobService = require('./services/CronJobService');

// Import configurations
const { getConfig, validateConfig } = require('./config');
const config = getConfig();

// Import routes
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const qrRoutes = require('./routes/qr');
const supportRoutes = require('./routes/support');
const userRoutes = require('./routes/users');
const referralRoutes = require('./routes/referrals');
const customerRoutes = require('./routes/customers');
const webhookRoutes = require('./routes/webhooks');
const reviewRoutes = require('./routes/reviews');
const customerStatusRoutes = require('./routes/customerStatus');
const whatsappRoutes = require('./routes/whatsapp');
const whatsappMessageRoutes = require('./routes/whatsappMessage');
const adminDashboardRoutes = require('./routes/adminDashboard');
const stripeRoutes = require('./routes/stripe');
const cronTestRoutes = require('./routes/cronTest');
const cronJobRoutes = require('./routes/cronJobs');

const app = express();

// Validate configuration
if (!validateConfig()) {
  console.error('❌ Configuration validation failed. Please check your environment variables.');
  process.exit(1);
}

// Security middleware
app.use(helmet());
app.use(cors(config.server.cors));

// Pre-flight requests
app.options('*', cors(config.server.cors));

// Rate limiting
// const limiter = rateLimit(config.rateLimit);
// app.use('/api/', limiter);

// More lenient rate limit for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: false, // Disable trust proxy validation
  skip: (req) => {
    // Skip rate limiting for verify email endpoint
    return req.path.includes('/verify-email/');
  }
});

// Apply login rate limit only to auth routes
// app.use('/api/auth/', loginLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy for proper IP address handling
app.set('trust proxy', true);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: config.server.environment,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/customer-status', customerStatusRoutes);

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp-messages', whatsappMessageRoutes);
app.use('/api/admin-dashboard', adminDashboardRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/cron-test', cronTestRoutes);
app.use('/api/cron-jobs', cronJobRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server only when executed directly (not when imported by serverless function)
const PORT = config.server.port;
const HOST = config.server.host;

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📊 Environment: ${config.server.environment}`);
    console.log(`🔗 Health check: http://${HOST}:${PORT}/health`);
    console.log(`📝 Log level: ${config.logging.level}`);
    
    // Start Cron Jobs after server is running
    if (config.server.environment === 'production' || process.env.ENABLE_CRON === 'true') {
      const cronService = new CronJobService();
      cronService.startAllJobs();
      console.log('🕒 Customer Status Cron Jobs Started');
    } else {
      console.log('⏸️ Cron Jobs disabled (set ENABLE_CRON=true to enable)');
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
    });
  });
}

module.exports = app;