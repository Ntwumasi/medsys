import pool from '../db';
import bcrypt from 'bcrypt';

interface StaffMember {
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  role: string;
}

const staffList: StaffMember[] = [
  // Doctors (Medicine)
  { firstName: 'Kojo', lastName: 'Essel', department: 'MEDICINE', position: 'Health & Wellness', role: 'doctor' },
  { firstName: 'Patricia', lastName: 'Richardson', department: 'MEDICINE', position: 'Family Medicine & Medical Director', role: 'doctor' },
  { firstName: 'Angela', lastName: 'Frempong', department: 'MEDICINE', position: 'Obstetrician & Gynaecologist', role: 'doctor' },
  { firstName: 'Adejoke', lastName: 'Aiyenigba', department: 'MEDICINE', position: 'Family Medicine', role: 'doctor' },
  { firstName: 'Hamza', lastName: 'Basheer', department: 'MEDICINE', position: 'Medical Officer', role: 'doctor' },
  { firstName: 'Patrick', lastName: 'Bankah', department: 'MEDICINE', position: 'Neurosurgeon', role: 'doctor' },
  { firstName: 'Bright', lastName: 'Wereh', department: 'MEDICINE', position: 'Urologist', role: 'doctor' },
  { firstName: 'Adriana', lastName: 'Asante', department: 'MEDICINE', position: 'Paediatrician', role: 'doctor' },
  { firstName: 'Kwabena', lastName: 'Agyenim-Boateng', department: 'MEDICINE', position: 'ENT', role: 'doctor' },
  { firstName: 'Florence', lastName: 'Dedey', department: 'MEDICINE', position: 'General Surgeon', role: 'doctor' },
  { firstName: 'James', lastName: 'Adjogatse', department: 'MEDICINE', position: 'General Surgeon', role: 'doctor' },
  { firstName: 'James', lastName: 'Adams', department: 'MEDICINE', position: 'Obstetrician & Gynaecologist', role: 'doctor' },
  { firstName: 'Adams', lastName: 'Ofosu', department: 'MEDICINE', position: 'Cardiologist', role: 'doctor' },
  { firstName: 'Ebenezer', lastName: 'Nikoi', department: 'MEDICINE', position: 'Endocrinologist', role: 'doctor' },
  { firstName: 'Wendy', lastName: 'Asiedu', department: 'MEDICINE', position: 'Ophthalmologist', role: 'doctor' },
  { firstName: 'Emily', lastName: 'Nortey', department: 'MEDICINE', position: 'Gastroenterologist', role: 'doctor' },
  { firstName: 'Mervin', lastName: 'Boakye-Agyemang', department: 'MEDICINE', position: 'Oncologist', role: 'doctor' },
  { firstName: 'Elsie', lastName: 'Amaning', department: 'MEDICINE', position: 'Psychiatrist', role: 'doctor' },
  { firstName: 'Edwin', lastName: 'Boakye-Yiadom', department: 'MEDICINE', position: 'Psychologist', role: 'doctor' },

  // Health & Wellness Allied Health
  { firstName: 'David', lastName: 'Owusu', department: 'PHYSIOTHERAPY', position: 'Physiotherapist', role: 'doctor' },
  { firstName: 'Caroll', lastName: 'Owu', department: 'NUTRITION', position: 'Dietician', role: 'doctor' },
  { firstName: 'Benedicta', lastName: 'Kesewah', department: 'NUTRITION', position: 'Dietician', role: 'doctor' },

  // Radiology/Imaging
  { firstName: 'Dorcas', lastName: 'Awuku', department: 'RADIOLOGY', position: 'Sonographer', role: 'imaging' },
  { firstName: 'Elfreda', lastName: 'Obbin', department: 'RADIOLOGY', position: 'Sonographer', role: 'imaging' },

  // Administration
  { firstName: 'Angela', lastName: 'Atitso', department: 'ADMINISTRATION', position: 'Office Manager', role: 'admin' },
  { firstName: 'Sarah', lastName: 'Prah', department: 'ADMINISTRATION', position: 'Accountant', role: 'admin' },
  { firstName: 'Wendy', lastName: 'Nunoo', department: 'ADMINISTRATION', position: 'Client Relations Officer', role: 'receptionist' },
  { firstName: 'Sharon', lastName: 'Therson-Cofie', department: 'ADMINISTRATION', position: 'Client Relations Officer', role: 'receptionist' },
  { firstName: 'Charles', lastName: 'Baba', department: 'ADMINISTRATION', position: 'Marketing Executive', role: 'admin' },

  // Nursing
  { firstName: 'Wendy', lastName: 'Sarpong', department: 'NURSING', position: 'Nursing Officer', role: 'nurse' },
  { firstName: 'Joseph', lastName: 'Nartey', department: 'NURSING', position: 'Staff Nurse', role: 'nurse' },
  { firstName: 'Yvonne', lastName: 'Kotey', department: 'NURSING', position: 'Midwife', role: 'nurse' },
  { firstName: 'Eric', lastName: 'Annan', department: 'NURSING', position: 'Nursing Officer', role: 'nurse' },

  // Pharmacy
  { firstName: 'Irene', lastName: 'Taddese', department: 'PHARMACY', position: 'Pharmacist (Pharm D.)', role: 'pharmacy' },
  { firstName: 'Bernard', lastName: 'Addae', department: 'PHARMACY', position: 'Pharmacy Technician', role: 'pharmacy' },
  { firstName: 'Rosemary', lastName: 'Ayiquaye', department: 'PHARMACY', position: 'Pharmacy Technician', role: 'pharmacy' },

  // Lab
  { firstName: 'Enoch', lastName: 'Tamatey', department: 'LAB', position: 'Laboratory Technician', role: 'lab' },
  { firstName: 'William', lastName: 'Apasu', department: 'LAB', position: 'Laboratory Technician', role: 'lab' },
];

