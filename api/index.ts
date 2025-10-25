// Vercel Serverless Function Entry Point
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the Express app
const app = require('../server/src/index').default || require('../server/src/index');

// Export handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Strip /api prefix from the URL since Vercel routes /api/* here
  // but Express app expects paths without /api prefix for some routes
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }

  // Let Express handle the request
  return app(req, res);
}
