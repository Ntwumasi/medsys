"use strict";
exports.__esModule = true;

// Simple test handler to verify serverless function works
function handler(req, res) {
  console.log("Serverless function called:", req.url);
  
  try {
    // Import the Express app
    const app = require('../server/dist/index').default || require('../server/dist/index');
    
    console.log("App loaded:", typeof app);
    
    // Call the Express app as middleware
    return app(req, res);
  } catch (error) {
    console.error("Error in serverless handler:", error);
    res.status(500).json({ 
      error: "Serverless function error", 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

exports.default = handler;
module.exports = handler;
module.exports.default = handler;
