import pool from '../database/db';

async function addUpdates() {
  const updates = [
    {
      title: 'Smart Dictation Microphone Fix',
      description: 'Fixed an issue where the microphone would cut out during smart dictation. Recording now works continuously without interruption.',
      category: 'fix',
      status: 'completed'
    },
    {
      title: 'Vital Signs History',
      description: 'Added Vital Signs History tab to Patient Details page. View complete history of patient vital signs across all encounters.',
      category: 'feature',
      status: 'completed'
    },
    {
      title: 'SOAP Note Signing',
      description: 'Doctors can now sign and lock SOAP notes. Once signed, notes cannot be edited, ensuring medical record integrity.',
      category: 'feature',
      status: 'completed'
    },
    {
      title: 'Appointment Counter Fix',
      description: 'Fixed the appointment counter on Receptionist Dashboard to update immediately when new appointments are scheduled.',
      category: 'fix',
      status: 'completed'
    },
    {
      title: 'Invoice Print Improvements',
      description: 'Improved invoice printing with prominent close button, click-outside-to-close functionality, and better print layout.',
      category: 'improvement',
      status: 'completed'
    },
    {
      title: 'Past Patients Moved to Admin',
      description: 'Moved Past Patients view from Receptionist Dashboard to Admin Dashboard for better workflow organization.',
      category: 'improvement',
      status: 'completed'
    }
  ];

  console.log('Adding system updates...');

  for (const update of updates) {
    try {
      await pool.query(
        `INSERT INTO system_updates (title, description, category, status, update_date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
        [update.title, update.description, update.category, update.status]
      );
      console.log('✓ Added:', update.title);
    } catch (error: any) {
      console.error('✗ Error adding:', update.title, error.message);
    }
  }

  console.log('Done!');
  process.exit(0);
}

addUpdates().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
