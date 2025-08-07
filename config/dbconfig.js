const { PrismaClient } = require('@prisma/client');

// Database configuration
const dbConfig = {
  // Development environment
  development: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/plusfive_dev',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'plusfive_dev',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    schema: process.env.DB_SCHEMA || 'public',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
      acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
    }
  },

  // Production environment
  production: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    schema: process.env.DB_SCHEMA || 'public',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
      acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
    }
  },

  // Test environment
  test: {
    provider: 'postgresql',
    url: process.env.TEST_DATABASE_URL || 'postgresql://username:password@localhost:5432/plusfive_test',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: process.env.TEST_DB_PORT || 5432,
    database: process.env.TEST_DB_NAME || 'plusfive_test',
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'password',
    schema: process.env.TEST_DB_SCHEMA || 'public',
    ssl: false,
    pool: {
      min: 1,
      max: 5,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 30000,
    }
  }
};

// Get current environment
const getCurrentEnvironment = () => {
  return process.env.NODE_ENV || 'development';
};

// Get database configuration for current environment
const getDbConfig = () => {
  const env = getCurrentEnvironment();
  return dbConfig[env] || dbConfig.development;
};

// Create Prisma client with configuration
const createPrismaClient = () => {
  const config = getDbConfig();
  
  return new PrismaClient({
    datasources: {
      db: {
        url: config.url
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });
};

// Database connection test
const testConnection = async (prisma) => {
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Close database connection
const closeConnection = async (prisma) => {
  try {
    await prisma.$disconnect();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error.message);
  }
};

module.exports = {
  dbConfig,
  getCurrentEnvironment,
  getDbConfig,
  createPrismaClient,
  testConnection,
  closeConnection
}; 