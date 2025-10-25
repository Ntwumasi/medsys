# MedSys Project Context

**Last Updated:** October 25, 2024
**Status:** Ready for production deployment
**Demo Date:** Tomorrow (October 26, 2024)

---

## 🎯 Project Overview

**MedSys** is a complete urgent care/ER Electronic Medical Record (EMR) system with role-based workflow management. Built for a client demo tomorrow.

### Core Features Completed
- ✅ Role-based dashboards (Receptionist, Nurse, Doctor)
- ✅ Patient check-in and triage workflow
- ✅ Color-coded priority system (Green/Yellow/Red)
- ✅ Room management (8 exam rooms)
- ✅ Vital signs tracking
- ✅ Clinical notes with signing/sealing
- ✅ Order system (Labs, Imaging, Pharmacy)
- ✅ Integrated billing (auto-increments with services)
- ✅ Medical history across encounters
- ✅ Auto-generated encounter numbers

---

## 📁 Project Structure

```
medsys/
├── client/                          # React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ReceptionistDashboard.tsx    # Check-in, room/nurse assignment
│   │   │   ├── NurseDashboard.tsx           # Vitals, H&P notes, alerts
│   │   │   ├── DoctorDashboard.tsx          # Orders, note signing
│   │   │   ├── Login.tsx                     # Role-based login
│   │   │   ├── PatientList.tsx
│   │   │   ├── PatientDetails.tsx
│   │   │   └── PatientRegistration.tsx
│   │   ├── context/
│   │   │   └── AuthContext.tsx               # JWT authentication
│   │   ├── api/                              # Axios API clients
│   │   └── types/                            # TypeScript interfaces
│   └── package.json
│
├── server/                          # Express.js backend
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.ts             # Login, registration
│   │   │   ├── patientController.ts          # Patient CRUD
│   │   │   ├── encounterController.ts        # Basic encounters
│   │   │   ├── workflowController.ts         # 🆕 Receptionist/Nurse/Doctor workflows
│   │   │   ├── clinicalNotesController.ts    # 🆕 Notes with signing
│   │   │   ├── ordersController.ts           # 🆕 Lab/Imaging/Pharmacy orders
│   │   │   ├── appointmentController.ts
│   │   │   └── medicationController.ts
│   │   ├── database/
│   │   │   ├── setup.ts                      # Base table creation
│   │   │   ├── migration_workflow.ts         # 🆕 Workflow tables
│   │   │   ├── create_test_users.ts          # 🆕 Test user seeder
│   │   │   ├── create_test_patients.ts       # 🆕 Test patient seeder
│   │   │   └── db.ts                         # Postgres connection (supports SSL)
│   │   ├── routes/
│   │   │   └── index.ts                      # All API routes
│   │   ├── middleware/
│   │   │   └── auth.ts                       # JWT verification
│   │   └── types/
│   │       └── index.ts                      # TypeScript interfaces
│   └── package.json
│
├── PROJECT_CONTEXT.md               # 📄 This file - project memory
├── WORKFLOW_IMPLEMENTATION.md       # Feature documentation
├── DEPLOYMENT.md                    # Deployment guide
├── vercel.json                      # Vercel configuration
└── render.yaml                      # Render configuration (not used now)
```

---

## 🗄️ Database Schema

**Provider:** Vercel Postgres (Neon)
**Connection:** `postgresql://neondb_owner:npg_PFEh7HSN0jOk@ep-red-sea-adqcqr01.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require`

### Core Tables (26 total)
- `users` - Authentication (receptionist, nurse, doctor, admin, patient)
- `patients` - Patient demographics
- `encounters` - Patient visits with workflow tracking
- `rooms` - 8 exam rooms (Room 1-8)
- `clinical_notes` - Role-based notes with signing capability
- `appointments` - Scheduling
- `medications` - Prescriptions
- `allergies` - Patient allergies
- `medical_history` - Conditions
- `surgical_history` - Procedures
- `lab_orders` - Lab tests ($75/order)
- `imaging_orders` - X-rays, CT, MRI ($150/order)
- `pharmacy_orders` - 🆕 Medication orders ($25/order)
- `alerts` - 🆕 Nurse-to-doctor notifications
- `invoices` - Billing records
- `invoice_items` - Line items
- `payments` - Payment tracking

### Key Workflow Fields in Encounters Table
```sql
encounter_number VARCHAR(50)         -- Auto: ENC20241025-000001
room_id INTEGER                      -- Assigned room
nurse_id INTEGER                     -- Assigned nurse
receptionist_id INTEGER              -- Who checked in
triage_time TIMESTAMP                -- For color coding
triage_priority VARCHAR(20)          -- green/yellow/red
checked_in_at TIMESTAMP
nurse_started_at TIMESTAMP
doctor_started_at TIMESTAMP
completed_at TIMESTAMP
```

