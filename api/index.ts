// Vercel Serverless Function Entry Point
// This wraps the Express app for Vercel deployment

import app from '../server/src/index';

// Export the Express app as a serverless function
export default app;
