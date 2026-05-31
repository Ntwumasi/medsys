import { vi } from 'vitest';

export const mockResponse = () => {
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  };
  return res as any;
};

export const mockRequest = (body = {}, params = {}, query = {}, user: any = null) => ({
  body, params, query, user,
  ip: '127.0.0.1',
  headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test-agent' },
  socket: { remoteAddress: '127.0.0.1' },
  cookies: {},
} as any);
