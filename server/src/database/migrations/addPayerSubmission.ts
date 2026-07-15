import pool from '../db';

/**
 * Track corporate/insurance submission on the invoice itself.
 *
 * Previously "Submit to Corporate/Insurance" marked the invoice status='paid'
 * with no payment — so an unpaid payer bill looked settled and inflated
 * collections. Instead we record WHEN it was submitted to the payer; the
 * invoice stays a receivable (status pending/partial, amount_paid unchanged) and
 * is shown as "Submitted — awaiting payer". It's marked paid only when the payer
 * actually settles.
 */
const addPayerSubmission = async () => {
  try {
    await pool.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payer_submitted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payer_submitted_by INTEGER REFERENCES users(id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_payer_submitted_at
      ON invoices(payer_submitted_at)
    `);
    console.log('Added invoices.payer_submitted_at / payer_submitted_by.');
  } catch (error) {
    console.error('Error adding payer submission columns:', error);
    throw error;
  }
};

export default addPayerSubmission;

if (require.main === module) {
  addPayerSubmission()
    .then(() => { console.log('Migration completed successfully'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
