# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# MedSys EMR - Claude Development Context

> **Read this document before making any changes to the codebase.**

## Quick Reference

| Item | Value |
|------|-------|
| **Repo layout** | npm-workspaces monorepo (root `package.json` → `client` + `server`). Root `npm run build` builds server then client. |
| **Stack** | React 19 + Tailwind + TypeScript (client, Vite) / Node.js + Express + PostgreSQL (server) |
| **Frontend libs** | **Tailwind** for all UI (theme tokens in `client/src/index.css` + `tailwind.config.cjs`: `primary-*`, `success-*`, `warning-*`, `danger-*`). Match existing pages — cards are `bg-white rounded-xl shadow-lg border border-gray-200`. MUI is installed but used in only one file; don't add new MUI UI. `recharts` + `react-big-calendar`, `axios`, `date-fns` |
| **Backend libs** | `zod` (validation), `pino` (logging), `@sentry/node` + `@sentry/react` (error monitoring), `pdfkit`/`exceljs`/`xlsx` (exports), `openai` |
| **Deployment** | Vercel (serverless) + Neon PostgreSQL. Branches: `staging` → staging.medsys.healthcare, `main` → prod, `demo` → demo (see Workflow Rules) |
| **Auth** | JWT tokens, bcrypt passwords, role-based access |
| **Default Password** | Admin reset generates a random `TempXXXXXX` per call (returned in the response dialog). Hand the printed value to the user; they're forced to change on first login. |
| **Username Format** | First initial + last name, lowercase (e.g., `jsmith`) |

---

## Project Structure

```
medsys/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── pages/          # ~39 role-based dashboard pages
│       ├── components/     # ~60 reusable components
│       ├── api/            # Axios API clients
│       ├── context/        # Auth, Toast, Notification providers
│       └── types/          # TypeScript interfaces
├── server/                 # Express.js backend
│   └── src/
│       ├── controllers/    # ~55 controllers (business logic)
│       ├── services/       # ~21 services (QB, email/SMS, patient auto-texts, AI, billing, pricing, audit)
│       ├── routes/         # API routes (monolithic index.ts + a few sub-routers: reminders, claims, qb*, accountant…)
│       ├── middleware/     # auth.ts (JWT + RBAC)
│       └── database/       # db.ts + ~140 tracked migrations
└── docs/                   # Documentation
```

---

## User Roles & Dashboards

| Role | Dashboard | Primary Functions |
|------|-----------|-------------------|
| `doctor` | DoctorDashboard | Encounters, prescriptions, orders |
| `nurse` | NurseDashboard | Vitals, triage, procedures |
| `receptionist` | ReceptionistDashboard | Appointments, check-in, billing |
| `pharmacist` | PharmacyDashboard | Dispensing, inventory |
| `lab` | LabDashboard | Lab orders, results, QC |
| `imaging` | ImagingDashboard | Imaging orders, DICOM |
| `accountant` | AccountantDashboard | Invoices, payments, QB sync |
| `pharmacy` / `pharmacy_tech` | PharmacyDashboard | Same dashboard as `pharmacist` |
| `marketing` | MarketingDashboard | Tasks, calendar, patient contacts, bulk SMS campaigns |
| `office_manager` | Dashboard (curated) | Admin dashboard minus system/oversight sections; passes `authorizeRoles('admin')` checks |
| `admin` | Dashboard | User management, system config |
| `patient` | PatientPortal | Own records (passwordless SMS/email link) |