---

## 🔐 Test Accounts

**All passwords:** `demo123`

```
Receptionist: receptionist@clinic.com
Nurse:        nurse@clinic.com
Doctor:       doctor@clinic.com
Admin:        admin@clinic.com
```

**Test Patients:**
- PAT001 - John Doe (Male, DOB: 1985-03-15)
- PAT002 - Emily Smith (Female, DOB: 1972-07-22)
- PAT003 - Michael Brown (Male, DOB: 1990-11-30)

---

## 🔄 Complete Workflow

### Step 1: Receptionist (`/dashboard` when logged in as receptionist)
1. Search for patient by name or patient number
2. Enter chief complaint
3. Click "Check In Patient"
4. Patient appears in queue with **GREEN** priority
5. Assign room from dropdown (updates room status)
6. Assign nurse from dropdown (sends alert to nurse)
7. Billing invoice created at $0

### Step 2: Nurse (`/dashboard` when logged in as nurse)
1. See assigned patients in left panel
2. Click patient to view details
3. Enter vital signs (temp, BP, HR, RR, O2 sat, height, weight)
4. System auto-alerts if critical vitals detected
5. Add H&P (History & Physical) note
6. Click "Alert Doctor - Patient Ready"

### Step 3: Doctor (`/dashboard` when logged in as doctor)
1. View patients organized by room number
2. Click room to see patient details
3. Review vitals and chief complaint
4. Place orders:
   - Lab tests (adds $75 to bill)
   - Imaging/X-rays (adds $150)
   - Pharmacy/medications (adds $25)
5. Add doctor's assessment and plan notes
6. Click "Sign Note" (locks note, adds $150 to bill)
7. Click "Complete Encounter & Release Room"

### Color Coding (Auto-updates every 30 seconds)
- 🟢 **Green:** 0-15 minutes since triage
- 🟡 **Yellow:** 15-30 minutes
- 🔴 **Red:** 30+ minutes

---

## 🏗️ Tech Stack

### Frontend
- **Framework:** React 19 + Vite
- **Routing:** React Router DOM v7
- **Styling:** Tailwind CSS v4
- **HTTP Client:** Axios
- **Date Handling:** date-fns
- **Language:** TypeScript

### Backend
- **Framework:** Express.js v5
- **Database:** PostgreSQL (Vercel Postgres/Neon)
- **ORM:** Raw SQL queries with `pg` driver
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcrypt
- **Language:** TypeScript

### Deployment (In Progress)
- **Frontend:** Vercel
- **Backend:** Vercel Serverless Functions (converting now)
- **Database:** Vercel Postgres (already set up)

---

## 📡 API Endpoints

**Base URL (Local):** `http://localhost:5000/api`
**Base URL (Prod):** TBD (will be Vercel)

### Authentication
- `POST /auth/register` - Create user
- `POST /auth/login` - Login (returns JWT)
- `GET /auth/me` - Get current user

### Workflow - Receptionist
- `POST /workflow/check-in` - Check in patient
- `POST /workflow/assign-room` - Assign room
- `POST /workflow/assign-nurse` - Assign nurse
- `GET /workflow/queue` - Get patient queue with colors
- `GET /workflow/rooms` - Get all room statuses
- `GET /workflow/nurses` - Get available nurses

### Workflow - Nurse
- `POST /workflow/nurse/start` - Start seeing patient
- `POST /workflow/nurse/vitals` - Submit vital signs
- `POST /workflow/nurse/alert-doctor` - Alert doctor
- `GET /workflow/nurse/patients` - Get assigned patients

### Workflow - Doctor
- `POST /workflow/doctor/start` - Start seeing patient
- `GET /workflow/doctor/rooms` - Get patients by room
- `POST /workflow/release-room` - Complete encounter

### Clinical Notes
- `POST /clinical-notes` - Create note
- `GET /clinical-notes/encounter/:id` - Get encounter notes
- `GET /clinical-notes/patient/:id` - Get patient notes (all encounters)
- `PUT /clinical-notes/:id` - Update note (if not locked)
- `POST /clinical-notes/:id/sign` - Sign note (doctor only, locks it)

### Orders
- `POST /orders/lab` - Order lab test
- `POST /orders/imaging` - Order X-ray/imaging
- `POST /orders/pharmacy` - Order medication
- `GET /orders/encounter/:id` - Get all orders for encounter

