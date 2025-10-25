# Urgent Care Workflow Implementation

## Overview
Complete implementation of a role-based urgent care workflow system for tomorrow's demo.

## What's Been Built

### 1. Database Schema Enhancements

**New Tables Created:**
- `rooms` - Exam room management (8 rooms created by default)
- `clinical_notes` - Role-based notes with signing/sealing capability
- `pharmacy_orders` - Medication orders from doctors
- `alerts` - Nurse-to-doctor communication system

**Enhanced Tables:**
- `encounters` - Added workflow tracking fields:
  - `encounter_number` (auto-generated: ENC20231025-000001)
  - `room_id`, `nurse_id`, `receptionist_id`
  - `triage_time`, `triage_priority` (green/yellow/red)
  - `checked_in_at`, `nurse_started_at`, `doctor_started_at`, `completed_at`

### 2. Backend API Endpoints

#### Receptionist Workflow (`/api/workflow/`)
- `POST /check-in` - Check in patient, create encounter, start billing
- `POST /assign-room` - Assign patient to exam room
- `POST /assign-nurse` - Assign nurse to patient
- `GET /queue` - View patient queue with color coding
- `GET /rooms` - View all room statuses
- `GET /nurses` - Get available nurses

#### Nurse Workflow (`/api/workflow/nurse/`)
- `POST /start` - Start seeing patient
- `POST /vitals` - Submit vital signs (auto-alerts on critical values)
- `POST /alert-doctor` - Notify doctor patient is ready
- `GET /patients` - Get assigned patients

#### Doctor Workflow (`/api/workflow/doctor/`)
- `POST /start` - Start seeing patient
- `GET /rooms` - View patients by room
- `POST /release-room` - Complete encounter and release room

#### Clinical Notes (`/api/clinical-notes/`)
- `POST /` - Create note (receptionist, nurse, doctor)
- `GET /encounter/:id` - Get all notes for encounter
- `GET /patient/:id` - Get all notes across encounters
- `PUT /:id` - Update note (only if not locked)
- `POST /:id/sign` - Doctor signs note (locks it, updates billing)

#### Orders (`/api/orders/`)
- `POST /lab` - Order lab tests (auto-bills $75)
- `POST /imaging` - Order X-rays/imaging (auto-bills $150)
- `POST /pharmacy` - Order medications (auto-bills $25)
- `GET /encounter/:id` - Get all orders for encounter

### 3. Frontend Dashboards

#### Receptionist Dashboard (`/dashboard` for receptionist role)
**Features:**
- Patient search and check-in
- Real-time patient queue with color coding:
  - 🟢 Green: 0-15 minutes wait
  - 🟡 Yellow: 15-30 minutes wait
  - 🔴 Red: 30+ minutes wait
- Room assignment dropdown
- Nurse assignment dropdown
- Live room status board (Available/Occupied)

#### Nurse Dashboard (`/dashboard` for nurse role)
**Features:**
- Assigned patients list with priority colors
- Patient information panel
- Vital signs entry form (Temperature, BP, HR, RR, O2 Sat)
- Critical vitals auto-alert system
- Clinical notes (H&P and General)
- "Alert Doctor" button

#### Doctor Dashboard (`/dashboard` for doctor role)
**Features:**
- Room-based patient view
- Patient information with vital signs
- Order placement system:
  - Lab tests
  - Imaging/X-rays
  - Pharmacy/Medications
- Clinical notes with signing capability
- Note signing locks notes and updates billing
- Complete encounter & release room

### 4. Key Features Implemented

#### Color Coding System
- Automatically calculated based on triage time
- Updates in real-time every 30 seconds
- Visual indicators: Green/Yellow/Red borders and backgrounds

#### Billing Integration
- Starts at $0 when patient checks in
- Auto-increments for:
  - Lab orders: +$75
  - Imaging orders: +$150
  - Pharmacy orders: +$25
  - Signed notes: +$150
- Invoice status changes to "pending" when notes signed

#### Chart Sealing
- Doctor signs notes via "Sign Note" button
- Signed notes become locked (is_locked = true)
- Cannot modify locked notes
- Can add new notes to encounter
- Each signed note adds to bill

#### Medical History Access
- Notes and encounters linked by patient_number
- View all past encounters via patient_id
- Clinical notes accessible across encounters
- Full history available in Patient Details page

## Setup Instructions

### 1. Run Database Migrations

```bash
# Make sure PostgreSQL is running
cd server

# Run the initial setup (creates base tables)
npm run db:setup

# Run the workflow migration (adds new tables and fields)
npx ts-node src/database/migration_workflow.ts
```

### 2. Create Test Users

You'll need to create users for each role. Use the registration endpoint or add directly to database:

```sql
-- Receptionist
INSERT INTO users (email, password_hash, role, first_name, last_name, is_active)
VALUES ('receptionist@clinic.com', '$2b$10$...', 'receptionist', 'Jane', 'Smith', true);

-- Nurse
INSERT INTO users (email, password_hash, role, first_name, last_name, is_active)
VALUES ('nurse@clinic.com', '$2b$10$...', 'nurse', 'Sarah', 'Johnson', true);

-- Doctor
INSERT INTO users (email, password_hash, role, first_name, last_name, is_active)
VALUES ('doctor@clinic.com', '$2b$10$...', 'doctor', 'John', 'Williams', true);
```

Or use the API:
```bash
# Register users via API
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"receptionist@clinic.com","password":"demo123","role":"receptionist","first_name":"Jane","last_name":"Smith"}'
```

### 3. Start the Application

