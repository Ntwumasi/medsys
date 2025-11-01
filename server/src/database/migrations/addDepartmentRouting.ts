import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating department_routing table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS department_routing (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        department VARCHAR(50) NOT NULL, -- 'lab', 'pharmacy', 'imaging', 'receptionist'
        status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in-progress', 'completed', 'cancelled'
        priority VARCHAR(20) DEFAULT 'routine', -- 'routine', 'urgent', 'stat'
        notes TEXT,
        routed_by INTEGER REFERENCES users(id),
        routed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating indexes for department_routing...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_department_routing_encounter ON department_routing(encounter_id);
      CREATE INDEX IF NOT EXISTS idx_department_routing_patient ON department_routing(patient_id);
      CREATE INDEX IF NOT EXISTS idx_department_routing_dept_status ON department_routing(department, status);
      CREATE INDEX IF NOT EXISTS idx_department_routing_routed_at ON department_routing(routed_at);
    `);

    console.log('Adding routing status to encounters table...');
    await client.query(`
      ALTER TABLE encounters
      ADD COLUMN IF NOT EXISTS routing_status VARCHAR(50) DEFAULT 'none';
      -- 'none', 'pending_routing', 'in_departments', 'routing_complete'
    `);

    await client.query('COMMIT');
    console.log('Department routing migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
