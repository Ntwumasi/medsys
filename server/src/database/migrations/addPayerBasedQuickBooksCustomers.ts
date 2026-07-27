import pool from '../db';

/**
 * Payer-based QuickBooks customer mapping.
 *
 * The accountant keeps her QB customers as the PAYERS (Acacia Insurance, a
 * corporate client, a single "Cash Sales" bucket for self-pay), and books each
 * invoice under the matching payer — not under a per-patient customer. This adds
 * the columns that let the sync reference those existing QB customers by name:
 *
 *  - insurance_providers.quickbooks_customer_name  — exact QB customer name for
 *    each insurer (falls back to the provider name when null).
 *  - corporate_clients.quickbooks_customer_name    — same, per corporate client.
 *  - quickbooks_config.use_payer_based_customers    — master switch. OFF keeps
 *    the legacy per-patient behaviour; ON routes invoices/payments to the
 *    payer customer (self_pay/staff -> cash_sales_customer_name).
 *
 * Default OFF so nothing changes until the accountant has filled in the mapping
 * and flipped it on in Settings.
 */
const addPayerBasedQuickBooksCustomers = async () => {
  try {
    await pool.query(`
      ALTER TABLE insurance_providers
        ADD COLUMN IF NOT EXISTS quickbooks_customer_name VARCHAR(200)
    `);
    await pool.query(`
      ALTER TABLE corporate_clients
        ADD COLUMN IF NOT EXISTS quickbooks_customer_name VARCHAR(200)
    `);
    await pool.query(`
      ALTER TABLE quickbooks_config
        ADD COLUMN IF NOT EXISTS use_payer_based_customers BOOLEAN DEFAULT false
    `);
    console.log('Added payer-based QuickBooks customer columns.');
  } catch (error) {
    console.error('Error adding payer-based QB customer columns:', error);
    throw error;
  }
};

export default addPayerBasedQuickBooksCustomers;

if (require.main === module) {
  addPayerBasedQuickBooksCustomers()
    .then(() => { console.log('Migration completed successfully'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
