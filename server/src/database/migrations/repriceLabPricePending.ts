import pool from '../db';
import { resolveLabCatalogItem } from '../../controllers/ordersController';

/**
 * Price the lab lines left at GHS 0 "[PRICE PENDING]" on invoices that are
 * still open, now that the resolver knows the everyday names doctors type
 * (FBC, LFTs, malaria film, BUE&Cr…).
 *
 * Only UNPAID work is touched: invoice status pending/partial and not yet
 * submitted to a payer. Paid invoices are left for the accountant to decide.
 * A line the resolver still can't price stays [PRICE PENDING].
 *
 * DRY_RUN=1 prints what would change without writing. Idempotent: a priced
 * line no longer says [PRICE PENDING], so a re-run skips it.
 */
export async function repriceLabPricePending(dryRun = process.env.DRY_RUN === '1') {
  const lines = await pool.query(
    `SELECT ii.id, ii.invoice_id, ii.description, ii.quantity, p.gender
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       LEFT JOIN patients p ON p.id = i.patient_id
      WHERE ii.category = 'lab'
        AND ii.description ILIKE '%[PRICE PENDING]%'
        AND i.status IN ('pending', 'partial')
        AND i.payer_submitted_at IS NULL`
  );

  const touched = new Set<number>();
  let priced = 0;
  for (const line of lines.rows) {
    const typed = String(line.description)
      .replace(/\s*\[PRICE PENDING\]\s*/i, '')
      .replace(/^Lab:\s*/i, '')
      .trim();
    const r = await resolveLabCatalogItem(null, typed, { patientSex: line.gender });
    const price = Number(r.match?.base_price) || 0;
    if (!r.match || price <= 0) {
      console.log(`  still pending: invoice ${line.invoice_id} "${typed}"`);
      continue;
    }
    const qty = Number(line.quantity) || 1;
    console.log(`  invoice ${line.invoice_id}: "${typed}" -> ${r.match.test_name} GHS ${price.toFixed(2)} x${qty}`);
    priced++;
    if (dryRun) continue;
    await pool.query(
      `UPDATE invoice_items SET description = $2, unit_price = $3, total_price = $4 WHERE id = $1`,
      [line.id, `Lab: ${r.match.test_name}`, price, Math.round(price * qty * 100) / 100]
    );
    touched.add(line.invoice_id);
  }

  for (const invoiceId of touched) {
    await pool.query(
      `UPDATE invoices
          SET subtotal = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0),
              total_amount = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0) + COALESCE(tax, 0),
              status = CASE
                WHEN COALESCE(amount_paid, 0) >= COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0) + COALESCE(tax, 0)
                     AND COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0) > 0 THEN 'paid'
                WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
                ELSE 'pending' END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [invoiceId]
    );
  }
  console.log(`repriceLabPricePending: ${priced} of ${lines.rows.length} open lines priced${dryRun ? ' (dry run, nothing written)' : `, ${touched.size} invoices updated`}.`);
}

if (require.main === module) {
  repriceLabPricePending()
    .then(() => process.exit(0))
    .catch((e) => { console.error('repriceLabPricePending failed:', e); process.exit(1); });
}
