import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isTokenRevoked } from '../services/tokenService';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    is_super_admin?: boolean;
  };
  token?: string; // Store token for logout
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Support both Authorization header and HttpOnly cookie
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1] || req.cookies?.auth_token;

  if (!token) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as {
      id: number;
      email: string;
      role: string;
      is_super_admin?: boolean;
      iat?: number;
      exp?: number;
    };

    // Check if token is blacklisted (revoked)
    const revoked = await isTokenRevoked(token);
    if (revoked) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    (req as AuthRequest).user = decoded;
    (req as AuthRequest).token = token; // Store for potential logout
    next();
  } catch (error) {
    if (error instanceof Error && error.message === 'JWT_SECRET environment variable is required') {
      console.error('CRITICAL: JWT_SECRET not configured');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Super admins can access any role's endpoints
    if (user.is_super_admin) {
      next();
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