```bash
# Terminal 1 - Start server
cd server
npm run dev

# Terminal 2 - Start client
cd client
npm run dev
```

### 4. Create Test Patients

Before testing workflow, create 2-3 test patients via the Patient Registration page or API.

## Demo Workflow

### Step 1: Receptionist Check-In
1. Login as receptionist@clinic.com
2. Dashboard shows patient queue and rooms
3. Search for patient by name or patient number
4. Enter chief complaint (e.g., "Chest pain")
5. Click "Check In Patient"
6. Patient appears in queue with GREEN status
7. Assign room from dropdown
8. Assign nurse from dropdown

### Step 2: Nurse Workflow
1. Login as nurse@clinic.com
2. See assigned patient in left panel with color code
3. Click patient to select
4. Enter vital signs:
   - Temperature: 98.6°F
   - BP: 120/80
   - Heart Rate: 72
   - Respiratory Rate: 16
   - O2 Saturation: 98%
5. Click "Save Vital Signs"
6. Add H&P note describing patient history
7. Click "Alert Doctor - Patient Ready"

### Step 3: Doctor Workflow
1. Login as doctor@clinic.com
2. See patients organized by room number
3. Click on patient's room
4. Review vital signs and chief complaint
5. View patient chart link (full history)
6. Place orders:
   - Lab: "CBC with Differential"
   - Imaging: "Chest X-Ray, AP and Lateral"
   - Pharmacy: "Aspirin 81mg, once daily, oral, 30 tablets"
7. Add doctor's note with assessment and plan
8. Click "Sign Note" to lock and bill
9. Click "Complete Encounter & Release Room"

### Step 4: Watch Color Coding
- After 15 minutes: Status changes to YELLOW
- After 30 minutes: Status changes to RED
- Auto-refreshes every 30 seconds

## File Structure

```
server/src/
├── database/
│   ├── migration_workflow.ts        # NEW: Workflow migration
│   └── setup.ts                      # Existing: Base tables
├── controllers/
│   ├── workflowController.ts         # NEW: Receptionist & Nurse & Doctor workflows
│   ├── clinicalNotesController.ts   # NEW: Notes with signing
│   └── ordersController.ts          # NEW: Lab/Imaging/Pharmacy orders
├── types/
│   └── index.ts                      # UPDATED: Added workflow types
└── routes/
    └── index.ts                      # UPDATED: Added workflow routes

client/src/
├── pages/
│   ├── ReceptionistDashboard.tsx    # NEW: Check-in & queue
│   ├── NurseDashboard.tsx           # NEW: Vitals & notes
│   └── DoctorDashboard.tsx          # NEW: Orders & signing
├── App.tsx                           # UPDATED: Role-based routing
└── types/
    └── index.ts                      # UPDATED: Added workflow types
```

## API Quick Reference

### Check-In Flow
```javascript
// 1. Check in patient
POST /api/workflow/check-in
{
  "patient_id": 1,
  "chief_complaint": "Chest pain",
  "encounter_type": "walk-in"
}

// 2. Assign room
POST /api/workflow/assign-room
{
  "encounter_id": 1,
  "room_id": 3
}

// 3. Assign nurse
POST /api/workflow/assign-nurse
{
  "encounter_id": 1,
  "nurse_id": 5
}
```

### Nurse Flow
```javascript
// 1. Add vitals
POST /api/workflow/nurse/vitals
{
  "encounter_id": 1,
  "vital_signs": {
    "temperature": 98.6,
    "temperature_unit": "F",
    "blood_pressure_systolic": 120,
    "blood_pressure_diastolic": 80,
    "heart_rate": 72,
    "respiratory_rate": 16,
    "oxygen_saturation": 98
  }
}

// 2. Alert doctor
POST /api/workflow/nurse/alert-doctor
{
  "encounter_id": 1,
  "message": "Patient ready for evaluation"
}
```

### Doctor Flow
```javascript
// 1. Place lab order
POST /api/orders/lab
{
  "patient_id": 1,
  "encounter_id": 1,
  "test_name": "CBC with Differential",
  "priority": "routine"
}

// 2. Add note and sign
POST /api/clinical-notes
{
  "encounter_id": 1,
  "patient_id": 1,
  "note_type": "doctor_general",
  "content": "Assessment and plan..."
}

POST /api/clinical-notes/1/sign

// 3. Complete encounter
POST /api/workflow/release-room
{
  "encounter_id": 1
}
```

## Notes for Demo

1. **Color Coding**: Wait times are calculated from triage_time, so color changes happen automatically
2. **Billing**: Invoice starts at $0 and increments with each order and signed note
3. **Chart Sealing**: Once signed, notes are locked but new notes can be added
4. **Medical History**: All encounters for a patient are accessible via their patient_number
5. **Room Status**: Automatically updates when rooms are assigned/released
6. **Auto-Refresh**: Dashboards refresh every 30 seconds to show real-time updates

## Troubleshooting

- **Database connection error**: Make sure PostgreSQL is running
- **Token expired**: Re-login to get new JWT token
- **Can't assign room**: Check if room is already occupied
- **Can't modify note**: Note has been signed and is locked
- **Orders not showing**: Check encounter_id is correct

## Next Steps for Production

1. Add real-time updates with WebSockets
2. Implement patient discharge process
3. Add insurance verification at check-in
4. Create detailed billing report
5. Add lab result entry system
6. Implement medication allergy checking
7. Add notification system for critical vitals
8. Create printable encounter summary

---

**Demo Ready!** All features are implemented and ready for testing. Just need to run the database migrations and create test users.
