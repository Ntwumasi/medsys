import pool from '../db';

/**
 * One-off: log the features and fixes shipped on 2026-05-21 (first day of
 * the Ghana on-site deployment) into the system_updates table so they show
 * on the Public Updates / What's New page for the clinic.
 */
const UPDATES: Array<{
  title: string;
  description: string;
  category: 'feature' | 'improvement' | 'bugfix';
}> = [
  {
    title: 'Test Sets (Order Sets) for Lab Orders',
    description:
      'Doctors can now save reusable bundles of lab tests — e.g. BIGPAY Screening or Olams Pre-Employment — and apply the whole set with one tap. Most-used sets pin as chips at the top of the Lab Tests card. Sets are clinic-shared by default so every doctor sees them.',
    category: 'feature',
  },
  {
    title: 'Release Patient Before Lab Results',
    description:
      'Lab techs can release a patient from the lab while their tests are still processing. The room is freed, the encounter is closed, and the receptionist is alerted to handle billing — so the patient does not wait hours for slow turnaround panels.',
    category: 'feature',
  },
  {
    title: 'Review-and-Sign Modal for Unsigned Notes',
    description:
      'Clicking Sign on an unsigned note in the doctor dashboard\'s Action Items now opens the full SOAP note for review and last-minute edits before signing — replacing the bare confirmation pop-up that signed without showing the chart.',
    category: 'improvement',
  },
  {
    title: 'In-App Dialogs Replace Browser Pop-ups',
    description:
      'All confirm, alert and prompt browser pop-ups across the EMR have been replaced with consistent in-app modals. Destructive actions read as destructive (red), saves read as positive (green), and the entire app now speaks one visual language.',
    category: 'improvement',
  },
  {
    title: 'Super Admin "Login As" Restored',
    description:
      'Super admins (e.g. Sedo) can again impersonate any non-admin user from the staff table — including while viewing as the demo admin role. Two separate bugs were causing the affordance to disappear or 403 silently.',
    category: 'bugfix',
  },
  {
    title: 'Forced Password Change Prompt No Longer Swallowed',
    description:
      'After an admin resets a user\'s password, the user is now correctly prompted to set a new password on next login. Previously a race condition in the login screen redirected them to the dashboard before the prompt could appear.',
    category: 'bugfix',
  },
  {
    title: 'Removed Hard-Coded Example Test Names',
    description:
      'The Lab Tests and Imaging inputs on the doctor dashboard no longer show "CBC, CMP, Lipid Panel…" / "X-Ray, CT, MRI…" as placeholder examples. The inputs are blank so doctors are not nudged toward US-style panels by default.',
    category: 'improvement',
  },
];

const TODAY = '2026-05-21';

export async function addMay21Updates() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find a creator user so we can attribute the entries. Prefer an admin
    // super-admin; fall back to any active admin.
    const creator = await client.query(
      `SELECT id FROM users
        WHERE is_active = TRUE
          AND (is_super_admin = TRUE OR role = 'admin')
        ORDER BY is_super_admin DESC, id ASC
        LIMIT 1`
    );
    if (creator.rows.length === 0) {
      throw new Error('No admin / super-admin user found to attribute updates to');
    }
    const createdBy = creator.rows[0].id;

    for (const u of UPDATES) {
      // Idempotent: skip if a row with the same title + date already exists.
      const exists = await client.query(
        `SELECT id FROM system_updates WHERE title = $1 AND update_date::date = $2::date`,
        [u.title, TODAY]
      );
      if (exists.rows.length > 0) {
        console.log(`Skipping (already exists): ${u.title}`);
        continue;
      }

      await client.query(
        `INSERT INTO system_updates (title, description, category, status, update_date, created_by)
         VALUES ($1, $2, $3, 'completed', $4, $5)`,
        [u.title, u.description, u.category, TODAY, createdBy]
      );
      console.log(`Added: ${u.title}`);
    }

    await client.query('COMMIT');
    console.log(`\nLogged ${UPDATES.length} updates for ${TODAY}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to add May 21 updates:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addMay21Updates()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
