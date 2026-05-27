import dotenv from 'dotenv';
dotenv.config();

import * as Sentry from '@sentry/node';

// Initialize Sentry before any other imports so it can instrument them
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import routes from './routes';
import pool from './database/db';
import { cleanupExpiredTokens } from './services/tokenService';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 5000;

// Vercel sits in front of the app and forwards real client IPs in the
// X-Forwarded-For header. Trusting the first proxy hop lets express-rate-limit
// (and any IP-based logic) bucket per real client instead of treating every
// request as if it came from the same edge IP.
app.set('trust proxy', 1);

// Security middleware - Helmet adds various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for medical imaging
}));

// Rate limiting - General API limit.
// EMR dashboards poll every 30s with 6+ endpoints per poll, and a single
// clinic typically has 20-40 staff sharing one NAT IP, so the bucket has
// to be sized for the whole clinic. 10000 / 15 min ≈ 11 req/sec per IP,
// which is comfortably above realistic peak load while still catching abuse.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  },
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 auth attempts per windowMs
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiter to all requests
app.use(generalLimiter);

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
      : ['http://localhost:5173', 'http://localhost:3000'];

    // Allow same-origin / server-to-server / curl requests with no Origin header
    if (!origin) {
      return callback(null, true);
    }

    // Exact-match against the allow list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any deployment URL belonging to this Vercel project
    // (e.g. medsys-XXXX-fair-votes-projects.vercel.app, medsys-five.vercel.app)
    if (/^https:\/\/medsys[a-z0-9-]*\.vercel\.app$/i.test(origin)) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV === 'production') {
      logger.warn({ origin, allowed: allowedOrigins }, 'CORS rejected origin');
      return callback(new Error('CORS not allowed'), false);
    }

    logger.warn({ origin }, 'CORS origin not in allowed list');
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Apply stricter rate limiting to auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/request-reset', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use(express.json({ limit: '10mb' })); // Add request body size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser()); // Parse cookies for HttpOnly auth tokens

// Request logging middleware (exclude sensitive data)
app.use((req: Request, res: Response, next) => {
  if (!req.path.includes('/auth/')) {
    logger.info({ method: req.method, path: req.path }, 'request');
  }
  next();
});

// Liveness probe — lightweight, no DB hit (for load balancer / uptime pings)
app.get('/health/live', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Deep health check — verifies database connectivity
app.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  // Database connectivity
  const dbStart = Date.now();
  try {
    await pool.query('SELECT 1 AS ok');
    checks.database = { status: 'ok', latency_ms: Date.now() - dbStart };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    checks.database = { status: 'error', latency_ms: Date.now() - dbStart, error: message };
  }

  // Memory usage
  const mem = process.memoryUsage();
  checks.memory = {
    status: mem.heapUsed / mem.heapTotal < 0.9 ? 'ok' : 'warning',
  };

  const overallStatus = Object.values(checks).every(c => c.status === 'ok') ? 'ok' : 'degraded';

  res.status(overallStatus === 'ok' ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Sentry error handler — captures unhandled errors before our handler
Sentry.setupExpressErrorHandler(app);

// Error handling middleware
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const eventId = Sentry.captureException(err);
  logger.error({ err }, 'Unhandled error');
  const message = err instanceof Error ? err.message : undefined;
  res.status(500).json({
    error: 'Internal server error',
    eventId,
    message: process.env.NODE_ENV === 'development' ? message : undefined,
  });
});

// Only start server if not in Vercel serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'MedSys Server running');
    logger.info({ url: `http://localhost:${PORT}/health` }, 'Health check endpoint');
    logger.info({ url: `http://localhost:${PORT}/api` }, 'API base URL');

    // Clean up expired blacklist tokens every hour
    setInterval(() => {
      cleanupExpiredTokens().catch(err => logger.error({ err }, 'Token cleanup failed'));
    }, 60 * 60 * 1000);

    // Initial cleanup on startup
    cleanupExpiredTokens().catch(err => logger.error({ err }, 'Token cleanup failed'));
  });

  // Handle server errors
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      logger.error({ port: PORT }, 'Port already in use');
    } else {
      logger.error({ err: error }, 'Server error');
    }
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing server');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

export default app;
