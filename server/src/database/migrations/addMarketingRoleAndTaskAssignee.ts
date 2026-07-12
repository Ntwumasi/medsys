import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * Adds the `marketing` role and a structured task assignee.
 *
 * - Widens the users.role CHECK constraint to include 'marketing' (mirrors
 *   addOfficeManagerRole). Marketing is a minimal role: its only surface is a
 *   task list showing the tasks assigned to that user.
 * - Adds `admin_tasks.assigned_to` (FK → users.id) so tasks can be assigned to a
 *   specific person (the office manager assigns; the Marketing dashboard shows
 *   only the tasks assigned to marketing). Assignment was previously free-text
 *   (`contact_person`), which couldn't drive a per-person view.
 * - Flips Charles Baba (username `cbaba`) from admin → marketing, since his
 *   account already exists and marketing is his actual role.
 *
 * Idempotent + transactional.
 */
export async function addMarketingRoleAndTaskAssignee() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Allow 'marketing' in the role constraint (full list + marketing).
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN (
        'doctor', 'nurse', 'admin', 'office_manager', 'receptionist', 'patient',
        'lab', 'pharmacy', 'pharmacist', 'pharmacy_tech', 'imaging', 'accountant',
        'marketing'
      ))
    `);

    // 2. Ensure admin_tasks exists (it's normally bootstrapped lazily by the
    //    controller) and add the assignee column.
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_tasks (
        id              SERIAL PRIMARY KEY,
        category        VARCHAR(100) NOT NULL,
        task            TEXT NOT NULL,
        contact_person  VARCHAR(255),
        responsibility  VARCHAR(255),
        status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'complete', 'blocked')),
        remarks         TEXT,
        cost            VARCHAR(100),
        due_date        DATE,
        created_by      INTEGER REFERENCES users(id),
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(
      `ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_tasks_assigned_to ON admin_tasks(assigned_to)`
    );

    // 3. Charles Baba → marketing (account already exists as admin).
    const flip = await client.query(
      `UPDATE users SET role = 'marketing', updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(username) = 'cbaba' AND role <> 'marketing'
       RETURNING id, username`
    );
    console.log(
      flip.rowCount
        ? `Flipped ${flip.rows.map((r) => r.username).join(', ')} to marketing.`
        : 'No admin "cbaba" to flip (already marketing or not found) — nothing to do.'
    );

    // 4. Seed a demo marketing user so super admins can preview the Marketing
    //    dashboard from the role picker (switch-to-demo needs a demo user for
    //    the role). Mirrors addDemoUsers. Charles (real user) is untouched.
    const demoUsername = 'marketingdemo';
    await client.query(
      `UPDATE users SET is_demo_user = FALSE
        WHERE role = 'marketing' AND is_demo_user = TRUE AND username <> $1`,
      [demoUsername]
    );
    const existingDemo = await client.query(`SELECT id FROM users WHERE username = $1`, [demoUsername]);
    if (existingDemo.rows.length > 0) {
      await client.query(
        `UPDATE users SET role = 'marketing', is_demo_user = TRUE, is_active = TRUE,
                must_change_password = FALSE, password_changed_at = NOW()
          WHERE username = $1`,
        [demoUsername]
      );
    } else {
      const passwordHash = await bcrypt.hash('demo123', 10);
      await client.query(
        `INSERT INTO users (first_name, last_name, email, username, password_hash,
            role, is_active, is_demo_user, must_change_password, password_changed_at)
         VALUES ('Marketing', 'Demo', $1, $2, $3, 'marketing', TRUE, TRUE, FALSE, NOW())`,
        [`${demoUsername}@medsys-demo.local`, demoUsername, passwordHash]
      );
    }
    console.log('Ensured demo marketing user (marketingdemo).');

    await client.query('COMMIT');
    console.log('addMarketingRoleAndTaskAssignee migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addMarketingRoleAndTaskAssignee migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addMarketingRoleAndTaskAssignee()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
