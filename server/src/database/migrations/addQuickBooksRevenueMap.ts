import pool from '../db';

/**
 * Route MedSys invoice lines to the clinic's QuickBooks revenue accounts.
 *
 * Today every line we push falls back to a single service item
 * ("Medical Services"), so all revenue lands in one income account and the
 * accountant's ~45-account tree receives nothing. Two reasons: invoice lines are
 * matched to QB items only via charge_master_id, and (a) 60% of line value has
 * no charge_master_id at all (labs bill from lab_test_catalog, pharmacy from
 * inventory) while (b) none of the charge_master rows reception actually bills
 * are mapped to a QB item.
 *
 * This table replaces that with a rule list evaluated in `rule_order`:
 * the first rule whose category and/or description pattern matches wins. Rules
 * live in the database rather than in code so the accountant can re-file a
 * service without a deploy.
 *
 * Granularity is deliberately a category rollup (~10 accounts), not a
 * per-specialty split — the consultation sub-accounts (Cardiology, ENT, …)
 * are left for a follow-up once she rules on the services that have no matching
 * sub-account. The description rules exist only where a flat category mapping
 * would be plainly wrong: 'service' is a junk drawer holding labs, drugs and
 * consultations; 'imaging' holds ECGs; 'procedure' holds short-stay/detention.
 */
