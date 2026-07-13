import pool from '../db';

/**
 * READ-ONLY diagnostic — makes NO changes. Delete after running.
 * Answers two of Sharon's corrections:
 *  (A) the separate GHS 75 invoice a pharmacy purchase spawns — is it still
 *      being CREATED post-fix (>= 2026-07-09) or are these old leftovers, and
 *      what encounter do they attach to?
 *  (B) labs billed at GHS 0 (unpriced tests).
 */
const FIX_DATE = '2026-07-09'; // PR #8 (OTC consult-fee fix) merged

async function run() {
  const client = await pool.connect();
  try {
    // ============ (A) THE GHS 75 INVOICES ============

    // A0. NEW vs OLD split — the decisive question. Counts 75-priced consult-ish
    //     lines by whether their invoice was created before/after the fix.
    const split = await client.query(`
      SELECT
        CASE WHEN inv.created_at >= '${FIX_DATE}' THEN 'AFTER fix (>=${FIX_DATE})'
             ELSE 'before fix' END AS bucket,
        inv.status,
        COUNT(*) AS n,
        MIN(inv.created_at) AS earliest,
        MAX(inv.created_at) AS latest
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      WHERE (ii.unit_price = 75 OR ii.total_price = 75)
        AND (ii.category = 'consultation' OR ii.description ILIKE '%consult%')
      GROUP BY bucket, inv.status
      ORDER BY bucket, inv.status
    `);
    console.log(`\n=== [A0] 75 consult lines: NEW vs OLD (fix date ${FIX_DATE}) ===`);
    console.table(split.rows);

    // A1. Each 75 invoice with its encounter context (is it OTC-tagged? which clinic?).
    const items = await client.query(`
      SELECT ii.id AS item_id, ii.description, ii.category, ii.total_price,
             inv.invoice_number, inv.status AS inv_status,
             COALESCE(inv.amount_paid,0) AS paid, inv.created_at AS invoice_date,
             e.id AS enc, e.clinic, e.chief_complaint AS chief,
             e.is_otc, e.encounter_type AS type
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id
        LEFT JOIN encounters e ON e.id = inv.encounter_id
       WHERE ii.unit_price = 75 OR ii.total_price = 75
       ORDER BY inv.created_at DESC NULLS LAST
       LIMIT 60
    `);
    console.log(`\n=== [A1] invoice_items priced 75 with encounter context (${items.rowCount}) ===`);
    console.table(items.rows);

    // A2. The "second invoice" pattern: patients who on the SAME DAY have BOTH an
    //     OTC-purchase invoice AND a separate 75 invoice. Confirms the spawn.
    const paired = await client.query(`
      WITH otc AS (
        SELECT e.patient_id, DATE(inv.created_at) d, inv.invoice_number otc_inv, inv.total_amount otc_total
        FROM invoices inv JOIN encounters e ON e.id = inv.encounter_id
        WHERE e.is_otc = true OR LOWER(TRIM(COALESCE(e.chief_complaint,'')))='otc purchase'
      ),
      fee AS (
        SELECT e.patient_id, DATE(inv.created_at) d, inv.invoice_number fee_inv,
               inv.total_amount fee_total, inv.created_at,
               COALESCE(e.is_otc,false) fee_is_otc, e.clinic fee_clinic
        FROM invoices inv JOIN encounters e ON e.id = inv.encounter_id
        JOIN invoice_items ii ON ii.invoice_id = inv.id
        WHERE (ii.unit_price=75 OR ii.total_price=75)
          AND (ii.category='consultation' OR ii.description ILIKE '%consult%')
      )
      SELECT u.first_name||' '||u.last_name AS patient, fee.d AS day,
             otc.otc_inv, otc.otc_total, fee.fee_inv, fee.fee_total,
             fee.fee_is_otc, fee.fee_clinic, fee.created_at
      FROM fee
      JOIN otc ON otc.patient_id = fee.patient_id AND otc.d = fee.d
      JOIN patients p ON p.id = fee.patient_id
      JOIN users u ON u.id = p.user_id
      ORDER BY fee.created_at DESC
      LIMIT 40
    `);
    console.log(`\n=== [A2] same-day OTC-invoice + separate 75-invoice pairs (${paired.rowCount}) ===`);
    console.table(paired.rows);

    // A3. What clinic(s) carry a 75 consult rate (the leak source).
    const clinics = await client.query(`
      SELECT c.id, c.name, c.consultation_price, cm.service_name, cm.price cm_price
      FROM clinics c LEFT JOIN charge_master cm ON cm.id = c.charge_master_id
      WHERE c.consultation_price = 75 OR cm.price = 75
    `).catch((e) => { console.log('(clinics query skipped:', e.message, ')'); return { rows: [] as any[] }; });
    console.log(`\n=== [A3] clinics/charges with a 75 rate ===`);
    console.table(clinics.rows);

    // ============ (B) LABS BILLED AT 0 ============

    // B1. Recent lab line items billed at 0.
    const zeroLabs = await client.query(`
      SELECT ii.description, ii.total_price, inv.invoice_number, inv.created_at
      FROM invoice_items ii JOIN invoices inv ON inv.id = ii.invoice_id
      WHERE ii.description ILIKE 'Lab:%' AND ii.total_price = 0
      ORDER BY inv.created_at DESC LIMIT 40
    `);
    console.log(`\n=== [B1] lab line items billed GHS 0 (${zeroLabs.rowCount}) ===`);
    console.table(zeroLabs.rows);

    // B2. Catalog tests with missing/zero price (root cause of the 0s).
    const catalog = await client.query(`
      SELECT id, test_name, test_code, price
      FROM lab_test_catalog
      WHERE price IS NULL OR price = 0
      ORDER BY test_name LIMIT 60
    `).catch((e) => { console.log('(lab_test_catalog query skipped:', e.message, ')'); return { rows: [] as any[] }; });
    console.log(`\n=== [B2] lab_test_catalog entries with NULL/0 price (${catalog.rows.length}) ===`);
    console.table(catalog.rows);

    console.log('\nDiagnostic complete — no changes made.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
