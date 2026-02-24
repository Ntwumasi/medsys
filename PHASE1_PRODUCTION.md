# Phase 1: Production Hardening Tasks

These tasks should be completed before deploying to production for any clinic.

## Priority: Critical

### 1. Rate Limiting
- [ ] Add `express-rate-limit` middleware
- [ ] Configure limits: 100 requests/15 min for general, 5 requests/15 min for login
- [ ] Add rate limit headers to responses

### 2. Audit Logging (HIPAA Requirement)
- [ ] Create `audit_logs` table
- [ ] Log all patient data access (who, what, when, from where)
- [ ] Log all data modifications
- [ ] Log login attempts (successful and failed)
- [ ] Implement audit log viewer in admin dashboard

### 3. File Storage Migration
- [ ] Migrate from local filesystem to AWS S3 or similar
- [ ] Current issue: `/tmp` doesn't persist on Vercel serverless
- [ ] Implement signed URLs for secure file access
- [ ] Add file type validation (PDF, images only)
- [ ] Add file size limits (e.g., 10MB max)

### 4. Security Hardening
- [ ] Generate strong `JWT_SECRET` (min 256-bit)
- [ ] Add Helmet.js for security headers
- [ ] Implement CSRF protection
- [ ] Add input sanitization middleware
- [ ] Review and tighten CORS configuration

## Priority: High

### 5. Error Handling & Monitoring
- [ ] Add structured error logging (e.g., Sentry, LogRocket)
- [ ] Implement proper error boundaries in React
- [ ] Add health check monitoring
- [ ] Set up alerts for error spikes

### 6. Database Security
- [ ] Review and restrict database user permissions
- [ ] Enable SSL for all database connections (already configured)
- [ ] Implement connection pooling limits
- [ ] Add database query timeout limits

### 7. API Documentation
- [ ] Add OpenAPI/Swagger documentation
- [ ] Document all endpoints
- [ ] Add request/response examples

## Priority: Medium

### 8. Performance
- [ ] Add Redis caching for frequently accessed data
- [ ] Implement pagination on all list endpoints
- [ ] Add database query optimization (indexes)
- [ ] Configure CDN for static assets

### 9. Backup & Recovery
- [ ] Set up automated database backups
- [ ] Document recovery procedures
- [ ] Test backup restoration process

### 10. User Session Management
- [ ] Implement refresh tokens
- [ ] Add session invalidation on password change
- [ ] Add "remember me" functionality
- [ ] Implement concurrent session limits

---

## Current Security Status

| Item | Status |
|------|--------|
| Password hashing (bcrypt) | ✅ Implemented |
| JWT authentication | ✅ Implemented |
| SQL injection protection | ✅ Parameterized queries |
| Role-based access | ✅ Implemented |
| HTTPS/SSL | ✅ Configured |
| Rate limiting | ❌ Not implemented |
| Audit logging | ❌ Not implemented |
| File upload validation | ❌ Not implemented |

---

## Estimated Effort

| Task | Time |
|------|------|
| Rate limiting | 2-4 hours |
| Audit logging | 1-2 days |
| S3 file storage | 1-2 days |
| Security hardening | 1 day |
| Error monitoring | 4-8 hours |
| Total | 3-5 days |