### Patients
- `POST /patients` - Register patient
- `GET /patients` - List patients
- `GET /patients/:id` - Get patient details
- `GET /patients/:id/summary` - Get full patient summary

---

## 🚀 Current Deployment Status

### ✅ Completed
- [x] Database setup on Vercel Postgres
- [x] All migrations run successfully
- [x] Test users created
- [x] Test patients created
- [x] Code pushed to GitHub

### 🔄 In Progress
- [ ] Converting Express to Vercel serverless functions
- [ ] Updating vercel.json configuration
- [ ] Deploying to Vercel
- [ ] Testing production

---

## 📝 Important Notes

### Billing Logic
- Invoice created at $0 when patient checks in
- Auto-increments:
  - Lab order: +$75
  - Imaging order: +$150
  - Pharmacy order: +$25
  - Signed note: +$150
- Status changes to "pending" when doctor signs note

### Chart Sealing
- When doctor signs a note, `is_signed = true` and `is_locked = true`
- Locked notes cannot be modified
- New notes can always be added to the encounter
- Each signed note adds $150 to the bill

### Color Coding
- Calculated from `triage_time` field
- Frontend calculates: `EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - triage_time)) / 60`
- Auto-refreshes every 30 seconds in dashboards

### Medical History
- All encounters for a patient are linked by `patient_id`
- Notes are accessible across encounters
- Can view by encounter number or patient number

---

## 🐛 Known Issues / TODO

### Before Demo Tomorrow
- [ ] Deploy to Vercel
- [ ] Test full workflow in production
- [ ] Verify CORS settings
- [ ] Test all three roles

### Future Enhancements (Post-Demo)
- [ ] Real-time updates with WebSockets
- [ ] Patient discharge process
- [ ] Insurance verification
- [ ] Lab result entry system
- [ ] Medication allergy checking
- [ ] Notification system
- [ ] Printable encounter summaries
- [ ] Reports and analytics

---

## 🔧 Local Development

### Start Backend
```bash
cd server
npm install
npm run dev
# Runs on http://localhost:5000
```

### Start Frontend
```bash
cd client
npm install
npm run dev
# Runs on http://localhost:5173
```

### Environment Variables

**server/.env:**
```bash
DATABASE_URL=postgresql://neondb_owner:npg_PFEh7HSN0jOk@ep-red-sea-adqcqr01.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-in-production-to-something-very-secure
```

**client/.env.local:**
```bash
VITE_API_URL=http://localhost:5000/api
```

---

## 📚 Key Files to Reference

1. **WORKFLOW_IMPLEMENTATION.md** - Complete feature documentation and demo script
2. **DEPLOYMENT.md** - Deployment instructions
3. **server/src/controllers/workflowController.ts** - Main workflow logic
4. **client/src/pages/*Dashboard.tsx** - Role-based UI components
5. **server/src/database/migration_workflow.ts** - Database schema for workflow

---

## 🎬 Demo Script for Tomorrow

See **WORKFLOW_IMPLEMENTATION.md** section "Demo Workflow" for detailed step-by-step instructions.

**Quick Demo Flow:**
1. Login as receptionist → Check in John Doe (PAT001) with "Chest pain"
2. Assign Room 1 and a nurse
3. Login as nurse → Enter vitals → Add H&P note → Alert doctor
4. Login as doctor → View Room 1 → Place orders → Sign note → Complete encounter
5. Show color coding changing from green to yellow to red

---

## 💡 Client Requirements (from original conversation)

✅ Room number tracking
✅ Separate logins for receptionist, nurse, doctor
✅ Color coding: Green (0-15min), Yellow (15-30min), Red (30+ min)
✅ Encounter numbers and registration numbers
✅ Billing starts at check-in, increases with services
✅ Medical history accessible across encounters
✅ Nurse workflow: vitals, H&P, alert doctor
✅ Doctor workflow: orders (labs, X-ray, pharmacy), note signing
✅ Chart sealing: signed notes are locked but can add more notes

---

## 🔗 Repository

**GitHub:** https://github.com/Ntwumasi/medsys
**Branch:** main
**Last Commit:** Update db connection for SSL and add drop tables script

---

## 👤 Context for AI Assistants

When the user returns to this project:
1. Read this file first for full context
2. Check `git log` for latest changes
3. Reference WORKFLOW_IMPLEMENTATION.md for features
4. Current priority: Deploy to Vercel (Option 1 - Express on serverless)
5. Demo is tomorrow, so speed is critical
6. Database is already set up and populated with test data
7. All code is complete and working locally

---

**End of Context Document**
