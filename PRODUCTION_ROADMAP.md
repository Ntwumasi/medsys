# MedSys Production Readiness Roadmap

**Document Version:** 1.0
**Created:** February 2026
**Last Updated:** February 2026

---

## Executive Summary

MedSys is an Outpatient/Urgent Care EMR system currently suitable for internal pilot testing. This roadmap outlines the path to production readiness across four phases, with estimated timelines, costs, and trade-offs for each area.

**Current State:** Internal Pilot Ready
**Target State:** Production Ready for Live Patient Data
**Estimated Timeline:** 12-16 weeks
**Estimated Budget Range:** $15,000 - $45,000 (depending on approach)

---

## Phase 1: Critical Security (Weeks 1-3)
*Must complete before any live patient data*

### 1.1 Authentication Hardening

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Password reset via email | Critical | 8 hrs | $400-800 |
| Session timeout (15 min idle) | Critical | 4 hrs | $200-400 |
| Account lockout after failed attempts | Critical | 4 hrs | $200-400 |
| Password strength requirements | Critical | 2 hrs | $100-200 |
| Secure password hashing audit | Critical | 2 hrs | $100-200 |

**Trade-offs:**
- *Session timeout:* Too short = user frustration; too long = security risk. Recommend 15 min with warning.
- *Account lockout:* Can be used for DoS. Consider CAPTCHA after 3 failures instead of hard lockout.

**Tools/Services:**
- SendGrid or AWS SES for email ($20-50/month)
- Or Resend.com (free tier available)

### 1.2 API Security

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Rate limiting (express-rate-limit) | Critical | 4 hrs | $200-400 |
| Input sanitization audit | Critical | 8 hrs | $400-800 |
| SQL injection review | Critical | 4 hrs | $200-400 |
| XSS prevention audit | Critical | 4 hrs | $200-400 |
| CORS configuration review | High | 2 hrs | $100-200 |

**Recommended Approach:**
```
Option A: DIY Implementation
- Cost: ~$1,000-2,000 (developer time)
- Pros: Full control, no recurring costs
- Cons: May miss edge cases

Option B: Security Audit + Implementation
- Cost: ~$3,000-5,000 (professional audit)
- Pros: Expert review, compliance documentation
- Cons: Higher upfront cost
```

### 1.3 HTTPS & Transport Security

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| SSL certificate verification | Critical | 1 hr | Included in Vercel |
| Force HTTPS redirects | Critical | 1 hr | $50-100 |
| Secure cookie settings | Critical | 2 hrs | $100-200 |
| Security headers (helmet.js) | High | 2 hrs | $100-200 |

**Phase 1 Total:** $2,000 - $5,000

---

## Phase 2: Data Protection & Compliance (Weeks 4-7)
*Required for healthcare data*

### 2.1 Audit Logging

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Create audit_logs table | Critical | 4 hrs | $200-400 |
| Log all patient record access | Critical | 12 hrs | $600-1,200 |
| Log all data modifications | Critical | 8 hrs | $400-800 |
| Log authentication events | Critical | 4 hrs | $200-400 |
| Audit log viewer (Admin) | High | 8 hrs | $400-800 |

**Schema Design:**
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'view', 'create', 'update', 'delete'
  resource_type VARCHAR(50) NOT NULL, -- 'patient', 'encounter', 'prescription'
  resource_id INTEGER,
  patient_id INTEGER, -- For easy patient-specific queries
  ip_address INET,
  user_agent TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Data Encryption

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Verify Neon DB encryption at rest | Critical | 2 hrs | Included |
| Encrypt sensitive fields (SSN, etc.) | High | 12 hrs | $600-1,200 |
| Key management setup | High | 8 hrs | $400-800 |
| Backup encryption | High | 4 hrs | $200-400 |

**Trade-offs:**
- *Field-level encryption:* More secure but complicates searching. Consider encrypting only PII fields.
- *Key management:* AWS KMS ($1/key/month + $0.03/10K requests) vs self-managed (free but riskier)

### 2.3 Database Backups

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Automated daily backups | Critical | 4 hrs | $200-400 |
| Point-in-time recovery setup | Critical | 4 hrs | $200-400 |
| Backup testing procedure | High | 4 hrs | $200-400 |
| Offsite backup storage | High | 4 hrs | $200-400 |

