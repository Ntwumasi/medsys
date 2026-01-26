import pool from '../db';

const addDoctorDashboardLeftPanelUpdates = async () => {
  const updates = [
    {
      title: 'Quick Vitals Panel on Doctor Dashboard',
      description: 'Added a Quick Vitals section on the left side of the Doctor Dashboard showing current vital signs (BP, HR, Temp, SpO2, RR, Weight) in a compact color-coded grid. Includes quick access to View History button for reviewing past vital recordings.',
      category: 'feature',
      status: 'completed',
      version: '1.4.3',
    },
    {
      title: 'Patient Notes Panel on Doctor Dashboard',
      description: 'Added a Patient Notes section on the left side showing all clinical notes for the selected patient. Notes are color-coded by type (Doctor, Nurse, Instructions, Procedural) with signed status indicators. Displays up to 10 recent notes with author and timestamp.',
      category: 'feature',
      status: 'completed',
      version: '1.4.3',
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
    console.log('\nUpdates added successfully!');
  } catch (error) {
    console.error('Error adding updates:', error);
  } finally {
    await pool.end();
  }
};

addDoctorDashboardLeftPanelUpdates();
