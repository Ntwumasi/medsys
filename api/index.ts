// Vercel Serverless Function Entry Point
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the Express app from the compiled dist folder
const app = require('../server/dist/index').default || require('../server/dist/index');

// Export handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Express app has routes mounted at /api, so keep the full path
  return app(req, res);
}
