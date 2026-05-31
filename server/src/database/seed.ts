import { Pool, PoolClient } from 'pg';
import * as bcrypt from 'bcrypt';

/**
 * MedSys EMR - Comprehensive Seed Script
 *
 * Populates a fresh database with realistic demo/test data.
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING where possible.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node src/database/seed.ts
 */

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Usage: DATABASE_URL="postgresql://..." npx ts-node src/database/seed.ts');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── Default password ────────────────────────────────────────────────
const DEFAULT_PASSWORD = 'MedSys2026!';

// ─── User definitions ────────────────────────────────────────────────

interface SeedUser {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone?: string;
  role: string;
  clinic?: string;
  isSuperAdmin: boolean;
}

const superAdmins: SeedUser[] = [
  {
    firstName: 'Nokio', lastName: 'Twumasi', username: 'ntwumasi',
    email: 'nokio.twumasi@medsys.com', role: 'admin',
    phone: '0551234567', isSuperAdmin: true,
  },
  {
    firstName: 'Stephen', lastName: 'Amakloe', username: 'stamakloe',
    email: 'stephen.amakloe@medsys.com', role: 'admin',
    phone: '0552345678', isSuperAdmin: true,
  },
  {
    firstName: 'Richard', lastName: 'Kyei', username: 'rkyei',
    email: 'richard.kyei@medsys.com', role: 'admin',
    phone: '0553456789', isSuperAdmin: true,
  },
];

const staffUsers: SeedUser[] = [
  {
    firstName: 'John', lastName: 'Smith', username: 'jsmith',
    email: 'john.smith@medsys.com', role: 'doctor',
    clinic: 'Family Medicine', phone: '0554567890', isSuperAdmin: false,
  },
  {
    firstName: 'Anne', lastName: 'Richardson', username: 'arichardson',
    email: 'anne.richardson@medsys.com', role: 'doctor',
    clinic: 'Cardiology', phone: '0555678901', isSuperAdmin: false,
  },
  {
    firstName: 'Michael', lastName: 'Sedo', username: 'msedo',
    email: 'michael.sedo@medsys.com', role: 'doctor',
    clinic: 'Internal Medicine', phone: '0556789012', isSuperAdmin: false,
  },
  {
    firstName: 'Sarah', lastName: 'Johnson', username: 'sjohnson',
    email: 'sarah.johnson@medsys.com', role: 'nurse',
    phone: '0557890123', isSuperAdmin: false,
  },
  {
    firstName: 'Emily', lastName: 'Nurse', username: 'enurse',
    email: 'emily.nurse@medsys.com', role: 'nurse',
    phone: '0558901234', isSuperAdmin: false,
  },
  {
    firstName: 'Mary', lastName: 'Davis', username: 'mdavis',
    email: 'mary.davis@medsys.com', role: 'receptionist',
    phone: '0559012345', isSuperAdmin: false,
  },
  {
    firstName: 'Wendy', lastName: 'Smith', username: 'wsmith',
    email: 'wendy.smith@medsys.com', role: 'receptionist',
    phone: '0550123456', isSuperAdmin: false,
  },
  {
    firstName: 'James', lastName: 'Pharmacist', username: 'pharma1',
    email: 'james.pharmacist@medsys.com', role: 'pharmacy',
    phone: '0551122334', isSuperAdmin: false,
  },
  {
    firstName: 'Lab', lastName: 'Technician', username: 'lab1',
    email: 'lab.technician@medsys.com', role: 'lab',
    phone: '0552233445', isSuperAdmin: false,
  },
  {
    firstName: 'Imaging', lastName: 'Technician', username: 'img1',
    email: 'imaging.technician@medsys.com', role: 'imaging',
    phone: '0553344556', isSuperAdmin: false,
  },
];

// ─── Patient definitions ─────────────────────────────────────────────

interface SeedPatient {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  patientNumber: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  address: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  occupation: string;
  maritalStatus: string;
}