**Neon DB Backup Options:**
```
Free Tier: 7-day history
Pro ($19/month): 30-day history + branching
Business ($300/month): Extended retention + support
```

**Recommendation:** Pro tier ($19/month) is sufficient for most clinics.

### 2.4 Compliance Considerations

| Region | Framework | Key Requirements |
|--------|-----------|------------------|
| USA | HIPAA | BAA with vendors, access controls, audit logs, encryption |
| Ghana | Data Protection Act 2012 | Consent, data minimization, security measures |
| EU | GDPR | Consent, right to erasure, data portability |

**HIPAA Compliance Checklist:**
- [ ] Business Associate Agreements (BAA) with Vercel, Neon
- [ ] Access controls (role-based) ✅ Already implemented
- [ ] Audit logging (see 2.1)
- [ ] Encryption in transit ✅ (HTTPS)
- [ ] Encryption at rest (see 2.2)
- [ ] Backup procedures (see 2.3)
- [ ] Workforce training documentation
- [ ] Incident response plan

**Trade-offs:**
```
Option A: Self-managed compliance
- Cost: $2,000-5,000 (implementation) + ongoing effort
- Pros: Lower cost
- Cons: Risk of gaps, no certification

Option B: HIPAA-compliant hosting (AWS GovCloud, Azure Healthcare)
- Cost: $500-2,000/month
- Pros: Built-in compliance features, BAAs
- Cons: Higher recurring cost, migration effort

Option C: Healthcare-specific platform (Aptible, Datica)
- Cost: $500-1,500/month
- Pros: Compliance built-in, audit support
- Cons: Vendor lock-in
```

**Phase 2 Total:** $4,000 - $10,000 + $20-300/month recurring

---

## Phase 3: Reliability & Monitoring (Weeks 8-11)

### 3.1 Error Monitoring

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Sentry integration (frontend) | High | 4 hrs | $200-400 |
| Sentry integration (backend) | High | 4 hrs | $200-400 |
| Error alerting setup | High | 2 hrs | $100-200 |
| Error dashboard | Medium | 4 hrs | $200-400 |

**Service Options:**
```
Sentry: Free (5K events/month) → $26/month (50K events)
LogRocket: $99/month (frontend replay)
Bugsnag: $59/month
```

**Recommendation:** Sentry free tier to start, upgrade as needed.

### 3.2 Performance Monitoring

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| API response time tracking | High | 4 hrs | $200-400 |
| Database query monitoring | High | 4 hrs | $200-400 |
| Uptime monitoring | High | 2 hrs | $100-200 |
| Performance alerting | Medium | 2 hrs | $100-200 |

**Service Options:**
```
Vercel Analytics: Included in Pro ($20/month)
New Relic: Free tier available
Datadog: $15/host/month
UptimeRobot: Free (50 monitors)
```

### 3.3 Logging Infrastructure

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Structured logging setup | High | 4 hrs | $200-400 |
| Log aggregation service | Medium | 4 hrs | $200-400 |
| Log retention policy | Medium | 2 hrs | $100-200 |

**Service Options:**
```
Vercel Logs: Included (limited retention)
Logtail: Free (1GB/month) → $25/month (5GB)
Papertrail: $7/month (basic)
```

### 3.4 Health Checks & Alerting

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Health check endpoints | High | 4 hrs | $200-400 |
| Automated health monitoring | High | 4 hrs | $200-400 |
| PagerDuty/Slack integration | Medium | 4 hrs | $200-400 |
| Status page | Low | 4 hrs | $200-400 |

**Phase 3 Total:** $2,500 - $5,000 + $0-100/month recurring

---

## Phase 4: Testing & Quality (Weeks 12-16)

### 4.1 Automated Testing

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Unit test setup (Vitest) | High | 8 hrs | $400-800 |
| Critical path unit tests | High | 24 hrs | $1,200-2,400 |
| API integration tests | High | 16 hrs | $800-1,600 |
| E2E tests (Playwright) | Medium | 24 hrs | $1,200-2,400 |
| CI/CD test pipeline | High | 8 hrs | $400-800 |

