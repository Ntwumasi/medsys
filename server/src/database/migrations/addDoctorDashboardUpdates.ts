import pool from '../db';

const addDoctorDashboardUpdates = async () => {
  const updates = [
    {
      title: 'New Patients First in Doctor Dashboard',
      description: 'The patient list on the Doctor Dashboard now displays newest patients at the top. Most recently added encounters appear first, making it easier for doctors to identify and attend to new arrivals.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.2',
    },
    {
      title: 'SOAP Now a Tab in Clinical Notes',
      description: 'SOAP documentation has been moved from a separate modal to the first tab within Clinical Notes on the Doctor Dashboard. This matches the Nurse Dashboard layout and provides a more streamlined workflow - no more pop-up windows for clinical documentation.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.2',
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

addDoctorDashboardUpdates();