const patients: SeedPatient[] = [
  {
    firstName: 'Kwame', lastName: 'Asante', username: 'kasante',
    email: 'kwame.asante@patient.medsys.com', patientNumber: 'P000001',
    dateOfBirth: '1985-03-15', gender: 'Male', phone: '+233 24 123 4567',
    address: '12 Independence Ave, East Legon', city: 'Accra',
    emergencyContactName: 'Abena Asante', emergencyContactPhone: '+233 24 987 6543',
    emergencyContactRelationship: 'Spouse', occupation: 'Accountant',
    maritalStatus: 'Married',
  },
  {
    firstName: 'Akua', lastName: 'Mensah', username: 'amensah',
    email: 'akua.mensah@patient.medsys.com', patientNumber: 'P000002',
    dateOfBirth: '1992-07-22', gender: 'Female', phone: '+233 20 234 5678',
    address: '45 Osu Badu St, Cantonments', city: 'Accra',
    emergencyContactName: 'Kofi Mensah', emergencyContactPhone: '+233 20 876 5432',
    emergencyContactRelationship: 'Brother', occupation: 'Teacher',
    maritalStatus: 'Single',
  },
  {
    firstName: 'Yaw', lastName: 'Boateng', username: 'yboateng',
    email: 'yaw.boateng@patient.medsys.com', patientNumber: 'P000003',
    dateOfBirth: '1978-11-05', gender: 'Male', phone: '+233 27 345 6789',
    address: '8 Labone Crescent', city: 'Accra',
    emergencyContactName: 'Ama Boateng', emergencyContactPhone: '+233 27 765 4321',
    emergencyContactRelationship: 'Wife', occupation: 'Engineer',
    maritalStatus: 'Married',
  },
  {
    firstName: 'Efua', lastName: 'Owusu', username: 'eowusu',
    email: 'efua.owusu@patient.medsys.com', patientNumber: 'P000004',
    dateOfBirth: '2000-01-30', gender: 'Female', phone: '+233 55 456 7890',
    address: '23 Spintex Road, Baatsona', city: 'Accra',
    emergencyContactName: 'Nana Owusu', emergencyContactPhone: '+233 55 654 3210',
    emergencyContactRelationship: 'Father', occupation: 'Student',
    maritalStatus: 'Single',
  },
  {
    firstName: 'Kofi', lastName: 'Adjei', username: 'kadjei',
    email: 'kofi.adjei@patient.medsys.com', patientNumber: 'P000005',
    dateOfBirth: '1965-09-18', gender: 'Male', phone: '+233 26 567 8901',
    address: '17 Ring Road Central, Asylum Down', city: 'Accra',
    emergencyContactName: 'Adwoa Adjei', emergencyContactPhone: '+233 26 109 8765',
    emergencyContactRelationship: 'Daughter', occupation: 'Retired Civil Servant',
    maritalStatus: 'Widowed',
  },
  {
    firstName: 'Ama', lastName: 'Darko', username: 'adarko',
    email: 'ama.darko@patient.medsys.com', patientNumber: 'P000006',
    dateOfBirth: '1988-04-10', gender: 'Female', phone: '+233 54 678 9012',
    address: '5 Tema Community 12', city: 'Tema',
    emergencyContactName: 'Kwesi Darko', emergencyContactPhone: '+233 54 210 9876',
    emergencyContactRelationship: 'Husband', occupation: 'Trader',
    maritalStatus: 'Married',
  },
];

// ─── Clinics ─────────────────────────────────────────────────────────

const clinics = [
  'General Practice',
  'Cardiology',
  'Family Medicine',
  'Internal Medicine',
  'Dermatology',
  'Pediatrics',
  'Orthopedics',
  'ENT (Ear, Nose & Throat)',
  'Ophthalmology',
  'Neurology',
  'Psychiatry',
  'Obstetrics & Gynecology',
  'Gastroenterology',
  'Endocrinology',
  'Pulmonology',
  'Nephrology',
  'Hematology',
  'Infectious Disease',
  'Rheumatology',
  'Urology',
  'Dietician',
  'Lab (Walk-in)',
  'Imaging (Walk-in)',
  'Pharmacy (OTC/Walk-in)',
];

// ─── Rooms ───────────────────────────────────────────────────────────

