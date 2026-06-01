import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Support both DATABASE_URL (production) and individual env vars (development)
// Neon free-tier databases suspend after inactivity — cold start can take 3-5s.
// Vercel serverless functions time out at 10s. Settings below are tuned to
// handle Neon wake-up within the Vercel timeout budget.
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: isServerless ? 5 : 20,          // Serverless: fewer connections per instance
      idleTimeoutMillis: isServerless ? 10000 : 30000,  // Release idle connections faster
      connectionTimeoutMillis: 15000,       // 15s — enough for Neon cold start + query
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'medsys',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't crash on connection errors in serverless — let the next request retry
  if (!isServerless) process.exit(-1);
});

export default pool;