**Super Admins**: any user with `users.is_super_admin = true` (about a dozen accounts — query the DB, don't hard-code names). They can view any dashboard via the role switcher and "Login As".

---

## Database Quick Reference

### Core Tables
- `users` - Staff accounts with roles
- `patients` - Patient demographics
- `encounters` - Clinical visits
- `appointments` - Scheduling
- `invoices` / `invoice_items` - Billing
- `medications` - Prescriptions
- `lab_orders` / `lab_results` - Lab workflow
- `messages` - Secure messaging

### Security Tables
- `login_attempts` - Failed login tracking (5 max, 15min lockout)
- `password_history` - Prevents password reuse
- `audit_logs` - All user actions
- `breakglass_alerts` - Emergency access logs

---

## Authentication Flow

1. User submits username + password to `/api/auth/login`
2. Server validates, returns JWT token + user object
3. Client stores token, includes in `Authorization: Bearer <token>` header
4. Middleware `authenticateToken` validates JWT on protected routes
5. Middleware `authorizeRoles('role1', 'role2')` checks user role
6. Super admins (`is_super_admin: true`) bypass role checks

### Password Requirements
- 8+ characters
- 1 uppercase, 1 lowercase, 1 number, 1 special character
- Cannot reuse last 5 passwords
- No time-based expiry (removed — it forced whole cohorts through a change-password flow at once). A change is only forced when an admin resets a password (`must_change_password`).

---

## Key API Patterns

### Endpoint Structure
```
GET    /api/patients              # List all
GET    /api/patients/:id          # Get one
POST   /api/patients              # Create
PUT    /api/patients/:id          # Update
DELETE /api/patients/:id          # Soft delete (deactivate)
```

### Error Response Format
```json
{
  "error": "Error message",
  "details": ["Optional array of details"]
}
```

### Auth Middleware Usage
```typescript
router.get('/protected', authenticateToken, authorizeRoles('admin', 'doctor'), handler);
```

---

## Frontend Patterns

### API Client (axios)
```typescript
import apiClient from '../api/client';
const { data } = await apiClient.get('/patients');
```
`client/src/api/client.ts` is more than a thin wrapper — touch it carefully:
- **Base URL**: `VITE_API_URL` → else `/api` in prod (same-origin) → else `http://localhost:5000/api` in dev.
- **Auth**: request interceptor attaches `Bearer <token>` from `localStorage`. On login call `setActiveToken(token)`; on logout call `resetApiClientState()`.
- **Resilient 401 handling**: it does NOT redirect on the first 401. It tolerates a configurable burst of consecutive 401s and a ~10s grace window after login before forcing `/login`, and distinguishes 401 (bad token) from 403 (permission denied). This is deliberate — it prevents the "logged out / must log in twice" glitch. Don't "simplify" it into an eager redirect.
- **GET retries**: idempotent GETs auto-retry up to 2× with exponential backoff; 4xx and non-GET methods are never retried.

### Toast Notifications
```typescript
import { useNotification } from '../context/NotificationContext';
const { showToast } = useNotification();
showToast('Success message', 'success');
showToast('Error message', 'error');
```

### Type Imports (IMPORTANT)
The **client** has `verbatimModuleSyntax` enabled (server does not), so type-only imports are mandatory there or `npm run build` fails:
```typescript
import type { SomeType } from './types';  // For types
import { someFunction } from './module';   // For values
```

---

## Common Tasks

### Adding a New API Endpoint
1. Create/update controller in `server/src/controllers/`
2. Add route in `server/src/routes/index.ts` — **all routes live in this one monolithic ~1000-line file**, grouped by feature; add yours to the matching group
3. Add auth middleware: `authenticateToken, authorizeRoles('role')`. For patient-facing data, also chain `enforcePatientOwnership` (in `middleware/auth.ts`) so `patient`-role users can only reach their own records — it 403s on mismatched path `:patient_id` and force-rewrites `?patient_id=` query params. Patient-portal tokens can ONLY reach the routes in `PATIENT_ALLOWED_ROUTES` (`middleware/auth.ts`) — every other route 403s for them, so a new portal endpoint must be added there. `authenticateToken` also rejects deactivated accounts and tokens issued before `users.tokens_revoked_at` ("log out everywhere", admin password reset)
4. Add API function in `client/src/api/`

### Adding a New Database Table
1. Create migration in `server/src/database/migrations/`
2. Export and call from migration runner
3. Add TypeScript interface in `client/src/types/`

### Adding a New Page
1. Create component in `client/src/pages/`
2. Add route in `client/src/App.tsx`
3. Wrap with `<ProtectedRoute>` if authenticated

---

## External Integrations

### QuickBooks Desktop
- Uses SOAP/XML via Web Connector
- Config in `quickbooks_config` table
- Service: `server/src/services/qbwcService.ts`

### SMS (Arkesel primary, Twilio fallback)
- All sends go through `sendSMS()` in `server/src/services/smsService.ts`; Arkesel is used only when `ARKESEL_SENDER_APPROVED=true` (or sandbox), otherwise it falls through to Twilio.
- `ARKESEL_SANDBOX=true` = nothing delivered (staging always; was used to freeze prod). Sender ID `MedicsGrp` approved 2026-10-22; prod texting LIVE since 2026-10-24.
- Uses: payment reminders (manual), patient portal links, marketing bulk campaigns (admin approval; a campaign created in sandbox stays sandbox), and **automatic patient texts** (`services/patientAutoTextService.ts`): appointment / follow-up / refill reminders (daily Vercel cron, 09:00 UTC = Ghana) + lab-ready / medication-ready / payment receipt (instant). Each kind is an admin toggle in `reminder_settings` (`patient_sms_<kind>_enabled`), managed at SMS → Automatic texts. `patient_sms_log` dedupes on `(kind, ref_key)`; `patients.sms_reminders_opt_out` is separate from `marketing_opt_out`. Texts never name a test or medication.

### OpenAI (for AI features)
- Drug interactions, dosage verification, voice transcription
- Requires `OPENAI_API_KEY` env var
- Service: `server/src/services/aiService.ts`

### Email
- SMTP-based via `server/src/services/emailService.ts`
- Used for receipts, reminders, password resets

---

## Environment Variables

### Required
```
DATABASE_URL=postgresql://...
JWT_SECRET=<min-32-char-secret>
```

### Optional
```
OPENAI_API_KEY=sk-...        # For AI features
SMTP_HOST, SMTP_PORT, etc.   # For email
ARKESEL_API_KEY, ARKESEL_SENDER_ID, ARKESEL_SENDER_APPROVED, ARKESEL_SANDBOX  # SMS
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER                   # SMS fallback
CRON_SECRET                  # Vercel Cron bearer token for /api/cron/* (prod only)
QB_* variables               # For QuickBooks
```

---

## Build & Deploy

### Local Development
```bash
cd server && npm run dev     # Backend on :5000
cd client && npm run dev     # Frontend on :5173
```

### Production Build
```bash
npm run build                # Builds both
```
**Serverless model**: `server/src/index.ts` `export default`s the Express `app`; Vercel wraps that export as the serverless function. `vercel.json` rewrites `/api/*` to it and everything else to the SPA (`client/dist/index.html`). There is no separate `api/` handler file — don't add `app.listen` assumptions to request-path code; the listen call only runs locally. Nothing long-running survives on Vercel (no `setInterval` jobs) — scheduled work goes in `vercel.json` `crons` (production deployments only) hitting a `/api/cron/*` route that checks `CRON_SECRET`.

**Vercel CLI**: run it from the repo **root** (linked to project `medsys`). `server/` is linked to a different Vercel project, so `vercel env …` there reads/writes the wrong project.

### Database Migrations
Migrations live in `server/src/database/migrations/` and run through a **tracked runner** (`server/src/database/migrate.ts`). The runner records each applied migration in a `_migrations` table and executes pending files in **alphabetical order**, so name new files to sort after existing ones (e.g. date- or number-prefixed).
```bash
cd server && npm run db:migrate              # run all pending migrations
cd server && npm run db:migrate:status       # show applied vs pending
cd server && npm run db:migrate:dry-run      # preview without applying
cd server && npm run db:migrate:seed         # mark all as applied (first-time setup)
```
Each migration file is also independently runnable (`npx ts-node src/database/migrations/<file>.ts`), but prefer `db:migrate` so it gets tracked.

**Databases**: `server/.env` `DATABASE_URL` points at the **production** Neon DB — `npm run db:migrate` locally changes prod immediately. Staging (and demo) have their **own** Neon branch DBs. CI (`.github/workflows/ci.yml`) also runs migrations on push: staging DB on `staging`, prod DB on `main`. The staging migrate job has been failing at an old migration (`addDepartmentRoles.ts`, `users_role_check`), so new migrations may need running against the staging DB by hand.

---

## Code Quality Rules

1. **No unused variables** - TypeScript strict mode enforced
2. **Type-only imports** - Use `import type` for interfaces
3. **No hardcoded secrets** - Use environment variables
4. **SQL injection prevention** - Use parameterized queries ($1, $2)
5. **Error handling** - Always catch and handle API errors
6. **Accessibility** - Include aria labels, keyboard navigation

---

## Workflow Rules

### After completing each task:
1. **Run migrations** — If you created or modified a migration, run it via the tracked runner (`cd server && npm run db:migrate`, which hits prod — keep migrations additive/idempotent). Do not ask for permission.
2. **Build + test** — Verify both server and client build and tests pass before committing.
3. **Commit, then push to `staging` only** — `git checkout staging && git merge main && git push && git checkout main`. Do **not** push `main` or `demo` until the user approves after testing on staging.
4. **Promote on approval** — `git push origin main && git checkout demo && git merge main && git push && git checkout main` (`demo` keeps its own merge history — merge, don't fast-forward).

### Testing Checklist

Before committing:
- [ ] `cd client && npm run build` passes (`tsc -b && vite build` — strictest checks: `verbatimModuleSyntax`, `noUnusedLocals/Parameters`)
- [ ] `cd server && npm run build` passes (`tsc`)
- [ ] Test the feature in browser
- [ ] Check console for errors
- [ ] Verify mobile responsiveness

> **Tests:** Vitest in both `client` (~67 tests) and `server` (~184 tests, `server/src/tests/*.test.ts`). Commands: `npm run test` (watch), `npm run test:run` (single run), `npm run test:coverage`. Run one file with `npm run test:run -- src/tests/authController.test.ts`. CI's **"Typecheck, Build & Test"** is a required status check on `main`/`staging` — keep it green. Controller tests mock `pool.query` call-by-call, so changing a controller's query sequence (e.g. wrapping it in a transaction via `pool.connect()`) breaks its mocks; prefer SQL-aware `mockImplementation` mocks. The client lint is `npm run lint` (ESLint, many pre-existing `any` errors); the server has no lint script.

---

## Common Gotchas

1. **Print CSS** - Use new window approach, not @media print
2. **Username normalization** - Login normalizes to lowercase, no spaces
3. **Optional fields** - Add `|| ''` fallback in forms
4. **Super admin bypass** - `is_super_admin` users skip role checks
5. **Date handling** - Use `date-fns` for formatting
6. **Currency** - Ghana Cedis (GHS), format: `GHS 123.45`
7. **Username generation** - First initial + last name, check for duplicates
8. **Future date queries** - Use `NOW()` not `CURRENT_DATE` for time-aware filtering
9. **Type imports** - Use `import type` for TypeScript interfaces
10. **Unused imports** - Remove or TypeScript build will fail

---

## Recent Major Features

- **Automatic patient texts** (2026-10) - reminders + ready/receipt texts, admin toggles, all OFF by default
- **Insured patient cash-pay** (2026-10) - per-med `patient_pays`; invoice lines `bill_to` patient vs payer (QuickBooks split still TODO)
- **Pharmacy** - live queue, per-item inventory History (`inventory_item_changes`), stock-take, batches/expiry, refill calendar
- **Duplicate patients** - 2-of-3 name/phone/DOB matching, warning at every registration, super-admin merge
- **Marketing** - tasks/calendar, contact list + opt-out, bulk SMS campaigns with admin approval
- **Billing** - one invoice per visit across specialists, paid-invoice lock, payer submission/settlement, diagnosis required at sign-off for insured/corporate
- **Password Security** - Lockout + history (time-based expiry was removed)

---

## Contacts & Resources

- **Repository**: github.com/Ntwumasi/medsys
- **Deployment**: Vercel (auto-deploys on push to main)
- **Database**: Neon PostgreSQL

---

*Last updated: October 24, 2026*
