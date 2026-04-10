import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * Adds an `is_demo_user` flag to the users table and seeds one demo
 * user per role. Super admins use these accounts via the role switcher
 * so cross-department workflows route to predictable test users.
 */

interface DemoUser {
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

const demoUsers: DemoUser[] = [
  { firstName: 'Mary',     lastName: 'Davis',    username: 'mdavis',    role: 'receptionist'  },
  { firstName: 'Sarah',    lastName: 'Johnson',  username: 'sjohnson',  role: 'nurse'         },
  { firstName: 'John',     lastName: 'Smith',    username: 'jsmith',    role: 'doctor'        },
  { firstName: 'Mike',     lastName: 'Wilson',   username: 'mwilson',   role: 'lab'           },
  { firstName: 'Emily',    lastName: 'Brown',    username: 'ebrown',    role: 'pharmacy'      },
  { firstName: 'Patricia', lastName: 'Wright',   username: 'pwright',   role: 'pharmacist'    },
  { firstName: 'Kevin',    lastName: 'Garcia',   username: 'kgarcia',   role: 'pharmacy_tech' },
  { firstName: 'Lisa',     lastName: 'Martinez', username: 'lmartinez', role: 'imaging'       },
  { firstName: 'Robert',   lastName: 'Taylor',   username: 'rtaylor',   role: 'accountant'    },
  { firstName: 'Jennifer', lastName: 'Anderson', username: 'janderson', role: 'admin'         },
];

export async function addDemoUsers() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo_user BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Added is_demo_user column');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_demo_role
        ON users(role) WHERE is_demo_user = TRUE
    `);

    const passwordHash = await bcrypt.hash('demo123', 10);
    let created = 0;
    let updated = 0;

    for (const u of demoUsers) {
      // Make sure no other user is flagged as the demo for this role.
      await client.query(
        `UPDATE users
            SET is_demo_user = FALSE
          WHERE role = $1 AND is_demo_user = TRUE AND username <> $2`,
        [u.role, u.username]
      );

      const existing = await client.query(
        `SELECT id FROM users WHERE username = $1`,
        [u.username]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE users
              SET role = $1,
                  first_name = $2,
                  last_name = $3,
                  is_demo_user = TRUE,
                  is_active = TRUE,
                  must_change_password = FALSE,
                  password_changed_at = NOW()
            WHERE username = $4`,
          [u.role, u.firstName, u.lastName, u.username]
        );
        updated++;
        console.log(`🔄 Updated demo user: ${u.firstName} ${u.lastName} (${u.role})`);
      } else {
        const email = `${u.username}@medsys-demo.local`;
        await client.query(
          `INSERT INTO users (
             first_name, last_name, email, username, password_hash,
             role, is_active, is_demo_user, must_change_password, password_changed_at
           ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE,FALSE,NOW())`,
          [u.firstName, u.lastName, email, u.username, passwordHash, u.role]
        );
        created++;
        console.log(`✅ Created demo user: ${u.firstName} ${u.lastName} (${u.role})`);
      }
    }

    await client.query('COMMIT');
    console.log(`\n📊 Demo users: ${created} created, ${updated} updated`);
    console.log('Default password: demo123 (these accounts are used by super admin role switcher)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addDemoUsers()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
