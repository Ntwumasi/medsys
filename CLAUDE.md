# MedSys EMR - Claude Development Context

> **Read this document before making any changes to the codebase.**

## Quick Reference

| Item | Value |
|------|-------|
| **Stack** | React 19 + TypeScript + Node.js/Express + PostgreSQL |
| **Deployment** | Vercel (serverless) + Neon PostgreSQL |
| **Auth** | JWT tokens, bcrypt passwords, role-based access |
| **Default Password** | `demo123` (users must change on first login) |
| **Username Format** | First initial + last name, lowercase (e.g., `jsmith`) |

---

## Project Structure

```
medsys/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── pages/          # 24 role-based dashboard pages
│       ├── components/     # 40+ reusable components
│       ├── api/            # Axios API clients
│       ├── context/        # Auth, Toast, Notification providers
│       └── types/          # TypeScript interfaces
├── server/                 # Express.js backend
│   └── src/
│       ├── controllers/    # 33 controllers (business logic)
│       ├── routes/         # API route definitions
│       ├── services/       # QB, email, AI, billing services
│       ├── middleware/     # auth.ts (JWT + RBAC)
│       └── database/       # db.ts + 60+ migrations
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

### Toast Notifications
```typescript
import { useNotification } from '../context/NotificationContext';
const { showToast } = useNotification();
showToast('Success message', 'success');
showToast('Error message', 'error');
```

### Type Imports (IMPORTANT)
TypeScript has `verbatimModuleSyntax` enabled. Use:
```typescript
import type { SomeType } from './types';  // For types
import { someFunction } from './module';   // For values
```

---

## Common Tasks

### Adding a New API Endpoint
1. Create/update controller in `server/src/controllers/`
2. Add route in `server/src/routes/index.ts`
3. Add auth middleware: `authenticateToken, authorizeRoles('role')`
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

### Database Migrations
```bash
cd server && npx ts-node src/database/migrations/<migration>.ts
```

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
1. **Run migrations** — If you created or modified a migration, run it against the database immediately. Do not ask for permission.
   ```bash
   cd server && npx ts-node src/database/migrations/<migration>.ts
   ```
2. **Build check** — Verify both server and client build before committing.
3. **Commit and push** — Commit the changes and push to `main`. Do not ask for permission.

### Testing Checklist

Before committing:
- [ ] `cd client && npm run build` passes
- [ ] `cd server && npm run build` passes
- [ ] Test the feature in browser
- [ ] Check console for errors
- [ ] Verify mobile responsiveness

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

*Last updated: April 7, 2026*
