import pool from '../database/db';

async function addUpdates() {
  const updates = [
    {
      title: 'Patient Name Navigation',
      description: 'Clicking on patient names in Nurse and Doctor dashboards now navigates directly to the patient chart.',
      category: 'improvement',
      status: 'completed'
    },
    {
      title: 'Duplicate Patient Prevention',
      description: 'System now prevents duplicate patient registration by checking for existing patients with the same name and date of birth.',
      category: 'feature',
      status: 'completed'
    },
    {
      title: 'Quick Action Buttons - Lab & Imaging',
      description: 'Added prominent Lab and Imaging routing buttons to the Nurse Dashboard for quick patient routing.',
      category: 'feature',
      status: 'completed'
    },
    {
      title: 'Patient Documents Tab',
      description: 'Added Documents tab to Nurse Dashboard for managing scanned patient documents including lab results, imaging reports, and referral letters.',
      category: 'feature',
      status: 'completed'
    },
    {
      title: 'Nurse-to-Doctor Messaging',
      description: 'Nurses can now send messages to doctors - both general messages and patient-specific messages within the patient chart.',
      category: 'feature',
      status: 'completed'
    },
    {
      title: 'Doctor Instructions Fix',
      description: 'Fixed an issue where adding doctor instructions for nurses would fail. Instructions now save correctly.',
      category: 'fix',
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