const rooms = [
  { number: '1', name: 'Exam Room 1', type: 'exam' },
  { number: '2', name: 'Exam Room 2', type: 'exam' },
  { number: '3', name: 'Exam Room 3', type: 'exam' },
  { number: '4', name: 'Exam Room 4', type: 'exam' },
  { number: '5', name: 'Exam Room 5', type: 'exam' },
  { number: '6', name: 'Exam Room 6', type: 'exam' },
  { number: '7', name: 'Exam Room 7', type: 'exam' },
  { number: '8', name: 'Exam Room 8', type: 'exam' },
];

// ─── Charge Master ───────────────────────────────────────────────────

interface ChargeItem {
  serviceName: string;
  serviceCode: string;
  category: string;
  price: number;
  description: string;
}

const chargeItems: ChargeItem[] = [
  // Registration & Consultations
  { serviceName: 'Registration', serviceCode: 'REG-001', category: 'consultation', price: 100.00, description: 'New patient registration fee' },
  { serviceName: 'General Practitioner Consult', serviceCode: 'CONS-GP', category: 'consultation', price: 200.00, description: 'General practitioner consultation' },
  { serviceName: 'Follow-up/Review Consult', serviceCode: 'CONS-REVIEW', category: 'consultation', price: 150.00, description: 'Follow-up or review consultation' },
  { serviceName: 'New Patient Consult', serviceCode: 'CONS-PCP', category: 'consultation', price: 250.00, description: 'New patient initial consultation with PCP' },
  { serviceName: 'Specialist Consult', serviceCode: 'CONS-SPEC', category: 'consultation', price: 300.00, description: 'Specialist physician consultation' },
  { serviceName: 'Emergency Consultation', serviceCode: 'CONS-ER', category: 'consultation', price: 400.00, description: 'Emergency department consultation' },

  // Lab Tests
  { serviceName: 'Full Blood Count (FBC)', serviceCode: 'LAB-FBC', category: 'lab', price: 80.00, description: 'Complete blood count with differential' },
  { serviceName: 'Malaria Rapid Test', serviceCode: 'LAB-MAL-RDT', category: 'lab', price: 40.00, description: 'Rapid diagnostic test for malaria' },
  { serviceName: 'Malaria Blood Film', serviceCode: 'LAB-MAL-BF', category: 'lab', price: 60.00, description: 'Thick and thin blood film for malaria parasites' },
  { serviceName: 'Urinalysis', serviceCode: 'LAB-UA', category: 'lab', price: 50.00, description: 'Complete urine analysis' },
  { serviceName: 'Blood Glucose (Fasting)', serviceCode: 'LAB-GLUC-F', category: 'lab', price: 35.00, description: 'Fasting blood glucose level' },
  { serviceName: 'Blood Glucose (Random)', serviceCode: 'LAB-GLUC-R', category: 'lab', price: 30.00, description: 'Random blood glucose level' },
  { serviceName: 'HbA1c', serviceCode: 'LAB-A1C', category: 'lab', price: 120.00, description: 'Glycated hemoglobin test' },
  { serviceName: 'Liver Function Test (LFT)', serviceCode: 'LAB-LFT', category: 'lab', price: 100.00, description: 'Liver enzyme panel (AST, ALT, ALP, bilirubin, albumin)' },
  { serviceName: 'Kidney Function Test (RFT)', serviceCode: 'LAB-RFT', category: 'lab', price: 90.00, description: 'Renal function panel (urea, creatinine, electrolytes)' },
  { serviceName: 'Lipid Panel', serviceCode: 'LAB-LIPID', category: 'lab', price: 100.00, description: 'Total cholesterol, HDL, LDL, triglycerides' },
  { serviceName: 'Thyroid Function Test', serviceCode: 'LAB-TFT', category: 'lab', price: 150.00, description: 'TSH, T3, T4 panel' },
  { serviceName: 'HIV Screening', serviceCode: 'LAB-HIV', category: 'lab', price: 60.00, description: 'HIV 1&2 rapid screening test' },
  { serviceName: 'Hepatitis B Surface Antigen', serviceCode: 'LAB-HBSAG', category: 'lab', price: 70.00, description: 'Hepatitis B surface antigen test' },
  { serviceName: 'Widal Test', serviceCode: 'LAB-WIDAL', category: 'lab', price: 50.00, description: 'Typhoid fever screening' },
  { serviceName: 'Stool Routine Examination', serviceCode: 'LAB-STOOL-RE', category: 'lab', price: 40.00, description: 'Stool microscopy and analysis' },
  { serviceName: 'Pregnancy Test (Urine)', serviceCode: 'LAB-PREG-U', category: 'lab', price: 30.00, description: 'Urine pregnancy test (hCG)' },

  // Imaging
  { serviceName: 'X-Ray - Chest', serviceCode: 'IMG-XR-CHEST', category: 'imaging', price: 120.00, description: 'Chest X-ray PA view' },
  { serviceName: 'X-Ray - Abdomen', serviceCode: 'IMG-XR-ABD', category: 'imaging', price: 130.00, description: 'Abdominal X-ray' },
  { serviceName: 'Ultrasound - Abdomen', serviceCode: 'IMG-US-ABD', category: 'imaging', price: 200.00, description: 'Abdominal ultrasound' },
  { serviceName: 'ECG', serviceCode: 'IMG-ECG', category: 'imaging', price: 80.00, description: '12-lead electrocardiogram' },
];

