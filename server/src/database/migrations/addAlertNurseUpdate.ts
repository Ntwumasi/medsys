import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const addAlertNurseUpdate = async () => {
  const updates = [
    {
      title: 'Alert Nurse Functionality Fixed',
      description: 'The Alert Nurse button now properly sends patients back to the nurse queue. Patients returning from the doctor appear at the top of the nurse\'s list with a purple "Dr" badge for easy identification. The button has been moved to the Orders & Actions section for better workflow integration.',
      category: 'fix',
      status: 'completed',
      version: '1.4.4',
    },
  ];

  const today = new Date().toISOString().split('T')[0];

  try {
    for (const update of updates) {
      await pool.query(
        `INSERT INTO system_updates (title, description, category, status, version, update_date, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT DO NOTHING`,
        [update.title, update.description, update.category, update.status, update.version, today]
      );
      console.log(`Added: ${update.title}`);
    }
    console.log('\nUpdate added successfully!');
  } catch (error) {
    console.error('Error adding update:', error);
  } finally {
    await pool.end();
  }
};

addAlertNurseUpdate();
