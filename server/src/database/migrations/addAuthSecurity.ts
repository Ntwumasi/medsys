import pool from '../db';

export async function addAuthSecurity() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Starting auth security migration...\n');

    // 1. Add new columns to users table
    console.log('Adding columns to users table...');

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(20) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_breakglass BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
    `);
    console.log('✅ Added user security columns');

    // 2. Create password_reset_tokens table
    console.log('Creating password_reset_tokens table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
    `);
    console.log('✅ Created password_reset_tokens table');

    // 3. Create login_attempts table for tracking and brute force protection
    console.log('Creating login_attempts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        success BOOLEAN NOT NULL,
        failure_reason VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
    `);
    console.log('✅ Created login_attempts table');

    // 4. Create breakglass_alerts table for emergency access alerts
    console.log('Creating breakglass_alerts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS breakglass_alerts (
        id SERIAL PRIMARY KEY,
        breakglass_user_id INTEGER REFERENCES users(id) NOT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        details JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_breakglass_alerts_user_id ON breakglass_alerts(breakglass_user_id);
      CREATE INDEX IF NOT EXISTS idx_breakglass_alerts_created_at ON breakglass_alerts(created_at);
    `);
    console.log('✅ Created breakglass_alerts table');

    // 5. Add password history table (to prevent reuse)
    console.log('Creating password_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);
    `);
    console.log('✅ Created password_history table');

    // 6. Update existing users - set password_changed_at to now for active users
    await client.query(`
      UPDATE users
      SET password_changed_at = CURRENT_TIMESTAMP
      WHERE password_changed_at IS NULL AND is_active = true
    `);
    console.log('✅ Updated existing users with password_changed_at');

    // 7. Set must_change_password = true for patient role users with default password
    // This helps enforce password change on first login for patients
    await client.query(`
      UPDATE users
      SET must_change_password = true
      WHERE role = 'patient' AND must_change_password IS NULL
    `);
    console.log('✅ Flagged patient accounts for password change');

    await client.query('COMMIT');
    console.log('\n✅ Auth security migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  addAuthSecurity()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
