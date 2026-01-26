import pool from '../db';

const addVitalSignsUIUpdate = async () => {
  const updates = [
    {
      title: 'Redesigned Vital Signs Input Form',
      description: 'Complete redesign of the vital signs entry form with larger, more prominent input fields. Each vital sign now has its own color-coded card with icons for easy identification. Blood pressure fields are displayed side-by-side with a visual separator. All inputs feature large 2xl font size for easy reading and touch-friendly interaction.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.1',
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

addVitalSignsUIUpdate();
