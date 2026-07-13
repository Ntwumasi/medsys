import pool from '../db';

/**
 * READ-ONLY diagnostic — finds what the persisting "OTC GHS 75" charge actually
 * is and whether it sits on OTC-tagged encounters. Makes NO changes. Delete
 * after running.
 */
async function run() {
  const client = await pool.connect();
  try {
    // 1. Every invoice_item priced at 75, with full context.
    const items = await client.query(`
      SELECT ii.id AS item_id, ii.description, ii.category,
             ii.unit_price, ii.total_price, ii.quantity,
             inv.invoice_number, inv.status AS invoice_status,
             COALESCE(inv.amount_paid, 0) AS amount_paid,
             inv.created_at AS invoice_date,
             e.id AS encounter_id, e.clinic, e.chief_complaint,
             e.is_otc, e.encounter_type
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id
        LEFT JOIN encounters e ON e.id = inv.encounter_id
       WHERE ii.unit_price = 75 OR ii.total_price = 75
       ORDER BY inv.created_at DESC NULLS LAST
       LIMIT 60
    `);
    console.log(`\n=== [1] invoice_items priced 75 (showing ${items.rowCount}) ===`);
    console.table(items.rows.map(r => ({
      item: r.item_id, desc: r.description, cat: r.category,
      total: r.total_price, inv: r.invoice_number, inv_status: r.invoice_status,
      paid: r.amount_paid, enc: r.encounter_id, clinic: r.clinic,
      chief: r.chief_complaint, is_otc: r.is_otc, type: r.encounter_type,
    })));

    // 1b. Breakdown of those 75 lines by category + description + whether OTC.
    const byCat = await client.query(`
      SELECT ii.category, ii.description,
             (e.is_otc = true
               OR e.clinic = 'Pharmacy (OTC/Walk-in)'
               OR LOWER(TRIM(COALESCE(e.chief_complaint,''))) = 'otc purchase') AS looks_otc,
             COUNT(*) AS n
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id
        LEFT JOIN encounters e ON e.id = inv.encounter_id
       WHERE ii.unit_price = 75 OR ii.total_price = 75
       GROUP BY ii.category, ii.description, looks_otc
       ORDER BY n DESC
    `);
    console.log(`\n=== [1b] 75-lines grouped by category / description / looks_otc ===`);
    console.table(byCat.rows);

    // 2. Any charge_master service seeded at 75.
    const cm = await client.query(
      `SELECT id, service_name, service_code, category, price, is_active
         FROM charge_master WHERE price = 75`
    );
    console.log(`\n=== [2] charge_master rows priced 75 ===`);
    console.table(cm.rows);

    // 2b. Clinics whose consultation price is 75 (the suspected source).
    const clinics = await client.query(`
      SELECT c.id, c.name, c.consultation_price, cm.service_name, cm.price AS cm_price
        FROM clinics c
        LEFT JOIN charge_master cm ON cm.id = c.charge_master_id
       WHERE c.consultation_price = 75 OR cm.price = 75
    `).catch((e) => { console.log('(clinics query skipped:', e.message, ')'); return { rows: [] as any[] }; });
    console.log(`\n=== [2b] clinics with a 75 consultation rate ===`);
    console.table(clinics.rows);

    // 3. Recent OTC-context encounters and ALL their invoice line items — shows
    //    what a real OTC sale's invoice looks like right now.
    const recent = await client.query(`
      SELECT e.id AS encounter_id, e.clinic, e.chief_complaint, e.is_otc,
             e.created_at, inv.invoice_number, inv.status,
             ii.description, ii.category, ii.total_price
        FROM encounters e
        JOIN invoices inv ON inv.encounter_id = e.id
        JOIN invoice_items ii ON ii.invoice_id = inv.id
       WHERE e.is_otc = true
          OR e.clinic = 'Pharmacy (OTC/Walk-in)'
          OR LOWER(TRIM(COALESCE(e.chief_complaint,''))) = 'otc purchase'
       ORDER BY e.created_at DESC
       LIMIT 50
    `);
    console.log(`\n=== [3] recent OTC-context encounters' invoice lines (${recent.rowCount}) ===`);
    console.table(recent.rows.map(r => ({
      enc: r.encounter_id, clinic: r.clinic, chief: r.chief_complaint,
      is_otc: r.is_otc, inv: r.invoice_number, inv_status: r.status,
      desc: r.description, cat: r.category, total: r.total_price,
    })));

    console.log('\nDiagnostic complete — no changes made.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