// ─── Main seed function ──────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();
  const counts = {
    usersCreated: 0,
    usersSkipped: 0,
    patientsCreated: 0,
    patientsSkipped: 0,
    clinicsCreated: 0,
    roomsCreated: 0,
    chargesCreated: 0,
  };

  try {
    await client.query('BEGIN');
    console.log('=== MedSys EMR Seed Script ===\n');

    // ── Hash password ──
    console.log('Hashing default password...');
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // ── 1. Super Admin Users ──
    console.log('\n--- Super Admin Users ---');
    for (const u of superAdmins) {
      const result = await upsertUser(client, u, passwordHash);
      if (result === 'created') counts.usersCreated++;
      else counts.usersSkipped++;
    }

    // ── 2. Staff Users ──
    console.log('\n--- Staff Users ---');
    for (const u of staffUsers) {
      const result = await upsertUser(client, u, passwordHash);
      if (result === 'created') counts.usersCreated++;
      else counts.usersSkipped++;
    }

    // ── 3. Patient Users & Records ──
    console.log('\n--- Patient Users & Records ---');
    for (const p of patients) {
      // Create user account
      const existing = await client.query(
        `SELECT id FROM users WHERE username = $1`,
        [p.username]
      );

      let userId: number;
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        console.log(`  SKIP user ${p.username} (already exists, id=${userId})`);
        counts.usersSkipped++;
      } else {
        const res = await client.query(
          `INSERT INTO users (
            first_name, last_name, email, username, password_hash,
            role, phone, is_active, must_change_password, password_changed_at
          ) VALUES ($1, $2, $3, $4, $5, 'patient', $6, TRUE, FALSE, NOW())
          RETURNING id`,
          [p.firstName, p.lastName, p.email, p.username, passwordHash, p.phone]
        );
        userId = res.rows[0].id;
        counts.usersCreated++;
        console.log(`  CREATED user ${p.username} (${p.firstName} ${p.lastName}), id=${userId}`);
      }

      // Create patient record
      const patientExists = await client.query(
        `SELECT id FROM patients WHERE patient_number = $1`,
        [p.patientNumber]
      );

      if (patientExists.rows.length > 0) {
        console.log(`  SKIP patient ${p.patientNumber} (already exists)`);
        counts.patientsSkipped++;
      } else {
        await client.query(
          `INSERT INTO patients (
            user_id, patient_number, date_of_birth, gender,
            address, city, emergency_contact_name, emergency_contact_phone,
            emergency_contact_relationship, occupation, marital_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (patient_number) DO NOTHING`,
          [
            userId, p.patientNumber, p.dateOfBirth, p.gender,
            p.address, p.city, p.emergencyContactName, p.emergencyContactPhone,
            p.emergencyContactRelationship, p.occupation, p.maritalStatus,
          ]
        );
        counts.patientsCreated++;
        console.log(`  CREATED patient ${p.patientNumber} (${p.firstName} ${p.lastName})`);
      }
    }

    // ── 4. Clinics ──
    console.log('\n--- Clinics ---');
    for (const name of clinics) {
      const res = await client.query(
        `INSERT INTO clinics (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id`,
        [name]
      );
      if (res.rowCount && res.rowCount > 0) {
        counts.clinicsCreated++;
      }
    }
    console.log(`  Inserted ${counts.clinicsCreated} clinics (${clinics.length - counts.clinicsCreated} already existed)`);

    // ── 5. Rooms ──
    console.log('\n--- Exam Rooms ---');
    for (const room of rooms) {
      const res = await client.query(
        `INSERT INTO rooms (room_number, room_name, room_type)
         VALUES ($1, $2, $3) ON CONFLICT (room_number) DO NOTHING RETURNING id`,
        [room.number, room.name, room.type]
      );
      if (res.rowCount && res.rowCount > 0) {
        counts.roomsCreated++;
      }
    }
    console.log(`  Inserted ${counts.roomsCreated} rooms (${rooms.length - counts.roomsCreated} already existed)`);

    // ── 6. Charge Master ──
    console.log('\n--- Charge Master ---');
    for (const item of chargeItems) {
      const res = await client.query(
        `INSERT INTO charge_master (service_name, service_code, category, price, description)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (service_code) DO NOTHING RETURNING id`,
        [item.serviceName, item.serviceCode, item.category, item.price, item.description]
      );
      if (res.rowCount && res.rowCount > 0) {
        counts.chargesCreated++;
      }
    }
    console.log(`  Inserted ${counts.chargesCreated} charge items (${chargeItems.length - counts.chargesCreated} already existed)`);

    await client.query('COMMIT');

    // ── Summary ──
    console.log('\n========================================');
    console.log('         SEED COMPLETE - SUMMARY');
    console.log('========================================');
    console.log(`  Users created:    ${counts.usersCreated}`);
    console.log(`  Users skipped:    ${counts.usersSkipped}`);
    console.log(`  Patients created: ${counts.patientsCreated}`);
    console.log(`  Patients skipped: ${counts.patientsSkipped}`);
    console.log(`  Clinics created:  ${counts.clinicsCreated}`);
    console.log(`  Rooms created:    ${counts.roomsCreated}`);
    console.log(`  Charges created:  ${counts.chargesCreated}`);
    console.log('========================================');
    console.log(`  Default password: ${DEFAULT_PASSWORD}`);
    console.log('========================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\nSeed FAILED - all changes rolled back.');
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// ─── Helper: upsert a staff/admin user ───────────────────────────────

