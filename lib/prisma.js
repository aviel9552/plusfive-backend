const { createPrismaClient, testConnection, closeConnection } = require('../config/dbconfig');

// Create Prisma client instance
const prisma = createPrismaClient();

// Test connection on startup
testConnection(prisma);

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await closeConnection(prisma);
});

process.on('SIGINT', async () => {
  await closeConnection(prisma);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeConnection(prisma);
  process.exit(0);
});

module.exports = prisma; 