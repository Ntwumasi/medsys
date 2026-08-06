import pool from '../db';

/**
 * Invoice status must follow the money, not lag behind it.
 *
 * Bug: every code path that appends a charge to an existing invoice (labs,
 * imaging, pharmacy, nurse procedures, charge master) bumps `total_amount` but
 * never re-derives `status`. So an invoice that was settled in full — meds paid
 * at the front desk, status 'paid' — silently stays 'paid' after labs are
 * ordered later in the visit. The result:
 *   - the new balance is invisible to the outstanding/aging reports, which all
 *     filter on `status != 'paid'`;
 *   - revenue stats (SUM(total_amount) FILTER status='paid') count money that
 *     was never collected;
 *   - the invoice reads as "paid and locked" in the UI, so reception can't
 *     correct a mistakenly-ordered test.
 *
 * Fix (structural): a BEFORE UPDATE trigger that re-derives status whenever
 * `total_amount` actually changes. Scoping it to a total change is deliberate —
 * it targets exactly the drift above and leaves every explicit status write
 * (cancellation, payment posting, QuickBooks sync) untouched, so the trigger
 * can't fight the application over rows whose totals aren't moving.
 * 'cancelled' is terminal and always preserved.
 */
export const fixInvoiceStatusOnTotalChange = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE OR REPLACE FUNCTION invoices_rederive_status_on_total_change()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only act when the bill itself moved. Explicit status transitions on an
        -- unchanged total are the application's business, not ours.
        IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
          -- A voided/cancelled invoice stays voided.
          IF COALESCE(NEW.status, '') <> 'cancelled' THEN
            NEW.status := CASE
              WHEN NEW.total_amount > 0
               AND COALESCE(NEW.amount_paid, 0) >= NEW.total_amount - 0.005 THEN 'paid'
              WHEN COALESCE(NEW.amount_paid, 0) > 0 THEN 'partial'
              ELSE 'pending'
            END;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_invoices_rederive_status ON invoices;`);
    await client.query(`
      CREATE TRIGGER trg_invoices_rederive_status
      BEFORE UPDATE ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION invoices_rederive_status_on_total_change();
    `);

    // --- Backfill -----------------------------------------------------------
    // Only the unambiguous cohort: invoices that HAVE a real payment recorded
    // but whose total later outgrew it. Those are provably this bug — money was
    // collected, then more charges landed.
    //
    // Deliberately NOT touched: invoices marked 'paid' with no payment record at
    // all (amount_paid = 0). Those have a different, older cause and flipping
    // them would push balances back onto patients who may well have paid in
    // cash. That set needs an accounting decision, not a migration.
    const backfill = await client.query(`
      UPDATE invoices i
      SET status = CASE WHEN COALESCE(i.amount_paid, 0) > 0 THEN 'partial' ELSE 'pending' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE i.status = 'paid'
        AND i.total_amount > COALESCE(i.amount_paid, 0) + 0.005
        AND EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)
      RETURNING i.id, i.invoice_number, i.total_amount, i.amount_paid,
                (i.total_amount - COALESCE(i.amount_paid, 0)) AS balance
    `);

    const recovered = backfill.rows.reduce((s: number, r: any) => s + Number(r.balance), 0);
    console.log(`[fixInvoiceStatusOnTotalChange] trigger installed.`);
    console.log(`[fixInvoiceStatusOnTotalChange] re-opened ${backfill.rows.length} invoice(s) that were wrongly marked paid; GHS ${recovered.toFixed(2)} of balance is now visible to collections.`);

    const stranded = await client.query(`
      SELECT COUNT(*)::int AS n,
             COALESCE(SUM(total_amount - COALESCE(amount_paid, 0)), 0) AS bal
      FROM invoices i
      WHERE i.status = 'paid'
        AND i.total_amount > COALESCE(i.amount_paid, 0) + 0.005
    `);
    if (stranded.rows[0].n > 0) {
      console.log(`[fixInvoiceStatusOnTotalChange] NOTE: ${stranded.rows[0].n} invoice(s) (GHS ${Number(stranded.rows[0].bal).toFixed(2)}) are marked paid with no payment on record. Left untouched pending an accounting review.`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  fixInvoiceStatusOnTotalChange()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch((e) => { console.error('Migration failed:', e); process.exit(1); });
}

export default fixInvoiceStatusOnTotalChange;
