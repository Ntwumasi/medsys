import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create nurse_inventory table
    await client.query(`
      CREATE TABLE IF NOT EXISTS nurse_inventory (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'Supplies',
        unit VARCHAR(50) DEFAULT 'pcs',
        quantity_on_hand INTEGER NOT NULL DEFAULT 0,
        reorder_level INTEGER DEFAULT 10,
        unit_cost DECIMAL(10,2) DEFAULT 0,
        location VARCHAR(255) DEFAULT 'Nurse Station',
        supplier VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create nurse_purchases table
    await client.query(`
      CREATE TABLE IF NOT EXISTS nurse_purchases (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER REFERENCES nurse_inventory(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        unit_cost DECIMAL(10,2) DEFAULT 0,
        total_cost DECIMAL(10,2) DEFAULT 0,
        supplier VARCHAR(255),
        batch_number VARCHAR(100),
        notes TEXT,
        purchased_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nurse_inventory_category ON nurse_inventory(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nurse_inventory_active ON nurse_inventory(is_active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nurse_purchases_inventory ON nurse_purchases(inventory_id)`);

    // Seed initial inventory items
    const count = await client.query('SELECT COUNT(*) FROM nurse_inventory');
    if (parseInt(count.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO nurse_inventory (item_name, category, unit, quantity_on_hand, reorder_level, location) VALUES
        ('Syringes (10ml)', 'Supplies', 'pcs', 45, 20, 'Cabinet A'),
        ('Gauze Pads', 'Supplies', 'pcs', 120, 50, 'Cabinet A'),
        ('IV Catheters', 'Supplies', 'pcs', 8, 15, 'Cabinet B'),
        ('Blood Pressure Cuffs', 'Equipment', 'pcs', 5, 3, 'Station 1'),
        ('Thermometer Covers', 'Supplies', 'pcs', 200, 100, 'Cabinet A'),
        ('Alcohol Swabs', 'Supplies', 'boxes', 15, 10, 'Cabinet B'),
        ('Bandages (Elastic)', 'Supplies', 'rolls', 30, 15, 'Cabinet C'),
        ('Gloves (Medium)', 'PPE', 'boxes', 3, 5, 'Cabinet A'),
        ('Gloves (Large)', 'PPE', 'boxes', 4, 5, 'Cabinet A'),
        ('N95 Masks', 'PPE', 'pcs', 25, 20, 'Cabinet D'),
        ('Pulse Oximeters', 'Equipment', 'pcs', 3, 2, 'Station 1'),
        ('Stethoscopes', 'Equipment', 'pcs', 4, 2, 'Station 1')
      `);
      console.log('Seeded 12 nurse inventory items');
    }

    await client.query('COMMIT');
    console.log('Nurse inventory migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Nurse inventory migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