async function addClinicStaff() {
  const client = await pool.connect();

  try {
    console.log('Starting to add clinic staff members...\n');

    const saltRounds = 10;
    const defaultPassword = 'MedSys2024!'; // Users should change this on first login
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

    let successCount = 0;
    let skipCount = 0;

    for (const staff of staffList) {
      const email = `${staff.firstName.toLowerCase()}.${staff.lastName.toLowerCase()}@medsys.com`;
      const phone = ''; // Can be updated later by admin

      try {
        // Check if user already exists
        const existingUser = await client.query(
          'SELECT id, email FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          console.log(`⏭️  Skipping: ${staff.firstName} ${staff.lastName} (${email}) - already exists`);
          skipCount++;
          continue;
        }

        // Insert new user
        const result = await client.query(
          `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id, email, role, first_name, last_name`,
          [email, passwordHash, staff.role, staff.firstName, staff.lastName, phone]
        );

        const newUser = result.rows[0];
        console.log(`✅ Added: ${newUser.first_name} ${newUser.last_name} (${newUser.email}) - Role: ${newUser.role}`);
        successCount++;

      } catch (error: any) {
        console.error(`❌ Error adding ${staff.firstName} ${staff.lastName}:`, error.message);
      }
    }

    console.log('\n==============================================');
    console.log('STAFF ADDITION SUMMARY');
    console.log('==============================================');
    console.log(`✅ Successfully added: ${successCount} staff members`);
    console.log(`⏭️  Skipped (already exist): ${skipCount} staff members`);
    console.log(`📊 Total processed: ${staffList.length} staff members`);
    console.log('==============================================');
    console.log(`\n📝 Default password for all new accounts: ${defaultPassword}`);
    console.log('⚠️  Users should change their password on first login\n');

  } catch (error) {
    console.error('Error in addClinicStaff:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
addClinicStaff()
  .then(() => {
    console.log('✨ Staff addition completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to add staff:', error);
    process.exit(1);
  });
