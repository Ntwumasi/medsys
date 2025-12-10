import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../database/db';
import { login, register, getCurrentUser, impersonateUser } from '../controllers/authController';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

// Mock jwt
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-token'),
    verify: vi.fn(),
  },
}));

const mockResponse = () => {
  const res: Partial<Response> = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as Response;
};

const mockRequest = (body = {}, params = {}, user: any = null) => {
  return {
    body,
    params,
    user,
    ip: '127.0.0.1',
    headers: { 'x-forwarded-for': '127.0.0.1' },
  } as unknown as Request;
};

describe('Auth Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashed_password',
        first_name: 'Test',
        last_name: 'User',
        role: 'doctor',
        is_active: true,
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [mockUser] } as any);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();

      await login(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Login successful',
        token: 'mock-token',
        user: expect.objectContaining({
          email: 'test@example.com',
        }),
      }));
    });

    it('should reject login with invalid email', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({ email: 'invalid@example.com', password: 'password123' });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should reject login with invalid password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashed_password',
        is_active: true,
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [mockUser] } as any);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

      const req = mockRequest({ email: 'test@example.com', password: 'wrongpassword' });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should reject login for inactive user', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password_hash: 'hashed_password',
        is_active: false,
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [mockUser] } as any);

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account is disabled' });
    });
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        email: 'new@example.com',
        password: 'password123',
        first_name: 'New',
        last_name: 'User',
        role: 'receptionist',
      };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as any) // Check existing user
        .mockResolvedValueOnce({ rows: [{ id: 1, ...newUser }] } as any); // Insert user

      vi.mocked(bcrypt.hash).mockResolvedValueOnce('hashed_password' as never);

      const req = mockRequest(newUser);
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User registered successfully',
      }));
    });

    it('should reject registration if email already exists', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as any);

      const req = mockRequest({
        email: 'existing@example.com',
        password: 'password123',
        first_name: 'Test',
        last_name: 'User',
        role: 'receptionist',
      });
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User with this email already exists' });
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user data', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'doctor',
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [mockUser] } as any);

      // Create request with user in the req object (as authReq.user)
      const req = {
        body: {},
        params: {},
        user: { id: 1 },
        ip: '127.0.0.1',
        headers: {},
      } as unknown as Request;
      const res = mockResponse();

      await getCurrentUser(req, res);

      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = {
        body: {},
        params: {},
        user: { id: 999 },
        ip: '127.0.0.1',
        headers: {},
      } as unknown as Request;
      const res = mockResponse();

      await getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 401 if not authenticated', async () => {
      const req = {
        body: {},
        params: {},
        user: undefined,
        ip: '127.0.0.1',
        headers: {},
      } as unknown as Request;
      const res = mockResponse();

      await getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });
  });

  describe('impersonateUser', () => {
    it('should allow admin to impersonate another user', async () => {
      const targetUser = {
        id: 2,
        email: 'target@example.com',
        first_name: 'Target',
        last_name: 'User',
        role: 'nurse',
        is_active: true,
      };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [targetUser] } as any) // Get target user
        .mockResolvedValueOnce({ rows: [{ id: 1 }] } as any); // Log impersonation

      const req = mockRequest({}, { userId: '2' }, { id: 1, role: 'admin' });
      const res = mockResponse();

      await impersonateUser(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Impersonation successful',
        token: 'mock-token',
        user: expect.objectContaining({
          id: 2,
          role: 'nurse',
        }),
      }));
    });

    it('should reject if target user not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({}, { userId: '999' }, { id: 1, role: 'admin' });
      const res = mockResponse();

      await impersonateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should reject if target user is inactive', async () => {
      const inactiveUser = {
        id: 2,
        email: 'inactive@example.com',
        role: 'nurse',
        is_active: false,
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [inactiveUser] } as any);

      const req = mockRequest({}, { userId: '2' }, { id: 1, role: 'admin' });
      const res = mockResponse();

      await impersonateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot impersonate an inactive user' });
    });

    it('should prevent admin from impersonating another admin', async () => {
      const targetAdmin = {
        id: 2,
        email: 'admin2@example.com',
        role: 'admin',
        is_active: true,  // Need active flag to pass inactive check first
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [targetAdmin] } as any);

      const req = mockRequest({}, { userId: '2' }, { id: 1, role: 'admin' });
      const res = mockResponse();

      await impersonateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      // The error checks is_active first, then role - admin check comes after active check
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot impersonate another administrator' });
    });

    it('should log impersonation event', async () => {
      const targetUser = {
        id: 2,
        email: 'target@example.com',
        first_name: 'Target',
        last_name: 'User',
        role: 'nurse',
        is_active: true,
      };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [targetUser] } as any)
        .mockResolvedValueOnce({ rows: [{ id: 1 }] } as any);

      const req = mockRequest({}, { userId: '2' }, { id: 1, role: 'admin' });
      const res = mockResponse();

      await impersonateUser(req, res);

      // Verify that the impersonation was logged
      expect(pool.query).toHaveBeenCalledTimes(2);
      const logQuery = vi.mocked(pool.query).mock.calls[1][0] as string;
      expect(logQuery).toContain('impersonation_logs');
    });

    it('should reject if user is not admin', async () => {
      const req = mockRequest({}, { userId: '2' }, { id: 1, role: 'doctor' });
      const res = mockResponse();

      await impersonateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only administrators can impersonate users' });
    });
  });
});
