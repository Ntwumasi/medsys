import pool from '../db';

/**
 * Medicine delivery (home care phase 2). The pharmacy sends a patient's
 * medicines out with an external courier; there is no rider login — the
 * pharmacy updates the status as the courier reports back.
 *
 *  - deliveries: one per hand-off. Groups the pharmacy orders of ONE visit
 *    (so one invoice), where to go (address, Ghana GPS code, landmark, phone),
 *    the courier, the delivery fee and pay-on-delivery: the courier collects
 *    the patient's share (insured/corporate cover stays billed to the payer)
 *    and the pharmacy records it as a normal invoice payment on return.
 *    preparing → ready → out_for_delivery → delivered | failed (retry) | cancelled
 *  - delivery_events: status timeline (who, when, note) — also what the
 *    portal will show for tracking in phase 3.
 *  - pharmacy_orders.delivery_id: the order is going out in that delivery
 *    (so "ready for pickup" isn't texted for it).
 *  - charge_master DELIVERY at GHS 0: the default fee; the pharmacy enters the
 *    fee per delivery since distance varies. An admin can set a default price.
 *  - reminder_settings: patient_sms_delivery_enabled (OFF), the "your
 *    medicine is on its way" text.
 */
export async function addMedicineDeliveries() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        encounter_id INTEGER REFERENCES encounters(id),
        invoice_id INTEGER REFERENCES invoices(id),
        status VARCHAR(20) NOT NULL DEFAULT 'preparing',
        address TEXT,
        gps_address VARCHAR(100),
        landmark TEXT,
        contact_phone VARCHAR(30),
        courier_name VARCHAR(120),
        courier_phone VARCHAR(30),
        courier_reference VARCHAR(120),
        delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
        fee_invoice_item_id INTEGER REFERENCES invoice_items(id) ON DELETE SET NULL,
        pay_on_delivery BOOLEAN NOT NULL DEFAULT false,
        amount_to_collect NUMERIC(10, 2),
        amount_collected NUMERIC(10, 2),
        collected_method VARCHAR(30),
        collected_payment_id INTEGER,
        notes TEXT,
        failed_reason TEXT,
        created_by INTEGER REFERENCES users(id),
        dispatched_at TIMESTAMP,
        delivered_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT deliveries_status_check CHECK (status IN (
          'preparing', 'ready', 'out_for_delivery', 'delivered', 'failed', 'cancelled'
        ))
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries (status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deliveries_patient ON deliveries (patient_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_events (
        id SERIAL PRIMARY KEY,
        delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        note TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery ON delivery_events (delivery_id, created_at)`);

    await client.query(`
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS delivery_id INTEGER REFERENCES deliveries(id) ON DELETE SET NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_delivery ON pharmacy_orders (delivery_id) WHERE delivery_id IS NOT NULL
    `);

    await client.query(`
      INSERT INTO charge_master (service_name, service_code, category, price, description, is_active)
      VALUES ('Medicine delivery', 'DELIVERY', 'pharmacy', 0, 'Courier delivery of medicines to the patient', true)
      ON CONFLICT (service_code) DO NOTHING
    `);

    await client.query(`
      INSERT INTO reminder_settings (setting_key, setting_value, description)
      VALUES ('patient_sms_delivery_enabled', 'false', 'Text the patient when their medicine goes out for delivery')
      ON CONFLICT (setting_key) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('addMedicineDeliveries migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addMedicineDeliveries migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addMedicineDeliveries()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
