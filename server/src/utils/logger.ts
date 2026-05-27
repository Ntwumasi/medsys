import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino/file', options: { destination: 1 } }  // stdout in dev (readable)
    : undefined,  // JSON in production (for log aggregation)
  base: { service: 'medsys-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields from logs
  redact: {
    paths: ['req.headers.authorization', 'password', 'token', 'jwt'],
    remove: true,
  },
});

export default logger;
