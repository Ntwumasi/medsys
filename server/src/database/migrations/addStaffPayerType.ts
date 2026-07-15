import pool from '../db';

/**
 * Add a 'staff' payer type.
 *
 * Hospital employees who receive care are billed as "Staff" (often a benefit /
 * different pricing). Structurally staff behaves like self_pay: no corporate
 * client and no insurance provider is attached — the payer IS the employee.
 *
 * Relaxes the two CHECK constraints on patient_payer_sources to allow the new
 * value. Idempotent: drops-if-exists then re-adds.
 */
const addStaffPayerType = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Allow 'staff' in the payer_type enum check.
    await client.query(`ALTER TABLE patient_payer_sources DROP CONSTRAINT IF EXISTS patient_payer_sources_payer_type_check`);
    await client.query(`
      ALTER TABLE patient_payer_sources
      ADD CONSTRAINT patient_payer_sources_payer_type_check
      CHECK (payer_type IN ('self_pay', 'corporate', 'insurance', 'staff'))
    `);

    // 2) Extend the shape constraint: staff (like self_pay) carries no
    //    corporate_client_id / insurance_provider_id.
    await client.query(`ALTER TABLE patient_payer_sources DROP CONSTRAINT IF EXISTS valid_payer_source`);
    await client.query(`
      ALTER TABLE patient_payer_sources
      ADD CONSTRAINT valid_payer_source CHECK (
        (payer_type = 'self_pay'  AND corporate_client_id IS NULL AND insurance_provider_id IS NULL) OR
        (payer_type = 'staff'     AND corporate_client_id IS NULL AND insurance_provider_id IS NULL) OR
        (payer_type = 'corporate' AND corporate_client_id IS NOT NULL AND insurance_provider_id IS NULL) OR
        (payer_type = 'insurance' AND insurance_provider_id IS NOT NULL AND corporate_client_id IS NULL)
      )
    `);

    await client.query('COMMIT');
    console.log("'staff' payer type enabled on patient_payer_sources.");
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding staff payer type:', error);
    throw error;
  } finally {
    client.release();
  }
};

export default addStaffPayerType;

if (require.main === module) {
  addStaffPayerType()
    .then(() => { console.log('Migration completed successfully'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