async function upsertUser(
  client: PoolClient,
  u: SeedUser,
  passwordHash: string
): Promise<'created' | 'skipped'> {
  const existing = await client.query(
    `SELECT id FROM users WHERE username = $1`,
    [u.username]
  );

  if (existing.rows.length > 0) {
    // Ensure key fields are up to date
    await client.query(
      `UPDATE users SET
         is_super_admin = $1,
         role = $2,
         is_active = TRUE
       WHERE username = $3`,
      [u.isSuperAdmin, u.role, u.username]
    );
    console.log(`  SKIP ${u.username} (already exists, updated role/super_admin)`);
    return 'skipped';
  }

  await client.query(
    `INSERT INTO users (
       first_name, last_name, email, username, password_hash,
       role, clinic, phone, is_active, is_super_admin,
       must_change_password, password_changed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, FALSE, NOW())`,
    [
      u.firstName, u.lastName, u.email, u.username, passwordHash,
      u.role, u.clinic || null, u.phone || null, u.isSuperAdmin,
    ]
  );
  console.log(`  CREATED ${u.username} (${u.firstName} ${u.lastName}) [${u.role}${u.isSuperAdmin ? ' + super_admin' : ''}]`);
  return 'created';
}

// ─── Run ─────────────────────────────────────────────────────────────

seed();
