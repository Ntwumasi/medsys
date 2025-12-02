import pool from '../db';

async function addSystemUpdates() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating system_updates table...');

    // Create the system_updates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_updates (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'feature',
        status VARCHAR(50) NOT NULL DEFAULT 'completed',
        version VARCHAR(20),
        update_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Created system_updates table');

    // Add initial updates for recent changes
    const initialUpdates = [
      {
        title: 'Voice Dictation for Clinical Notes',
        description: 'Added voice dictation capability to HPAccordion, Doctor Dashboard, and Nurse Dashboard. Healthcare providers can now dictate clinical notes using the microphone button.',
        category: 'feature',
        status: 'completed',
        version: '1.2.0',
        update_date: '2024-12-02'
      },
      {
        title: 'AI-Powered Medical Autocomplete',
        description: 'Implemented smart autocomplete with 400+ medical terms. Context-aware suggestions based on the H&P section being edited. Supports keyboard navigation and fuzzy matching.',
        category: 'feature',
        status: 'completed',
        version: '1.2.0',
        update_date: '2024-12-02'
      },
      {
        title: 'Enhanced Patient Workflow Status',
        description: 'Improved workflow status display in Receptionist Dashboard. Now shows detailed status: Checked In, In Room, Waiting for Nurse, With Nurse, With Doctor, Completed. Added doctor name display.',
        category: 'improvement',
        status: 'completed',
        version: '1.2.0',
        update_date: '2024-12-02'
      },
      {
        title: 'Room Assignment Fix',
        description: 'Fixed issue where rooms were not being released when patients changed rooms. Added room availability sync script for data cleanup.',
        category: 'bugfix',
        status: 'completed',
        version: '1.1.1',
        update_date: '2024-12-02'
      },
      {
        title: 'Wait Time Display Fix',
        description: 'Fixed "NaN min" display for patients without check-in times. Now shows "Just checked in" for new arrivals and "In care for X min" when patient is actively being seen.',
        category: 'bugfix',
        status: 'completed',
        version: '1.1.1',
        update_date: '2024-12-02'
      },
      {
        title: 'System Updates Roadmap',
        description: 'Added internal roadmap/updates tracking system visible on Admin Dashboard. Automatically tracks all system changes with dates and categories.',
        category: 'feature',
        status: 'completed',
        version: '1.2.0',
        update_date: '2024-12-02'
      }
    ];

    for (const update of initialUpdates) {
      await client.query(
        `INSERT INTO system_updates (title, description, category, status, version, update_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [update.title, update.description, update.category, update.status, update.version, update.update_date]
      );
    }

    console.log('Added initial system updates');

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addSystemUpdates();
