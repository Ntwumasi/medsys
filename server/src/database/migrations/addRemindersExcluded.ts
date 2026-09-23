import pool from '../db';

/**
 * Add invoices.reminders_excluded — lets the accountant "Start Afresh" on the
 * payment-reminders list by excluding all currently-outstanding invoices, so
 * the list starts empty and only invoices going forward appear. The invoices
 * themselves are untouched (still outstanding in aging / statements); this flag
 * only hides them from the reminders workflow.
 */
const addRemindersExcluded = async () => {
  try {
    await pool.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS reminders_excluded BOOLEAN DEFAULT false
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_reminders_excluded
      ON invoices(reminders_excluded)
    `);
    console.log('Added invoices.reminders_excluded.');
  } catch (error) {
    console.error('Error adding reminders_excluded:', error);
    throw error;
  }
};

export default addRemindersExcluded;

if (require.main === module) {
  addRemindersExcluded()
    .then(() => { console.log('Migration completed successfully'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