export const addQuickBooksRevenueMap = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS quickbooks_revenue_map (
        id SERIAL PRIMARY KEY,
        rule_order INTEGER NOT NULL,
        match_category VARCHAR(50),
        match_pattern VARCHAR(200),
        qb_account_full_name VARCHAR(200) NOT NULL,
        qb_item_name VARCHAR(31) NOT NULL,
        qb_account_listid VARCHAR(50),
        qb_item_listid VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT rule_needs_a_test CHECK (match_category IS NOT NULL OR match_pattern IS NOT NULL)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_qb_revenue_map_order ON quickbooks_revenue_map (rule_order) WHERE is_active;`);

    const existing = await client.query('SELECT COUNT(*)::int AS n FROM quickbooks_revenue_map');
    if (existing.rows[0].n > 0) {
      console.log('[addQuickBooksRevenueMap] rules already present — leaving them alone.');
      await client.query('COMMIT');
      return;
    }

    // [rule_order, category, description pattern (ILIKE), QB account, QB item, note]
    // Ordering matters: narrower tests must precede the ones they'd otherwise be
    // swallowed by ("CONSUMABLES FOR SHORT STAY" before "SHORT STAY").
    const rules: Array<[number, string | null, string | null, string, string, string | null]> = [
      // --- Consumables (must precede detention/short-stay) ---
      [10, null, '%consumables for short stay%', 'Revenue:Consumables:Consumables for Detention', 'Consumables for Detention', null],
      [11, null, '%consumables for detention%', 'Revenue:Consumables:Consumables for Detention', 'Consumables for Detention', null],
      [12, null, '%consumables for injection%', 'Revenue:Consumables:Consumables for injection', 'Consumables for Injection', null],
      [13, null, '%consumable%', 'Revenue:Consumables', 'Consumables', null],

      // --- Detention / short stay ---
      [20, null, '%short stay%', 'Revenue:Detention', 'Detention', 'Short stay is billed as detention'],
      [21, null, '%detention%', 'Revenue:Detention', 'Detention', null],

      // --- Named procedures her tree separates out ---
      [30, null, '%echocardiogram%', 'Revenue:Scan/Procedure:Procedure - ECHO', 'Procedure - ECHO', null],
      [31, null, '%echo scan%', 'Revenue:Scan/Procedure:Procedure - ECHO', 'Procedure - ECHO', null],
      [32, null, '%ecg%', 'Revenue:Scan/Procedure:Procedure - ECG', 'Procedure - ECG', 'Covers "12 lead ecg", "ECG Recording"'],
      [33, null, '%electrocardiogram%', 'Revenue:Scan/Procedure:Procedure - ECG', 'Procedure - ECG', null],
      [34, null, '%nebulis%', 'Revenue:Scan/Procedure:Procedure - Nebulization', 'Procedure - Nebulization', null],
      [35, null, '%nebuliz%', 'Revenue:Scan/Procedure:Procedure - Nebulization', 'Procedure - Nebulization', null],
      [36, null, '%sutur%', 'Revenue:Scan/Procedure:Suturing procedure', 'Suturing Procedure', null],
      [37, null, '%stitch removal%', 'Revenue:Scan/Procedure:Suturing procedure', 'Suturing Procedure', null],
      [38, null, '%wound dressing%', 'Revenue:Scan/Procedure:Wound dressing', 'Wound Dressing', null],

      // --- Imaging split: ultrasound vs MRI vs the rest ---
      [40, null, '%ultrasound%', 'Revenue:Ultrasound Scans', 'Ultrasound Scans', null],
      [41, null, '%usg%', 'Revenue:Ultrasound Scans', 'Ultrasound Scans', 'Local shorthand for ultrasound'],
      [42, null, '%mri%', 'Revenue:Scan/Procedure:MRI Scans', 'MRI Scans', null],

      // --- Admin / reports / screening ---
      [50, null, '%preemployment%', 'Revenue:Screening tests:Preemployment Medicals', 'Preemployment Medicals', null],
      [51, null, '%pre-employment%', 'Revenue:Screening tests:Preemployment Medicals', 'Preemployment Medicals', null],
      [52, null, '%medical screening%', 'Revenue:Screening tests:Medical screening', 'Medical Screening', null],
      [53, null, '%screening%', 'Revenue:Screening tests', 'Screening Tests', null],
      [54, null, '%medical report%', 'Revenue:Medical report', 'Medical Report', null],
      [55, null, '%registration%', 'Revenue:Registration', 'Registration', null],

      // --- Lab tests sitting in the legacy 'service' junk drawer ---
      // Only applied to 'service'; the 'lab' category is caught by its own rule.
      [60, 'service', 'lab:%', 'Revenue:Lab.Service Fee', 'Lab Services', null],
      [61, 'service', '%hba1c%', 'Revenue:Lab.Service Fee', 'Lab Services', null],
      [62, 'service', '%bue%', 'Revenue:Lab.Service Fee', 'Lab Services', null],
      [63, 'service', '%urine r/e%', 'Revenue:Lab.Service Fee', 'Lab Services', null],
      [64, 'service', '%profile%', 'Revenue:Lab.Service Fee', 'Lab Services', 'Hepatitis B profile, lipid profile'],
      [65, 'service', '%lipids%', 'Revenue:Lab.Service Fee', 'Lab Services', null],

      // --- Category fallbacks ---
      [100, 'lab', null, 'Revenue:Lab.Service Fee', 'Lab Services', null],
      [101, 'medication', null, 'Revenue:Pharmacy', 'Pharmacy', null],
      [102, 'pharmacy', null, 'Revenue:Pharmacy', 'Pharmacy', null],
      [103, 'consultation', null, 'Revenue:Consultation', 'Consultation', 'Per-specialty split is a follow-up'],
      [104, 'registration', null, 'Revenue:Registration', 'Registration', null],
      [105, 'procedure', null, 'Revenue:Scan/Procedure:Various Procedures', 'Various Procedures', null],
      [106, 'imaging', null, 'Revenue:Scan/Procedure', 'Scan and Procedure', 'X-ray/CT — no dedicated account'],
      // 'service' has no blanket rule on purpose: whatever the rules above don't
      // classify keeps landing on the current default item, so it stays visible
      // as "unclassified" for the accountant to rule on rather than being
      // silently filed under a plausible-looking account.
    ];

    for (const [order, category, pattern, account, item, notes] of rules) {
      await client.query(
        `INSERT INTO quickbooks_revenue_map
           (rule_order, match_category, match_pattern, qb_account_full_name, qb_item_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order, category, pattern, account, item, notes]
      );
    }

    console.log(`[addQuickBooksRevenueMap] seeded ${rules.length} routing rules across ${new Set(rules.map(r => r[3])).size} revenue accounts.`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  addQuickBooksRevenueMap()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch((e) => { console.error('Migration failed:', e); process.exit(1); });
}

export default addQuickBooksRevenueMap;
