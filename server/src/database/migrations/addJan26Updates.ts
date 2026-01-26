import pool from '../db';

const addJan26Updates = async () => {
  const updates = [
    {
      title: 'Vital Signs History',
      description: 'New Vital Signs History feature added to both Nurse and Doctor dashboards. Click "View History" button in the Vital Signs section to see all historical vital recordings for a patient, sorted by most recent first with encounter details and who recorded them.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Allergies Field Replaces Blood Group',
      description: 'Patient intake form now captures Allergies instead of Blood Group. This change applies across all dashboards including Receptionist, Patient Registration, and Patient Details views.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Vital Signs Auto-Save',
      description: 'Nurse Dashboard vital signs now auto-save with a 3-second debounce. No more manual save button needed - vitals are automatically saved as you type with visual feedback.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'H&P Renamed to SOAP',
      description: 'History & Physical (H&P) sections renamed to SOAP (Subjective, Objective, Assessment, Plan) throughout both Nurse and Doctor dashboards for better clinical terminology alignment.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Routing Button Status Feedback',
      description: 'Department routing buttons (Lab, Imaging, Pharmacy, etc.) now show visual status feedback after clicking. Buttons change to indicate the patient has been routed to that department.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Separate Release Room & Complete Encounter',
      description: 'Release Room and Complete Encounter buttons are now separate actions on the Nurse Dashboard, giving more control over the workflow. Release room when patient leaves, complete encounter when documentation is done.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Duplicate Patient Fix',
      description: 'Fixed an issue where the same patient could appear multiple times in the nurse assigned patients list. Patient list now properly de-duplicates entries.',
      category: 'bugfix',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Appointments Count Fix',
      description: 'Fixed the Appointments tab badge not updating after booking a new appointment. The count now correctly reflects the number of scheduled appointments.',
      category: 'bugfix',
      status: 'completed',
      version: '1.4.0',
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
    console.log('\nAll updates added successfully!');
  } catch (error) {
    console.error('Error adding updates:', error);
  } finally {
    await pool.end();
  }
};

addJan26Updates();
