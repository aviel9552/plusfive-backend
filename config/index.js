const { dbConfig, getCurrentEnvironment, getDbConfig, createPrismaClient, testConnection, closeConnection } = require('./dbconfig');
const { appConfig, getConfig, getConfigSection, validateConfig } = require('./appconfig');
const constants = require('./constants');

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
  
  // Constants
  constants,
  
  // Combined configuration
  config: {
    ...appConfig,
    database: dbConfig
  }
}; 