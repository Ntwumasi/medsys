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
  // ---- Features ----
  {
    title: 'Test Sets (Order Sets) for Lab Orders',
    description:
      'Doctors can now save reusable bundles of lab tests — e.g. BIGPAY Screening or Olams Pre-Employment — and apply the whole set with one tap. Most-used sets pin as chips at the top of the Lab Tests card. Sets are clinic-shared by default so every doctor sees them.',
    category: 'feature',
  },
  {
    title: 'Send Patient Back to Nurse from Lab, Pharmacy, Imaging',
    description:
      'Lab, pharmacy and imaging now have a Send to Nurse button on each patient. It hands the patient back to the nurse so the nurse can decide what is next (more orders, another department, or final checkout) — while lab tests keep processing in the background. The button greys out after click so it can\'t be pressed twice.',
    category: 'feature',
  },

  // ---- Improvements ----
  {
    title: 'Review & Sign Opens the Full Chart',
    description:
      'Clicking Review & Sign on an unsigned note in the doctor dashboard\'s Action Items now opens the full encounter chart in the main panel — exactly as if the patient were sitting in a room. Doctor can edit diagnoses, clinical notes, SOAP sections, and orders before signing. Replaces the SOAP-only modal that showed too little.',
    category: 'improvement',
  },
  {
    title: 'In-App Dialogs Replace Browser Pop-ups',
    description:
      'All confirm, alert and prompt browser pop-ups across the EMR have been replaced with consistent in-app modals. Destructive actions read as destructive (red), saves read as positive (green), and the entire app now speaks one visual language.',
    category: 'improvement',
  },
  {
    title: 'Ready-for-Billing Collapsed by Default',
    description:
      'On the receptionist dashboard, the Ready for Billing list (often 20+ patients) is now a closed accordion. The header still shows the count at a glance; receptionists click to expand only when actively processing checkouts. Frees up screen real estate for the main queue.',
    category: 'improvement',
  },
  {
    title: 'Clear Patients from the Lab Walk-ins Queue',
    description:
      'Each row in the lab dashboard\'s Walk-ins tab now has Done and Remove actions. Done marks the routing complete (work is finished); Remove cancels a row that was routed by mistake. Either drops the patient off the queue so the list reflects reality.',
    category: 'improvement',
  },
  {
    title: 'Removed Hard-Coded Example Test Names',
    description:
      'The Lab Tests and Imaging inputs on the doctor dashboard no longer show "CBC, CMP, Lipid Panel…" / "X-Ray, CT, MRI…" as placeholder examples. The inputs are blank so doctors are not nudged toward US-style panels by default.',
    category: 'improvement',
  },

  // ---- Bug fixes ----
  {
    title: 'Lab & Imaging Now Show Nurse-Routed Patients',
    description:
      'When the nurse used Send to Lab or Send to Imaging from inside an encounter, the patient was invisible to the lab/imaging tech — the dashboards were only querying for explicit walk-ins. Both dashboards now show every patient routed to them, regardless of how they arrived.',
    category: 'bugfix',
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
