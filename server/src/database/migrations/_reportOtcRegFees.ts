import pool from '../db';

/**
 * READ-ONLY report — makes NO changes. Delete after running.
 *
 * Buckets pending "Patient Registration Fee" (GHS 75, category 'registration')
 * invoices so we can safely void ONLY the ones that were wrongly charged to
 * pharmacy OTC walk-ins, without touching legitimate real-patient registration
 * AR.
 *
 * Buckets:
 *   [1] SAFE TO VOID — patient has >=1 encounter and EVERY encounter is OTC /
 *       pharmacy-walk-in (never a real clinical visit). These are pharmacy
 *       walk-ins that should never have been charged registration.
 *   [2] AMBIGUOUS   — patient has NO encounters yet. Could be a reception
 *       pre-registration (fee legitimately owed) or a walk-in whose check-in
 *       failed. Reported for manual judgement; NOT auto-voidable.
 *   [3] KEEP        — patient has >=1 NON-OTC encounter (real patient). Legit AR.
 *   [4] PAID        — registration fee already collected. Never touch.
 */
const OTC_ENC = `(e.is_otc = true
  OR e.clinic = 'Pharmacy (OTC/Walk-in)'
  OR LOWER(TRIM(COALESCE(e.chief_complaint,''))) = 'otc purchase')`;

async function run() {
  const client = await pool.connect();
  try {
    // Base set: pending, unpaid registration-fee invoices.
    // (Paid ones handled separately in bucket [4].)
    const base = `
      FROM invoices inv
      JOIN invoice_items ii ON ii.invoice_id = inv.id AND ii.category = 'registration'
      JOIN patients p ON p.id = inv.patient_id
      JOIN users u ON u.id = p.user_id
    `;

    const hasEnc = `EXISTS (SELECT 1 FROM encounters e WHERE e.patient_id = p.id)`;
    const hasNonOtcEnc = `EXISTS (SELECT 1 FROM encounters e WHERE e.patient_id = p.id AND NOT ${OTC_ENC})`;
    const unpaid = `inv.status = 'pending' AND COALESCE(inv.amount_paid,0) = 0`;

    // [1] SAFE TO VOID
    const safe = await client.query(`
      SELECT inv.id AS invoice_id, inv.invoice_number, inv.created_at,
             u.first_name||' '||u.last_name AS patient, p.patient_number,
             ii.total_price
      ${base}
      WHERE ${unpaid} AND ${hasEnc} AND NOT ${hasNonOtcEnc}
      ORDER BY inv.created_at DESC
    `);
    console.log(`\n=== [1] SAFE TO VOID — OTC-only patients' pending 75 reg fees (${safe.rowCount}) ===`);
    console.table(safe.rows);
    const safeTotal = safe.rows.reduce((s, r) => s + parseFloat(r.total_price), 0);
    console.log(`   -> ${safe.rowCount} invoices, GHS ${safeTotal.toFixed(2)} total`);
    console.log(`   -> invoice_ids: [${safe.rows.map(r => r.invoice_id).join(', ')}]`);

    // [2] AMBIGUOUS (no encounters)
    const amb = await client.query(`
      SELECT COUNT(*) AS n, COALESCE(SUM(ii.total_price),0) AS total
      ${base}
      WHERE ${unpaid} AND NOT ${hasEnc}
    `);
    console.log(`\n=== [2] AMBIGUOUS — pending 75 reg fees, patient has NO encounters ===`);
    console.log(`   -> ${amb.rows[0].n} invoices, GHS ${amb.rows[0].total} (manual review — not auto-voided)`);

    // [3] KEEP (real patients)
    const keep = await client.query(`
      SELECT COUNT(*) AS n, COALESCE(SUM(ii.total_price),0) AS total
      ${base}
      WHERE ${unpaid} AND ${hasNonOtcEnc}
    `);
    console.log(`\n=== [3] KEEP — pending 75 reg fees for patients with a real (non-OTC) visit ===`);
    console.log(`   -> ${keep.rows[0].n} invoices, GHS ${keep.rows[0].total} (legitimate AR — untouched)`);

    // [4] PAID
    const paid = await client.query(`
      SELECT COUNT(*) AS n, COALESCE(SUM(ii.total_price),0) AS total
      ${base}
      WHERE NOT (${unpaid})
    `);
    console.log(`\n=== [4] PAID/settled 75 reg fees (never touch) ===`);
    console.log(`   -> ${paid.rows[0].n} invoices, GHS ${paid.rows[0].total}`);

    console.log('\nReport complete — no changes made. Review bucket [1] before we void it.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
