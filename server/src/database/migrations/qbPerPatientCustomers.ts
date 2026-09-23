import pool from '../db';

/**
 * Bill QuickBooks per-patient (not to a single "Cash Sales" customer).
 *
 * The config had use_cash_sales_customer=true but no Cash Sales ListID was ever
 * resolved, while the actual sync path (generateQBXML) bills each patient as its
 * own QB customer. That mismatch left cash-sales mode half-configured. We commit
 * to per-patient customers (what the code does and what the QB fixes wired up),
 * so turn the flag off for consistency.
 */
const qbPerPatientCustomers = async () => {
  try {
    await pool.query(`
      UPDATE quickbooks_config
      SET use_cash_sales_customer = false
      WHERE id = 1
    `);
    console.log('QuickBooks set to per-patient customers (use_cash_sales_customer=false).');
  } catch (error) {
    console.error('Error setting QB per-patient mode:', error);
    throw error;
  }
};

export default qbPerPatientCustomers;

if (require.main === module) {
  qbPerPatientCustomers()
    .then(() => { console.log('Migration completed successfully'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
