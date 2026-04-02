# MedSys EMR - Production Readiness Checklist

## Executive Summary

This document outlines everything needed to safely deploy MedSys EMR to production, including security checks, CI/CD best practices, and considerations for solo engineers.

---

# PART 1: PRODUCTION CHECKLIST

## Security Checklist

### Authentication & Authorization
- [x] JWT-based authentication implemented
- [x] Password hashing with bcrypt (cost factor 10)
- [x] Password complexity requirements enforced
- [x] Login attempt tracking with lockout (5 attempts, 15 min)
- [x] Password expiry (90 days)
- [x] Password history (no reuse of last 5)
- [x] Role-based access control (RBAC)
- [x] Super admin impersonation logging
- [ ] **TODO**: Implement refresh tokens (currently using long-lived JWTs)
- [ ] **TODO**: Add rate limiting on all endpoints
- [ ] **TODO**: Implement CSRF protection for non-API routes

### Data Protection
- [x] SQL parameterized queries (prevents SQL injection)
- [x] Input validation on forms
- [x] Audit logging for user actions
- [ ] **TODO**: Add input sanitization library (e.g., DOMPurify for HTML)
- [ ] **TODO**: Implement field-level encryption for SSN, sensitive data
- [ ] **TODO**: Add request body size limits
- [ ] **CRITICAL**: Review all API endpoints for authorization checks

### Environment & Secrets
- [x] Secrets in environment variables (not in code)
- [x] .env files excluded from git
- [ ] **TODO**: Rotate JWT_SECRET before production
- [ ] **TODO**: Use different database for production vs development
- [ ] **TODO**: Implement secret rotation policy

### HIPAA Compliance Considerations
- [x] Audit logging implemented
- [x] Breakglass access logging
- [x] User authentication required
- [ ] **TODO**: Implement session timeout (auto-logout after inactivity)
- [ ] **TODO**: Add PHI access logging
- [ ] **TODO**: Implement data retention policies
- [ ] **TODO**: Create Business Associate Agreement (BAA) process
- [ ] **TODO**: Document disaster recovery procedures

---

## Infrastructure Checklist

### Database
- [x] PostgreSQL on Neon (serverless)
- [x] SSL connections required (`sslmode=require`)
- [ ] **TODO**: Set up automated backups (Neon has point-in-time recovery)
- [ ] **TODO**: Create database user with minimal privileges (not owner)
- [ ] **TODO**: Set up connection pooling limits
- [ ] **CRITICAL**: Test database failover/recovery

### Application
- [x] TypeScript compilation succeeds
- [x] Production build works
- [x] Environment variables configured in Vercel
- [ ] **TODO**: Set up health check endpoint (`/api/health`)
- [ ] **TODO**: Implement graceful shutdown
- [ ] **TODO**: Add request ID tracking for debugging

### Monitoring & Logging
- [ ] **CRITICAL**: Set up error tracking (Sentry, LogRocket, or similar)
- [ ] **CRITICAL**: Set up uptime monitoring (Better Stack, Pingdom)
- [ ] **TODO**: Configure structured logging (JSON format)
- [ ] **TODO**: Set up performance monitoring (Vercel Analytics)
- [ ] **TODO**: Create alerting for critical errors

### Performance
- [ ] **TODO**: Add database indexes for common queries
- [ ] **TODO**: Implement API response caching where appropriate
- [ ] **TODO**: Add pagination to all list endpoints
- [ ] **TODO**: Optimize large queries (N+1 problems)
- [ ] **TODO**: Set up CDN for static assets (Vercel handles this)

---

## Application Checklist

### Error Handling
- [x] Try-catch blocks in API handlers
- [x] Error responses with meaningful messages
- [ ] **TODO**: Create global error handler middleware
- [ ] **TODO**: Don't expose stack traces in production
- [ ] **TODO**: Log errors with full context

