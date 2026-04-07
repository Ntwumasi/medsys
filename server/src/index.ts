import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

// Rate limiting - General API limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
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

// CORS configuration - Fail-safe: reject if FRONTEND_URL not set in production
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
      : ['http://localhost:5173', 'http://localhost:3000']; // Dev defaults only

    // Allow requests with no origin (mobile apps, Postman, etc.) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (origin && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In production, reject unknown origins
    if (process.env.NODE_ENV === 'production') {
      return callback(new Error('CORS not allowed'), false);
    }

    // In development, allow but warn
    console.warn(`CORS warning: Origin ${origin} not in allowed list`);
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

// Request logging middleware (exclude sensitive data)
app.use((req: Request, res: Response, next) => {
  // Don't log auth endpoints to avoid logging credentials
  if (!req.path.includes('/auth/')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Only start server if not in Vercel serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`🏥 MedSys Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📍 API base URL: http://localhost:${PORT}/api`);
  });

  // Handle server errors
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
    } else {
      console.error('Server error:', error);
    }
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

export default app;
