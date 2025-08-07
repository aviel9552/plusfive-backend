const { dbConfig, getCurrentEnvironment, getDbConfig, createPrismaClient, testConnection, closeConnection } = require('./dbconfig');
const { appConfig, getConfig, getConfigSection, validateConfig } = require('./appconfig');

// Export all configurations
module.exports = {
  // Database configuration
  dbConfig,
  getCurrentEnvironment,
  getDbConfig,
  createPrismaClient,
  testConnection,
  closeConnection,
  
  // Application configuration
  appConfig,
  getConfig,
  getConfigSection,
  validateConfig,
  
  // Combined configuration
  config: {
    ...appConfig,
    database: dbConfig
  }
}; 