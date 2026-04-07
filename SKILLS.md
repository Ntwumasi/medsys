# MedSys EMR - Common Workflows & Skills

> Quick reference for common development tasks in MedSys.

---

## Build & Deploy

### Full Build Check
```bash
# Build both client and server
cd /Users/nokio/GitRepos/medsys
cd client && npm run build && cd ../server && npm run build
```

### Deploy to Production (Vercel)
```bash
# Commits auto-deploy on push to main
git add . && git commit -m "message" && git push
```

### Manual Vercel Deploy
```bash
vercel --prod
```

---

## Database Operations

### Run a Migration
```bash
cd server
npx ts-node src/database/migrations/<migration-name>.ts
```

### Seed Data
```bash
cd server
npm run db:seed:<seed-name>
```

### Check Table Schema
```bash
# Connect to Neon DB (use DATABASE_URL from Vercel env)
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'table_name';"
```

---

## Common Development Tasks

### Add New API Endpoint
1. Create/update controller: `server/src/controllers/<name>Controller.ts`
2. Add route: `server/src/routes/<name>.ts`
3. Register in `server/src/routes/index.ts`
4. Add client API: `client/src/api/<name>.ts`

### Add New Page
1. Create component: `client/src/pages/<PageName>.tsx`
2. Add route in `client/src/App.tsx`
3. Wrap with `<ProtectedRoute roles={['role']}>` if needed

### Add Database Table
1. Create migration: `server/src/database/migrations/add<TableName>.ts`
2. Add TypeScript interface: `client/src/types/<name>.ts`
3. Run migration

---

## Testing Accounts

| Role | Username | Password |
|------|----------|----------|
| Admin | `stamakloe` | `demo123` |
| Doctor | `kojo.essel` | `demo123` |
| Nurse | `wendy.sarpong` | `demo123` |
| Receptionist | `wendy.nunoo` | `demo123` |
| Pharmacist | `irene.taddese` | `demo123` |
| Lab Tech | `enoch.tamatey` | `demo123` |
| Accountant | `sarah.prah` | `demo123` |

**Super Admins**: `stamakloe`, `rkyei`, `ntwumasi`

---

## Git Workflow

### Feature Branch
```bash
git checkout -b feature/<feature-name>
# Make changes
git add .
git commit -m "Add <feature>"
git push -u origin feature/<feature-name>
# Create PR via GitHub
```

### Quick Fix (main branch)
```bash
git add .
git commit -m "Fix: <description>"
git push
```

---

## Debugging

### Check Server Logs
```bash
vercel logs medsys-five.vercel.app
```

### Check API Response
```bash
curl -s "https://medsys-five.vercel.app/api/<endpoint>" \
  -H "Authorization: Bearer <token>"
```

### Database Query Check
```bash
# Check data directly
psql $DATABASE_URL -c "SELECT * FROM <table> LIMIT 5;"
```

---

## Common Issues & Solutions

### TypeScript Build Errors
- **Unused imports**: Remove them
- **Type-only imports**: Use `import type { X }` for interfaces
- **Missing types**: Add to `client/src/types/`

### Database Errors
- **NOT NULL violation**: Check required fields in INSERT
- **Foreign key**: Verify referenced record exists
- **Duplicate**: Check unique constraints

### Auth Issues
- **401 Unauthorized**: Token expired, re-login
- **403 Forbidden**: Role doesn't have permission
- **Login fails**: Check username (lowercase) and password

---

## Quick Reference Commands

| Task | Command |
|------|---------|
| Start dev server | `cd server && npm run dev` |
| Start dev client | `cd client && npm run dev` |
| Build all | `npm run build` |
| Run migration | `npx ts-node src/database/migrations/<file>.ts` |
| Deploy | `git push` (auto-deploys) |
| Check logs | `vercel logs` |
| Pull env vars | `vercel env pull .env.local` |

---

*Last updated: April 7, 2026*