**Test Coverage Strategy:**
```
Minimum Viable Coverage (MVP):
- Authentication flows: 90%
- Patient CRUD: 80%
- Encounter workflow: 80%
- Billing: 80%
- Total target: 60-70% coverage

Full Coverage (Recommended):
- All critical paths: 90%+
- Total target: 80%+ coverage
```

**Trade-offs:**
```
Option A: MVP Testing (~60% coverage)
- Cost: $3,000-5,000
- Time: 4 weeks
- Pros: Faster to production
- Cons: More bugs may slip through

Option B: Comprehensive Testing (~80% coverage)
- Cost: $6,000-10,000
- Time: 8 weeks
- Pros: Higher confidence, easier maintenance
- Cons: Longer timeline
```

### 4.2 Load Testing

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Load testing setup (k6) | Medium | 8 hrs | $400-800 |
| Baseline performance tests | Medium | 8 hrs | $400-800 |
| Stress testing | Medium | 4 hrs | $200-400 |
| Performance optimization | Medium | 16 hrs | $800-1,600 |

**Expected Load (Small-Medium Clinic):**
- Concurrent users: 10-50
- Requests/minute: 100-500
- Database connections: 20-50

### 4.3 User Acceptance Testing

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| UAT test plan creation | High | 8 hrs | $400-800 |
| UAT environment setup | High | 4 hrs | $200-400 |
| Bug tracking setup | High | 2 hrs | $100-200 |
| UAT execution support | High | 16 hrs | $800-1,600 |

**Phase 4 Total:** $5,000 - $15,000

---

## Phase 5: UX Polish & Documentation (Ongoing)

### 5.1 Mobile Responsiveness

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Mobile audit all dashboards | Medium | 8 hrs | $400-800 |
| Touch-friendly controls | Medium | 8 hrs | $400-800 |
| Responsive tables | Medium | 8 hrs | $400-800 |
| Mobile navigation | Medium | 4 hrs | $200-400 |

### 5.2 Offline Handling

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| Offline detection | Low | 4 hrs | $200-400 |
| Graceful error states | Medium | 8 hrs | $400-800 |
| Data sync on reconnect | Low | 16 hrs | $800-1,600 |

### 5.3 Documentation

| Task | Priority | Effort | Cost Estimate |
|------|----------|--------|---------------|
| User manual | High | 16 hrs | $800-1,600 |
| Admin guide | High | 8 hrs | $400-800 |
| API documentation | Medium | 8 hrs | $400-800 |
| Training materials | High | 16 hrs | $800-1,600 |

**Phase 5 Total:** $4,000 - $8,000

---

## Cost Summary

### Development Costs

| Phase | Minimum | Maximum | Timeline |
|-------|---------|---------|----------|
| Phase 1: Security | $2,000 | $5,000 | 3 weeks |
| Phase 2: Compliance | $4,000 | $10,000 | 4 weeks |
| Phase 3: Monitoring | $2,500 | $5,000 | 4 weeks |
| Phase 4: Testing | $5,000 | $15,000 | 5 weeks |
| Phase 5: Polish | $4,000 | $8,000 | Ongoing |
| **Total Development** | **$17,500** | **$43,000** | **16 weeks** |

### Monthly Recurring Costs

| Service | Minimum | Recommended |
|---------|---------|-------------|
| Vercel Pro | $20 | $20 |
| Neon Pro | $19 | $19 |
| Email (SendGrid) | $0 | $20 |
| Error Monitoring | $0 | $26 |
| Uptime Monitoring | $0 | $0 |
| **Total Monthly** | **$39** | **$85** |

### Optional Services

| Service | Cost | When Needed |
|---------|------|-------------|
| Professional Security Audit | $3,000-10,000 | Before launch |
| HIPAA Compliance Consultant | $5,000-15,000 | If required |
| Penetration Testing | $2,000-5,000 | Before launch |
| Healthcare Hosting Migration | $5,000-10,000 | If compliance requires |

---

## Recommended Implementation Order

### Fast Track (8 weeks) - Higher Risk
```
Week 1-2: Phase 1 (Critical Security)
Week 3-4: Phase 2.1-2.3 (Audit logs, backups)
Week 5-6: Phase 3.1-3.2 (Error/Performance monitoring)
Week 7-8: Phase 4.3 (UAT only)

Estimated Cost: $8,000-15,000
Risk Level: Medium-High
```

