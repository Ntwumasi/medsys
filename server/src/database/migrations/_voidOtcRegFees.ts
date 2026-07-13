import pool from '../db';

/**
 * ONE-OFF cleanup — voids the reviewed OTC-only "Patient Registration Fee"
 * invoices that were wrongly charged to pharmacy walk-ins (bucket [1] of the
 * _reportOtcRegFees report, GHS 75/100 amounts). Sets status='cancelled'
 * (record preserved for audit; excluded from AR). NOT a delete.
 *
 * INV000204 (id 204, GHS 300) is deliberately EXCLUDED — held for manual review.
 *
 * Safety: before cancelling, re-verifies each invoice is STILL pending, unpaid,
 * and carries a registration line (so nothing that changed since the report —
 * e.g. got paid — is touched). Idempotent, single transaction.
 */
const TARGET_IDS = [
  525, 522, 502, 500, 485, 465, 457, 455, 453, 438, 409, 353, 351, 315, 281,
  263, 238, 236, 225, 214, 210, 207, 206, 201, 199, 188, 185, 181, 177, 176,
  174, 164, 143,
]; // 33 invoices — INV000204 (300) intentionally omitted

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT inv.id, inv.invoice_number, inv.status,
              COALESCE(inv.amount_paid,0) AS paid,
              EXISTS(SELECT 1 FROM invoice_items ii
                     WHERE ii.invoice_id = inv.id AND ii.category='registration') AS has_reg
         FROM invoices inv WHERE inv.id = ANY($1::int[])`,
      [TARGET_IDS]
    );

    const safe = (r: any) => r.status === 'pending' && parseFloat(r.paid) === 0 && r.has_reg;
    const cancellable = check.rows.filter(safe);
    const skipped = check.rows.filter((r) => !safe(r));
    const missing = TARGET_IDS.filter((id) => !check.rows.some((r) => r.id === id));

    if (missing.length) console.warn(`Not found (already cleaned?): ids ${missing.join(', ')}`);
    if (skipped.length) {
      console.warn(`Skipped ${skipped.length} no-longer-safe invoice(s):`);
      skipped.forEach((r) =>
        console.warn(`  - ${r.invoice_number}: status=${r.status} paid=${r.paid} has_reg=${r.has_reg}`)
      );
    }

    if (cancellable.length === 0) {
      console.log('Nothing to cancel (all already handled).');
      await client.query('COMMIT');
      return;
    }

    const ids = cancellable.map((r) => r.id);
    const upd = await client.query(
      `UPDATE invoices SET status='cancelled', updated_at=CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(
      `Cancelled ${upd.rowCount} OTC-only registration invoice(s): ` +
        cancellable.map((r) => r.invoice_number).join(', ')
    );

    await client.query('COMMIT');
    console.log('Void complete — INV000204 left untouched for manual review.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Void failed (rolled back):', e);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
