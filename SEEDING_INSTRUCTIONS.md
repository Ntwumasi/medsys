# Database Seeding Instructions

## Purpose
This script populates your database with:
- **10 Examination Rooms** (Room 1-10)
- **Demo Staff Users** (admin, receptionist, 2 nurses, 2 doctors)

## Quick Start

### Seed Production Database (Neon)

1. **Set your production DATABASE_URL temporarily:**

```bash
export DATABASE_URL="postgresql://neondb_owner:npg_PFEh7HSN0jOk@ep-red-sea-a3qcqr01-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

2. **Run the seed script:**

```bash
cd /Users/nokio/GitRepos/medsys
npm run db:seed --workspace=server
```

3. **Verify the output:**

You should see:
```
🌱 Starting database seeding...
📦 Seeding rooms...
✅ Created 10 examination rooms
👥 Seeding demo users...
✅ Created 6 demo users
🎉 Database seeding completed successfully!

Demo credentials:
  Admin: admin@medsys.com / demo123
  Receptionist: receptionist@medsys.com / demo123
  Nurse: nurse@medsys.com / demo123
  Doctor: doctor@medsys.com / demo123
```

## What Gets Created

### Rooms
- Room 1-10 (Examination rooms, all available)

### Demo Users
| Email | Role | Password | Name |
|-------|------|----------|------|
| admin@medsys.com | admin | demo123 | Admin User |
| receptionist@medsys.com | receptionist | demo123 | Jane Smith |
| nurse@medsys.com | nurse | demo123 | Sarah Johnson |
| nurse2@medsys.com | nurse | demo123 | Michael Brown |
| doctor@medsys.com | doctor | demo123 | Dr. John Williams |
| doctor2@medsys.com | doctor | demo123 | Dr. Emily Davis |

## Safe Re-running

The seed script checks if data already exists before inserting:
- ✓ If rooms exist, it skips room creation
- ✓ If users exist, it skips user creation
- ✓ Safe to run multiple times

## Troubleshooting

**Error: "connect ECONNREFUSED"**
- Make sure your DATABASE_URL environment variable is set correctly
- Check that the database is accessible

**Error: "relation does not exist"**
- Run database setup first: `npm run db:setup --workspace=server`
- Or use Neon's SQL Editor to run the schema

**Error: "duplicate key value"**
- This means the data already exists (email or room number)
- This is expected if you run the script multiple times
