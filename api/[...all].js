const app = require('../server');

// Catch-all serverless function to forward every path to Express
module.exports = (req, res) => {
  return app(req, res);
};


