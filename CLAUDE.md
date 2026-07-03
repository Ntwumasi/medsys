# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# MedSys EMR - Claude Development Context

> **Read this document before making any changes to the codebase.**

## Quick Reference

| Item | Value |
|------|-------|
| **Repo layout** | npm-workspaces monorepo (root `package.json` → `client` + `server`). Root `npm run build` builds server then client. |
| **Stack** | React 19 + MUI + TypeScript (client) / Node.js + Express + PostgreSQL (server) |
| **Frontend libs** | MUI (`@mui/material`) for UI, `recharts` + `react-big-calendar` for charts/scheduling, `axios`, `date-fns` |
| **Backend libs** | `zod` (validation), `pino` (logging), `@sentry/node` + `@sentry/react` (error monitoring), `pdfkit`/`exceljs`/`xlsx` (exports), `openai` |
| **Deployment** | Vercel (serverless) + Neon PostgreSQL |
| **Auth** | JWT tokens, bcrypt passwords, role-based access |
| **Default Password** | Admin reset generates a random `TempXXXXXX` per call (returned in the response dialog). Hand the printed value to the user; they're forced to change on first login. |
| **Username Format** | First initial + last name, lowercase (e.g., `jsmith`) |

---

## Project Structure

```
medsys/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── pages/          # ~36 role-based dashboard pages
│       ├── components/     # 40+ reusable components
│       ├── api/            # Axios API clients
│       ├── context/        # Auth, Toast, Notification providers
│       └── types/          # TypeScript interfaces
├── server/                 # Express.js backend
│   └── src/
│       ├── controllers/    # ~50 controllers (business logic)
│       ├── services/       # ~16 services (QB, email/SMS, AI, billing, pricing, audit)
│       ├── routes/         # API route definitions (one monolithic index.ts)
│       ├── middleware/     # auth.ts (JWT + RBAC)
│       └── database/       # db.ts + 100+ tracked migrations
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
| `admin` | Dashboard | User management, system config |
| `patient` | PatientPortal | Own records, messaging |

**Super Admins**: `stamakloe`, `rkyei`, `ntwumasi` - can view any dashboard via role switcher.

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
- Expires after 90 days

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
3. Add auth middleware: `authenticateToken, authorizeRoles('role')`. For patient-facing data, also chain `enforcePatientOwnership` (in `middleware/auth.ts`) so `patient`-role users can only reach their own records — it 403s on mismatched path `:patient_id` and force-rewrites `?patient_id=` query params
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
**Serverless model**: `server/src/index.ts` `export default`s the Express `app`; Vercel wraps that export as the serverless function. `vercel.json` rewrites `/api/*` to it and everything else to the SPA (`client/dist/index.html`). There is no separate `api/` handler file — don't add `app.listen` assumptions to request-path code; the listen call only runs locally.

### Database Migrations
Migrations live in `server/src/database/migrations/` and run through a **tracked runner** (`server/src/database/migrate.ts`). The runner records each applied migration in a `_migrations` table and executes pending files in **alphabetical order**, so name new files to sort after existing ones (e.g. date- or number-prefixed).
```bash
cd server && npm run db:migrate              # run all pending migrations
cd server && npm run db:migrate:status       # show applied vs pending
cd server && npm run db:migrate:dry-run      # preview without applying
cd server && npm run db:migrate:seed         # mark all as applied (first-time setup)
```
Each migration file is also independently runnable (`npx ts-node src/database/migrations/<file>.ts`), but prefer `db:migrate` so it gets tracked.

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
1. **Run migrations** — If you created or modified a migration, run it against the database immediately via the tracked runner. Do not ask for permission.
   ```bash
   cd server && npm run db:migrate
   ```
2. **Build check** — Verify both server and client build before committing.
3. **Commit and push** — Commit the changes and push to `main`. Do not ask for permission.

### Testing Checklist

Before committing:
- [ ] `cd client && npm run build` passes (`tsc -b && vite build` — strictest checks: `verbatimModuleSyntax`, `noUnusedLocals/Parameters`)
- [ ] `cd server && npm run build` passes (`tsc`)
- [ ] Test the feature in browser
- [ ] Check console for errors
- [ ] Verify mobile responsiveness

> **Tests:** Vitest is configured in both `client` and `server`. A small suite now exists (`server/src/tests/*.test.ts` — auth, controllers, pricing rules; `client/src/tests/*.test.ts`). Commands: `npm run test` (watch), `npm run test:run` (single run), `npm run test:coverage`. Run one file with `npm run test:run -- src/tests/authController.test.ts`. The suite is partial and does **not** gate commits — manual browser testing is still the norm. The client lint is `npm run lint` (ESLint); the server has no lint script.

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

- **Super Admin Impersonation** - Role switching (super admins only can use "Login As")
- **Secure Messaging** - Provider-to-provider messaging
- **Password Security** - Lockout, expiry, history
- **Invoice Printing** - New window print approach
- **Staff Management** - Create, edit, reset password, deactivate, bulk actions
- **Future Appointments Tab** - View all upcoming appointments (admin sees all)
- **Audit Log Enhancements** - Pagination, filtering, CSV/JSON export
- **Skeleton Loading** - Improved UX with loading skeletons for tables
- **Follow-up Visit Tracking** - Track patient follow-up appointments

---

## Contacts & Resources

- **Repository**: github.com/Ntwumasi/medsys
- **Deployment**: Vercel (auto-deploys on push to main)
- **Database**: Neon PostgreSQL

---

*Last updated: June 3, 2026*