### Standard Track (12 weeks) - Balanced
```
Week 1-3: Phase 1 (Critical Security)
Week 4-6: Phase 2 (Data Protection)
Week 7-9: Phase 3 (Monitoring)
Week 10-12: Phase 4 MVP Testing + UAT

Estimated Cost: $12,000-25,000
Risk Level: Medium
```

### Enterprise Track (16+ weeks) - Lower Risk
```
Week 1-3: Phase 1 (Critical Security)
Week 4-7: Phase 2 (Full Compliance)
Week 8-11: Phase 3 (Full Monitoring)
Week 12-16: Phase 4 (Comprehensive Testing)
Ongoing: Phase 5 (Polish)

Estimated Cost: $20,000-45,000
Risk Level: Low
```

---

## Decision Matrix

### When to Choose Each Track

| Factor | Fast Track | Standard | Enterprise |
|--------|------------|----------|------------|
| Budget | < $15K | $15-30K | > $30K |
| Timeline | Urgent | Flexible | Long-term |
| Data Sensitivity | Low-Medium | Medium | High (HIPAA) |
| User Count | < 10 | 10-50 | 50+ |
| IT Support | Limited | Some | Dedicated |

---

## Risk Assessment

### High-Impact Risks

| Risk | Impact | Mitigation | Cost to Mitigate |
|------|--------|------------|------------------|
| Data breach | Critical | Security audit, encryption | $5,000-15,000 |
| Data loss | Critical | Automated backups, DR plan | $500-2,000 |
| HIPAA violation | Critical | Compliance review | $5,000-15,000 |
| System downtime | High | Monitoring, redundancy | $1,000-3,000 |
| Performance issues | Medium | Load testing, optimization | $1,000-3,000 |

### Accepted Risks (for Pilot)

- Limited test coverage
- Manual backup verification
- Basic monitoring
- Mobile experience not optimized

---

## Next Steps

1. **Immediate (This Week)**
   - Decide on implementation track
   - Set budget allocation
   - Identify internal resources vs contractors

2. **Short-term (Next 2 Weeks)**
   - Begin Phase 1 security hardening
   - Set up email service for password reset
   - Configure rate limiting

3. **Medium-term (Next Month)**
   - Implement audit logging
   - Set up backup procedures
   - Begin monitoring setup

---

## Appendix A: Vendor Comparison

### Database Hosting

| Vendor | Free Tier | Pro Cost | HIPAA BAA |
|--------|-----------|----------|-----------|
| Neon | 0.5GB | $19/mo | Available |
| Supabase | 500MB | $25/mo | Available |
| PlanetScale | 5GB | $29/mo | Available |
| AWS RDS | 12 mo trial | $15-50/mo | Available |

### Hosting

| Vendor | Free Tier | Pro Cost | HIPAA BAA |
|--------|-----------|----------|-----------|
| Vercel | Yes | $20/mo | Custom |
| Render | Yes | $7/mo | Available |
| Railway | Yes | $5/mo | No |
| AWS | 12 mo trial | Variable | Available |

### Email Services

| Vendor | Free Tier | Pro Cost | Notes |
|--------|-----------|----------|-------|
| SendGrid | 100/day | $20/mo | Reliable |
| Resend | 3K/mo | $20/mo | Developer-friendly |
| AWS SES | None | $0.10/1K | Cheapest at scale |
| Postmark | None | $10/mo | Best deliverability |

---

## Appendix B: HIPAA Quick Reference

### Required Safeguards

**Administrative:**
- [ ] Security officer designated
- [ ] Risk assessment documented
- [ ] Workforce training
- [ ] Incident response procedures

**Physical:**
- [ ] Workstation security policies
- [ ] Device/media controls

**Technical:**
- [ ] Access controls ✅
- [ ] Audit controls (Phase 2)
- [ ] Integrity controls ✅
- [ ] Transmission security ✅

### Business Associate Agreements Needed

- [ ] Vercel (hosting)
- [ ] Neon (database)
- [ ] Email provider
- [ ] Error monitoring service
- [ ] Any other data processor

---

*Document maintained by: Development Team*
*Review schedule: Quarterly*
