import pool from '../db';

const addTodaysUpdates = async () => {
  const updates = [
    {
      title: 'PCP Dropdown with System Doctors',
      description: 'Receptionist Dashboard now has a dropdown for Primary Care Physician that populates with all active doctors from the system instead of a free text field.',
      category: 'feature',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'Redesigned Nurse Patient List',
      description: 'My Assigned Patients section in Nurse Dashboard redesigned from bulky cards to a compact, sleek line-item table view with priority indicators, scrollable list, and priority legend. Can now display many more patients efficiently.',
      category: 'improvement',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'Patient Names in Room Status',
      description: 'Room Status section now shows patient names instead of "Occupied" for occupied rooms, making it easier to identify which patient is in which room.',
      category: 'improvement',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'H&P Auto-Save',
      description: 'History & Physical sections now auto-save as you type with a 1.5 second debounce. No more manual save button needed. Shows real-time save status indicator (Saving.../Saved).',
      category: 'feature',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'H&P Print/PDF Export',
      description: 'Added print button to History & Physical header. Opens a professionally formatted print preview that can be printed or saved as PDF via browser\'s print dialog.',
      category: 'feature',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'Voice Dictation Commands',
      description: 'Voice dictation now supports industry-standard commands: "period", "comma", "new line", "new paragraph", "question mark", "exclamation point", "colon", "stop dictation", and more. Commands automatically convert to punctuation/formatting.',
      category: 'feature',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'Doctor Alerted Button State',
      description: 'Alert Doctor button now changes to "Doctor Alerted" with a checkmark after being clicked, providing clear visual feedback that the doctor has been notified.',
      category: 'improvement',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'Vital Signs Display in H&P and Vital Signs Tab',
      description: 'Vital signs now display in both the H&P Vital Signs section and the Vital Signs tab. Shows a grid of recorded vitals (temperature, heart rate, BP, respiratory rate, SpO2, weight, height, pain level) with clear formatting.',
      category: 'feature',
      status: 'completed',
      version: '1.3.0',
    },
    {
      title: 'Redesigned Doctor Dashboard Patient List',
      description: 'Active Patients section in Doctor Dashboard redesigned from bulky cards to a compact, sleek line-item table view matching the Nurse Dashboard design. Displays room number, patient name, nurse assignment, and patient ID efficiently.',
      category: 'improvement',
      status: 'completed',
      version: '1.3.1',
    },
    {
      title: 'Simplified H&P Button',
      description: 'Changed "Fill H&P" / "View/Edit H&P" button to simply "H&P" for cleaner interface. Subtitle now consistently shows "History & Physical".',
      category: 'improvement',
      status: 'completed',
      version: '1.3.1',
    },
    {
      title: 'Alert Nurse Button',
      description: 'Renamed "Complete Encounter" button to "Alert Nurse" in Doctor Dashboard. Provides clearer communication of the action - notifying the nurse for follow-up.',
      category: 'improvement',
      status: 'completed',
      version: '1.3.1',
    },
    {
      title: 'Removed Release Room Button',
      description: 'Removed the Release Room button from Doctor Dashboard encounter actions for a cleaner interface. Room management now handled through workflow.',
      category: 'improvement',
      status: 'completed',
      version: '1.3.1',
    },
    {
      title: 'Results Alerts Section',
      description: 'New Results Alerts section added to Doctor Dashboard showing recently completed lab results, imaging results, and pharmacy orders. Displays results from the last 48 hours with patient name, room number, and priority status.',
      category: 'feature',
      status: 'completed',
      version: '1.3.1',
    },
    {
      title: 'Short Stay Unit Moved to Nurse Dashboard',
      description: 'Short Stay Unit (bed assignment) section moved from Doctor Dashboard to Nurse Dashboard. Nurses can now assign patients to short stay beds directly, with bed availability status and release functionality.',
      category: 'improvement',
      status: 'completed',
      version: '1.3.1',
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

addTodaysUpdates();
