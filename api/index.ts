// Vercel Serverless Function Entry Point
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the Express app
const app = require('../server/src/index').default || require('../server/src/index');

// Export handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Express app has routes mounted at /api, so keep the full path
  return app(req, res);
}
