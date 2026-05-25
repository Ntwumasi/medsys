import pool from '../db';

// Adds geolocation columns to login_attempts so the admin login audit panel
// can flag logins originating far from the clinic. Lat/lon come from the
// browser at login time (with user permission); distance_from_clinic_m is
// computed server-side via Haversine against CLINIC_LATITUDE / CLINIC_LONGITUDE
// (defaults to the Mahama Road clinic coordinates).
async function addLoginGeolocation() {
  console.log('Adding geolocation columns to login_attempts...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6);
      ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6);
      ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS geo_accuracy_m INTEGER;
      ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS geo_source VARCHAR(20);
      ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS distance_from_clinic_m INTEGER;
    `);
    console.log('✅ Added lat/lon/accuracy/source/distance columns');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_distance ON login_attempts(distance_from_clinic_m);
    `);
    console.log('✅ Indexed distance_from_clinic_m');

    await client.query('COMMIT');
    console.log('\n✅ Login geolocation migration completed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
  process.exit(0);
}

addLoginGeolocation().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
