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
const paymentRoutes = require('./routes/payments');
const qrRoutes = require('./routes/qr');
const supportRoutes = require('./routes/support');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const staffRoutes = require('./routes/staff');
const staffServiceRoutes = require('./routes/staffServices');
const serviceRoutes = require('./routes/services');
const categoryRoutes = require('./routes/categories');
const catalogCategoryRoutes = require('./routes/catalogCategories');
const supplierRoutes = require('./routes/suppliers');
const productRoutes = require('./routes/products');
const webhookRoutes = require('./routes/webhooks');
const reviewRoutes = require('./routes/reviews');
const customerStatusRoutes = require('./routes/customerStatus');
const whatsappRoutes = require('./routes/whatsapp');
const whatsappMessageRoutes = require('./routes/whatsappMessage');
const adminDashboardRoutes = require('./routes/adminDashboard');
const stripeRoutes = require('./routes/stripe');
const cronTestRoutes = require('./routes/cronTest');
const cronJobRoutes = require('./routes/cronJobs');
const n8nTestRoutes = require('./routes/n8nTest');
const waitlistRoutes = require('./routes/waitlist');
const businessOperatingHoursRoutes = require('./routes/businessOperatingHours');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swaggerDoc');

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

// Body parsing middleware – accept empty/whitespace JSON as {} (avoids 500 when Postman sends "raw JSON" with no body)
app.use((req, res, next) => {
  const isJson = req.headers['content-type']?.includes('application/json');
  if (!isJson) return express.json({ limit: '10mb' })(req, res, next);
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    try {
      req.body = (data.trim() === '') ? {} : JSON.parse(data);
      next();
    } catch (e) {
      next(e);
    }
  });
});
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

// Swagger API documentation (OpenAPI 3.0 – aligns with USER_API_ENDPOINTS.md & ADMIN_API_ENDPOINTS.md)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Plusfive API Docs',
}));

// API routes
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/staff', staffServiceRoutes);
app.use('/api/business-operating-hours', businessOperatingHoursRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/catalog-categories', catalogCategoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/customer-status', customerStatusRoutes);

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp-messages', whatsappMessageRoutes);
app.use('/api/admin-dashboard', adminDashboardRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/cron-test', cronTestRoutes);
app.use('/api/cron-jobs', cronJobRoutes);
app.use('/api/n8n-test', n8nTestRoutes);
app.use('/api/waitlist', waitlistRoutes);

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

  // JSON parse error (e.g. empty body with Content-Type: application/json)
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.statusCode === 400)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or empty JSON body. For endpoints that need no body, set Body to "none" in Postman or send valid JSON.'
    });
  }

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
    console.log(`📖 Swagger docs: http://${HOST}:${PORT}/api-docs`);
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