### Data Validation
- [x] Frontend form validation
- [ ] **TODO**: Add backend validation library (Joi, Zod, or Yup)
- [ ] **TODO**: Validate all request bodies
- [ ] **TODO**: Validate all URL parameters

### Testing
- [ ] **CRITICAL**: Add unit tests for critical business logic
- [ ] **CRITICAL**: Add integration tests for API endpoints
- [ ] **TODO**: Add end-to-end tests for key workflows
- [ ] **TODO**: Set up test database for automated testing
- [ ] **TODO**: Add test coverage reporting

---

## Deployment Checklist

### Pre-Deployment
- [ ] All environment variables set in Vercel
- [ ] Database migrations run successfully
- [ ] Production build completes without errors
- [ ] Manual testing of critical flows completed
- [ ] Backup of current database taken

### Deployment Day
- [ ] Deploy during low-traffic period
- [ ] Monitor error rates post-deployment
- [ ] Have rollback plan ready
- [ ] Test critical paths after deployment
- [ ] Verify all integrations working (QB, email, etc.)

### Post-Deployment
- [ ] Monitor performance metrics
- [ ] Check error logs
- [ ] Verify scheduled jobs running (if any)
- [ ] Update documentation
- [ ] Communicate to users if needed

---

# PART 2: CI/CD BEST PRACTICES

## Current Setup Analysis

**Current**: Direct push to `main` → Auto-deploy to Vercel

**Issues**:
1. No automated testing before deploy
2. No staging environment
3. No code review process
4. Single point of failure

## Recommended CI/CD Pipeline

### Immediate Improvements

#### 1. Add GitHub Actions Workflow
Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --workspaces

      - name: Build server
        run: cd server && npm run build

      - name: Build client
        run: cd client && npm run build

      - name: Run tests
        run: npm test --workspaces --if-present

      - name: Type check
        run: cd client && npx tsc --noEmit
```

#### 2. Branch Protection Rules
In GitHub Settings → Branches → Add rule for `main`:
- Require pull request before merging
- Require status checks to pass (CI workflow)
- Require branches to be up to date
- Do not allow force pushes

#### 3. Create Staging Environment
In Vercel:
1. Create Preview deployments for PRs
2. Connect `develop` branch to staging URL
3. Production only deploys from `main`

### Workflow Recommendation

```
feature-branch → PR → develop (staging) → PR → main (production)
                  ↑         ↑                    ↑
              CI runs   Manual test          Final review
