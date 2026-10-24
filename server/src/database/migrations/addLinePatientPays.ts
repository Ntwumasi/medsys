/**
 * Migration: let single medication lines be paid by the patient on an
 * insured/corporate invoice
 *
 * Pharmacy: "a button for mode of payment to be changed for insurance clients
 * who may have to pay cash for exempted medications". Who pays was only known
 * per patient, so every line on an insured patient's invoice went to the
 * insurer — exempted meds included — and reception had no way to collect cash
 * for part of the bill.
 *
 * - pharmacy_orders.patient_pays: the pharmacist's choice, set before (or
 *   after) dispensing, with who/when/why.
 * - invoice_items.bill_to: 'payer' (default — unchanged behaviour) or
 *   'patient'. Claims and payer settlement only cover 'payer' lines; reception
 *   collects the 'patient' lines.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE pharmacy_orders
        ADD COLUMN IF NOT EXISTS patient_pays BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS patient_pays_reason TEXT,
        ADD COLUMN IF NOT EXISTS patient_pays_set_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS patient_pays_set_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS bill_to VARCHAR(10) NOT NULL DEFAULT 'payer'
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_bill_to_check') THEN
          ALTER TABLE invoice_items
            ADD CONSTRAINT invoice_items_bill_to_check CHECK (bill_to IN ('payer', 'patient'));
        END IF;
      END $$
    `);

    await client.query('COMMIT');
    console.log('pharmacy_orders.patient_pays and invoice_items.bill_to added.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('addLinePatientPays migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
