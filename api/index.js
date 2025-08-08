const app = require('../server');

// Vercel Node serverless function handler wrapping Express app
module.exports = (req, res) => {
  return app(req, res);
};