```

### Database Migration Strategy

**Problem**: Migrations currently run manually

**Solution**:
1. Add migration tracking table
2. Run migrations on deployment via build script
3. Make migrations idempotent (check if already applied)

```typescript
// server/src/database/migrate.ts
async function runMigrations() {
  // Create migrations table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Run pending migrations
  for (const migration of migrations) {
    const applied = await pool.query(
      'SELECT 1 FROM _migrations WHERE name = $1',
      [migration.name]
    );
    if (applied.rows.length === 0) {
      await migration.up();
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
    }
  }
}
```

---

# PART 3: SOLO ENGINEER BLIND SPOTS

## Critical Issues You Might Be Missing

### 1. **No Automated Testing**
- **Risk**: Bugs reach production undetected
- **Impact**: Data corruption, security vulnerabilities
- **Fix**: Add at least smoke tests for critical paths
  - User login/logout
  - Patient creation
  - Encounter workflow
  - Invoice generation
  - Payment processing

### 2. **No Error Monitoring**
- **Risk**: Users experience errors you never see
- **Impact**: Lost trust, data issues, silent failures
- **Fix**:
  ```bash
  npm install @sentry/react @sentry/node
  ```
  Set up Sentry for both frontend and backend

### 3. **No Backup Testing**
- **Risk**: Backups exist but may not be restorable
- **Impact**: Complete data loss
- **Fix**: Schedule monthly restore tests to verify backups work

### 4. **No Rate Limiting**
- **Risk**: API abuse, DoS attacks, brute force
- **Impact**: Service unavailable, security breach
- **Fix**:
  ```typescript
  import rateLimit from 'express-rate-limit';
  app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 100 }));
  app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 5 }));
  ```

### 5. **No Health Checks**
- **Risk**: Service down without knowing
- **Impact**: Extended downtime
- **Fix**: Add `/api/health` endpoint and external monitoring

### 6. **Single Point of Knowledge**
- **Risk**: Only you know how everything works
- **Impact**: Can't take vacation, bus factor = 1
- **Fix**:
  - Document everything (CLAUDE_CONTEXT.md is a start)
  - Record video walkthroughs of critical systems
  - Create runbooks for common operations

### 7. **No Disaster Recovery Plan**
- **Risk**: Don't know what to do when things break
- **Impact**: Extended downtime, data loss
- **Fix**: Document:
  - How to rollback a deployment
  - How to restore database from backup
  - How to reset a user's password manually
  - Emergency contact procedures

### 8. **Missing Input Validation**
- **Risk**: Invalid data, injection attacks
- **Impact**: Data corruption, security breach
- **Fix**: Add Zod validation to all API endpoints
  ```typescript
  import { z } from 'zod';
  const PatientSchema = z.object({
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    // ...
  });
  ```

### 9. **No Session Timeout**
- **Risk**: Abandoned sessions stay active
- **Impact**: HIPAA violation, security risk
- **Fix**: Implement 30-minute inactivity logout

### 10. **Logging Gaps**
- **Risk**: Can't debug production issues
- **Impact**: Extended troubleshooting time
- **Fix**: Add structured logging with request IDs

---

## Prioritized Action Items

### Must Do Before Production (P0)

1. **Set up error monitoring** (Sentry)
2. **Add health check endpoint**
3. **Set up uptime monitoring** (Better Stack free tier)
4. **Rotate JWT_SECRET**
5. **Verify database backups are configured**
6. **Test critical user flows manually**

### Should Do Within 2 Weeks (P1)

1. Add GitHub Actions CI pipeline
2. Enable branch protection on `main`
3. Add rate limiting
4. Implement session timeout
5. Add basic smoke tests
6. Set up staging environment

### Should Do Within 1 Month (P2)

1. Add comprehensive input validation
2. Implement refresh tokens
3. Add performance monitoring
4. Create disaster recovery documentation
5. Add integration tests
6. Review and document all API endpoints

---

## Quick Wins You Can Do Today

```bash
# 1. Add a health check endpoint
# server/src/routes/index.ts
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

# 2. Check your secrets aren't committed
git log --all --full-history -- "**/.env*"

# 3. Verify HTTPS is enforced (Vercel does this automatically)

# 4. Review database users and permissions
# Neon dashboard → Settings → Roles

# 5. Enable Vercel's built-in analytics
# Vercel dashboard → Analytics → Enable
```

---

## Monitoring Recommendations

### Free Tier Options

| Tool | Purpose | Free Tier |
|------|---------|-----------|
| **Sentry** | Error tracking | 5K events/month |
| **Better Stack** | Uptime monitoring | 10 monitors |
| **Vercel Analytics** | Performance | Built-in |
| **Neon** | DB monitoring | Built-in dashboard |
| **GitHub Actions** | CI/CD | 2K minutes/month |

### Essential Alerts to Set Up

1. **Error rate spike** - More than 10 errors/minute
2. **Site down** - Health check fails 3x in a row
3. **Database connection failures** - Any connection error
4. **Login failures spike** - Possible brute force attack
5. **Slow response times** - P95 > 3 seconds

---

## Documentation Needed

- [x] CLAUDE_CONTEXT.md - Development context
- [x] PRODUCTION_READINESS.md - This document
- [ ] API_DOCUMENTATION.md - All endpoints documented
- [ ] RUNBOOK.md - Operational procedures
- [ ] DISASTER_RECOVERY.md - Recovery procedures
- [ ] ONBOARDING.md - New developer guide

---

*This document should be reviewed and updated quarterly.*

*Last updated: April 2026*
