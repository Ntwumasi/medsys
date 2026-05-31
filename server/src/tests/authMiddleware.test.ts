import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeRoles } from '../middleware/auth';
import { mockRequest, mockResponse } from './helpers';

describe('authorizeRoles Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass when user role is in the allowed list', () => {
    const req = mockRequest({}, {}, {}, { id: 1, role: 'doctor', email: 'doc@test.com' });
    const res = mockResponse();
    const next = vi.fn();

    authorizeRoles('doctor', 'nurse')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 when user role is not in the allowed list', () => {
    const req = mockRequest({}, {}, {}, { id: 1, role: 'receptionist', email: 'rec@test.com' });
    const res = mockResponse();
    const next = vi.fn();

    authorizeRoles('doctor', 'nurse')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
  });

  it('should pass super_admin regardless of role list', () => {
    const req = mockRequest({}, {}, {}, { id: 1, role: 'admin', email: 'sa@test.com', is_super_admin: true });
    const res = mockResponse();
    const next = vi.fn();

    authorizeRoles('doctor')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 when no user on request', () => {
    const req = mockRequest(); // no user
    const res = mockResponse();
    const next = vi.fn();

    authorizeRoles('doctor')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
  });

  it('should allow nurse role when nurse is in the list', () => {
    const req = mockRequest({}, {}, {}, { id: 2, role: 'nurse', email: 'nurse@test.com' });
    const res = mockResponse();
    const next = vi.fn();

    authorizeRoles('nurse', 'pharmacist')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject pharmacist when only doctor and admin are allowed', () => {
    const req = mockRequest({}, {}, {}, { id: 3, role: 'pharmacist', email: 'pharm@test.com' });
    const res = mockResponse();
    const next = vi.fn();

    authorizeRoles('doctor', 'admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should pass with a single allowed role', () => {
    const req = mockRequest({}, {}, {}, { id: 4, role: 'lab', email: 'lab@test.com' });
    const res = mockResponse();
    const next = vi.fn();

    authorizeRoles('lab')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should pass super_admin even when role list is empty', () => {
    const req = mockRequest({}, {}, {}, { id: 1, role: 'admin', email: 'sa@test.com', is_super_admin: true });
    const res = mockResponse();
    const next = vi.fn();

    // No roles specified — only super_admin should get through
    authorizeRoles()(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
