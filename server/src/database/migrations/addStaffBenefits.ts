import pool from '../db';

/**
 * Staff health-package benefit (from the "Employee Health Package" sheet).
 *
 * Each staff patient (payer_type='staff') gets an annual package amount (e.g.
 * GHS 1000 / 800). This table stores the cap; usage is computed live from the
 * patient's invoices in the current period, so there's no counter to keep in
 * sync. Automatic billing split (what the clinic covers vs. patient overage) is
 * a later step — this is the tracking/visibility layer.
 */
const addStaffBenefits = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_benefits (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
        annual_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
        period_start DATE NOT NULL DEFAULT date_trunc('year', CURRENT_DATE)::date,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_staff_benefits_patient ON staff_benefits(patient_id)`);
    console.log('Created staff_benefits table.');
  } catch (error) {
    console.error('Error creating staff_benefits:', error);
    throw error;
  }
};

export default addStaffBenefits;

if (require.main === module) {
  addStaffBenefits()
    .then(() => { console.log('Migration completed successfully'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
