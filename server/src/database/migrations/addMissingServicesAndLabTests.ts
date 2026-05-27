import pool from '../db';

/**
 * Migration: Add Missing Services & Lab Tests (May 2026)
 *
 * 1. Adds missing charge_master entries (consultations, procedures)
 * 2. Adds 66 missing lab tests to lab_test_catalog with proper categories,
 *    specimen types, turnaround times, and base prices from LAB-UPDATED
 *    PRICE LIST 2026.docx (MDS-Lancet)
 *
 * Idempotent: uses ON CONFLICT for both tables.
 */

// ──────────────────────────────────────────────
// 1. MISSING CHARGE_MASTER ENTRIES
// ──────────────────────────────────────────────
const MISSING_SERVICES: Array<{
  name: string;
  code: string;
  category: string;
  price: number;
  description: string;
}> = [
  { name: 'TELEPHONE REVIEW', code: 'CONS-TELREV', category: 'consultation', price: 0, description: 'Telephone review - no charge' },
  { name: 'TELEPHONE CONSULT (GENERAL PRACTITIONER)', code: 'CONS-TEL-GP', category: 'consultation', price: 200, description: 'GP telephone consultation' },
  { name: 'PSYCHOTHERAPY', code: 'SPEC-PSYCHO', category: 'consultation', price: 600, description: 'Psychotherapy session' },
  { name: 'PSYCHOLOGY CLINIC', code: 'SPEC-PSYCH', category: 'consultation', price: 600, description: 'Psychology clinic consultation' },
  { name: 'SECOND SESSION - IN PERSON', code: 'PSYCH-SESS2-IP', category: 'consultation', price: 450, description: 'Psychology/psychotherapy second session - in person' },
  { name: 'SECOND SESSION - ONLINE', code: 'PSYCH-SESS2-OL', category: 'consultation', price: 350, description: 'Psychology/psychotherapy second session - online' },
  { name: 'SUBSEQUENT HOME VISITS', code: 'CONS-HOME-FU', category: 'consultation', price: 500, description: 'Follow-up home visit consultation' },
  { name: 'MANUAL VACUUM EVACUATION', code: 'PROC-MVE', category: 'procedure', price: 1200, description: 'Manual vacuum evacuation procedure' },
  { name: 'REMOVAL OF LUMPS AND BUMPS', code: 'PROC-LUMP', category: 'procedure', price: 500, description: 'Minor surgical removal of lumps and bumps' },
  { name: 'INCISION AND DRAINAGE', code: 'PROC-IND', category: 'procedure', price: 400, description: 'Incision and drainage procedure' },
  { name: 'STITCH REMOVAL', code: 'PROC-STREM', category: 'procedure', price: 100, description: 'Stitch/suture removal' },
  { name: 'CONSUMABLES FOR NEBULISATION', code: 'PROC-NEB-CONS', category: 'procedure', price: 100, description: 'Consumables for nebulisation' },
];

// ──────────────────────────────────────────────
// 2. MISSING LAB_TEST_CATALOG ENTRIES
// ──────────────────────────────────────────────
interface LabTest {
  code: string;
  name: string;
  category: string;
  specimen: string;
  price: number;
  tat: number; // turnaround_time_hours
}

const LAB_TESTS: LabTest[] = [
  // FERTILITY & HORMONES
  { code: 'TFT', name: 'Thyroid Function Test (TSH, T3, T4)', category: 'Chemistry', specimen: 'serum', price: 310, tat: 4 },
  { code: 'FT3', name: 'Free T3', category: 'Chemistry', specimen: 'serum', price: 150, tat: 4 },
  { code: 'FT4', name: 'Free T4', category: 'Chemistry', specimen: 'serum', price: 150, tat: 4 },
  { code: 'UPT', name: 'Urine Pregnancy Test', category: 'Chemistry', specimen: 'urine', price: 80, tat: 2 },
  { code: 'BHCG', name: 'Total \u00dfhCG (Blood)', category: 'Chemistry', specimen: 'serum', price: 230, tat: 4 },
  { code: 'E2', name: 'Estradiol', category: 'Chemistry', specimen: 'serum', price: 160, tat: 4 },
  { code: 'PROG', name: 'Progesterone', category: 'Chemistry', specimen: 'serum', price: 160, tat: 4 },
  { code: 'PROL', name: 'Prolactin', category: 'Chemistry', specimen: 'serum', price: 155, tat: 4 },
  { code: 'AMH', name: 'Anti-Mullerian Hormone', category: 'Chemistry', specimen: 'serum', price: 600, tat: 4 },
  { code: 'SHBG', name: 'Sex Hormone Binding Globulin', category: 'Chemistry', specimen: 'serum', price: 350, tat: 4 },
  { code: 'FREE-TESTO', name: 'Free Testosterone', category: 'Chemistry', specimen: 'serum', price: 500, tat: 4 },
  { code: 'CORTISOL', name: 'Cortisol (Blood)', category: 'Chemistry', specimen: 'serum', price: 290, tat: 4 },
  { code: 'TESTO', name: 'Testosterone (Total)', category: 'Chemistry', specimen: 'serum', price: 220, tat: 4 },

  // SEPSIS
  { code: 'PCT', name: 'Procalcitonin Quantitative', category: 'Chemistry', specimen: 'serum', price: 650, tat: 4 },

  // TUMOUR MARKERS
  { code: 'AFP', name: 'Alpha-Fetoprotein', category: 'Tumour Markers', specimen: 'serum', price: 230, tat: 4 },
  { code: 'TPSA', name: 'Total PSA', category: 'Tumour Markers', specimen: 'serum', price: 200, tat: 4 },
  { code: 'FPSA', name: 'Free PSA Ratio', category: 'Tumour Markers', specimen: 'serum', price: 400, tat: 4 },
  { code: 'CA153', name: 'CA 15.3 (Breast Cancer)', category: 'Tumour Markers', specimen: 'serum', price: 320, tat: 4 },
  { code: 'CEA', name: 'CEA (Carcinoembryonic Antigen)', category: 'Tumour Markers', specimen: 'serum', price: 280, tat: 4 },
  { code: 'CA125', name: 'CA 125 (Ovarian Cancer)', category: 'Tumour Markers', specimen: 'serum', price: 320, tat: 4 },
  { code: 'CA199', name: 'CA 19.9 (GI Tumour)', category: 'Tumour Markers', specimen: 'serum', price: 300, tat: 4 },
  { code: 'CA724', name: 'CA 72-4', category: 'Tumour Markers', specimen: 'serum', price: 400, tat: 4 },

  // PANCREATIC
  { code: 'AMY', name: 'Amylase', category: 'Chemistry', specimen: 'serum', price: 110, tat: 4 },
  { code: 'LIP', name: 'Lipase', category: 'Chemistry', specimen: 'serum', price: 190, tat: 4 },
  { code: 'INS-F', name: 'Insulin Fasting', category: 'Chemistry', specimen: 'serum', price: 350, tat: 4 },
  { code: 'INS-R', name: 'Insulin Random', category: 'Chemistry', specimen: 'serum', price: 350, tat: 4 },
  { code: 'CPEP-F', name: 'C-Peptide (Fasting)', category: 'Chemistry', specimen: 'serum', price: 350, tat: 4 },
  { code: 'CPEP-R', name: 'C-Peptide (Random)', category: 'Chemistry', specimen: 'serum', price: 350, tat: 4 },

  // LIVER (individual components)
  { code: 'TBILI', name: 'Total Bilirubin', category: 'Chemistry', specimen: 'serum', price: 40, tat: 4 },
  { code: 'DBILI', name: 'Direct Bilirubin', category: 'Chemistry', specimen: 'serum', price: 40, tat: 4 },
  { code: 'TP', name: 'Total Protein', category: 'Chemistry', specimen: 'serum', price: 40, tat: 4 },
  { code: 'ALB', name: 'Albumin', category: 'Chemistry', specimen: 'serum', price: 70, tat: 4 },
  { code: 'AST', name: 'AST (SGOT)', category: 'Chemistry', specimen: 'serum', price: 50, tat: 4 },
  { code: 'ALT', name: 'ALT (SGPT)', category: 'Chemistry', specimen: 'serum', price: 50, tat: 4 },
  { code: 'ALP', name: 'Alkaline Phosphatase', category: 'Chemistry', specimen: 'serum', price: 50, tat: 4 },
  { code: 'GGT', name: 'Gamma GT', category: 'Chemistry', specimen: 'serum', price: 50, tat: 4 },

  // RENAL / BONE (individual components)
  { code: 'BUE', name: 'BUE & Creatinine', category: 'Chemistry', specimen: 'serum', price: 180, tat: 4 },
  { code: 'NA', name: 'Sodium', category: 'Chemistry', specimen: 'serum', price: 40, tat: 4 },
  { code: 'K', name: 'Potassium', category: 'Chemistry', specimen: 'serum', price: 40, tat: 4 },
  { code: 'CL', name: 'Chloride', category: 'Chemistry', specimen: 'serum', price: 40, tat: 4 },
  { code: 'CO2', name: 'Bicarbonate', category: 'Chemistry', specimen: 'serum', price: 40, tat: 4 },
  { code: 'MALB', name: 'Microalbumin/Creatinine Ratio', category: 'Chemistry', specimen: 'urine', price: 180, tat: 4 },
  { code: 'CA', name: 'Calcium (Corrected)', category: 'Chemistry', specimen: 'serum', price: 100, tat: 4 },
  { code: 'ICA', name: 'Ionized Calcium', category: 'Chemistry', specimen: 'serum', price: 110, tat: 4 },
  { code: 'MG', name: 'Magnesium', category: 'Chemistry', specimen: 'serum', price: 95, tat: 4 },
  { code: 'PHOS', name: 'Phosphate', category: 'Chemistry', specimen: 'serum', price: 95, tat: 4 },
  { code: 'U24P', name: '24 Hour Urine Protein', category: 'Chemistry', specimen: 'urine', price: 150, tat: 4 },
  { code: 'CRCL', name: 'Creatinine Clearance', category: 'Chemistry', specimen: 'urine', price: 160, tat: 4 },

  // LIPID (individual components)
  { code: 'CHOL', name: 'Total Cholesterol', category: 'Chemistry', specimen: 'serum', price: 75, tat: 4 },
  { code: 'HDL', name: 'HDL Cholesterol', category: 'Chemistry', specimen: 'serum', price: 75, tat: 4 },
  { code: 'LDL', name: 'LDL Cholesterol', category: 'Chemistry', specimen: 'serum', price: 75, tat: 4 },
  { code: 'TRIG', name: 'Triglycerides', category: 'Chemistry', specimen: 'serum', price: 75, tat: 4 },
  { code: 'G6PD', name: 'G6PD Quantitative', category: 'Haematology', specimen: 'blood', price: 200, tat: 4 },

  // DIABETES
  { code: '2HRPP', name: '2Hr Post Prandial Glucose', category: 'Chemistry', specimen: 'serum', price: 150, tat: 4 },
  { code: 'GTT', name: '75g 2Hr GTT', category: 'Chemistry', specimen: 'serum', price: 170, tat: 4 },

  // CARDIAC
  { code: 'TROPI', name: 'Troponin I', category: 'Chemistry', specimen: 'serum', price: 300, tat: 2 },
  { code: 'TROPT', name: 'hs-Troponin T', category: 'Chemistry', specimen: 'serum', price: 300, tat: 2 },
  { code: 'CARDIAC', name: 'Cardiac Profile', category: 'Chemistry', specimen: 'serum', price: 750, tat: 4 },
  { code: 'CKMB', name: 'CK-MB', category: 'Chemistry', specimen: 'serum', price: 220, tat: 4 },
  { code: 'CPK', name: 'CK-NAC (CPK)', category: 'Chemistry', specimen: 'serum', price: 80, tat: 4 },
  { code: 'LDH', name: 'LDH', category: 'Chemistry', specimen: 'serum', price: 90, tat: 4 },
  { code: 'PROBNP', name: 'proBNP (Brain Natriuretic Peptide)', category: 'Chemistry', specimen: 'serum', price: 500, tat: 4 },

  // ANAEMIA
  { code: 'FE', name: 'Iron', category: 'Chemistry', specimen: 'serum', price: 100, tat: 4 },
  { code: 'FER', name: 'Ferritin', category: 'Chemistry', specimen: 'serum', price: 200, tat: 4 },
  { code: 'TRANS', name: 'Transferrin', category: 'Chemistry', specimen: 'serum', price: 200, tat: 4 },
];

async function migrate(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ──────────────────────────────────────────
    // Part 1: charge_master missing services
    // ──────────────────────────────────────────
    console.log('=== Part 1: Adding missing charge_master entries ===');

    let cmInserted = 0;
    let cmSkipped = 0;

    for (const svc of MISSING_SERVICES) {
      const res = await client.query(
        `INSERT INTO charge_master (service_name, service_code, category, price, description, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (service_code) DO NOTHING`,
        [svc.name, svc.code, svc.category, svc.price, svc.description]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  + Inserted: ${svc.name} (${svc.code}) - GHS ${svc.price}`);
        cmInserted++;
      } else {
        console.log(`  ~ Skipped (already exists): ${svc.name} (${svc.code})`);
        cmSkipped++;
      }
    }

    console.log(`\nCharge master: ${cmInserted} inserted, ${cmSkipped} skipped`);

    // ──────────────────────────────────────────
    // Part 2: lab_test_catalog missing tests
    // ──────────────────────────────────────────
    console.log('\n=== Part 2: Adding missing lab_test_catalog entries ===');

    // Ensure unique constraint on test_code exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'lab_test_catalog_test_code_key'
        ) THEN
          ALTER TABLE lab_test_catalog
            ADD CONSTRAINT lab_test_catalog_test_code_key UNIQUE (test_code);
        END IF;
      END $$;
    `);
    console.log('  Ensured unique constraint on lab_test_catalog.test_code');

    let labInserted = 0;
    let labUpdated = 0;

    for (const test of LAB_TESTS) {
      const res = await client.query(
        `INSERT INTO lab_test_catalog (
           test_code, test_name, category, specimen_type,
           turnaround_time_hours, base_price, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (test_code) DO UPDATE SET
           base_price = EXCLUDED.base_price,
           test_name = EXCLUDED.test_name,
           category = EXCLUDED.category,
           specimen_type = EXCLUDED.specimen_type,
           turnaround_time_hours = EXCLUDED.turnaround_time_hours,
           updated_at = CURRENT_TIMESTAMP`,
        [test.code, test.name, test.category, test.specimen, test.tat, test.price]
      );
      // ON CONFLICT DO UPDATE always returns rowCount=1, so we check xmax to distinguish
      // insert (xmax=0) vs update (xmax>0). Simpler: just query if it existed before.
      // For logging purposes, we'll check if the row was freshly inserted or updated.
      const check = await client.query(
        `SELECT id FROM lab_test_catalog WHERE test_code = $1 AND created_at >= NOW() - INTERVAL '5 seconds'
         AND updated_at IS NULL OR updated_at = created_at`,
        [test.code]
      );
      if (check.rows.length > 0) {
        console.log(`  + Inserted: ${test.name} (${test.code}) - GHS ${test.price}`);
        labInserted++;
      } else {
        console.log(`  ~ Updated: ${test.name} (${test.code}) - GHS ${test.price}`);
        labUpdated++;
      }
    }

    console.log(`\nLab test catalog: ${labInserted} inserted, ${labUpdated} updated`);

    await client.query('COMMIT');

    // Summary
    const cmTotal = await client.query('SELECT COUNT(*) FROM charge_master WHERE is_active = true');
    const labTotal = await client.query('SELECT COUNT(*) FROM lab_test_catalog WHERE is_active = true');

    console.log('\n=== Migration Summary ===');
    console.log(`Charge master total active entries: ${cmTotal.rows[0].count}`);
    console.log(`Lab test catalog total active entries: ${labTotal.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('\nMigration completed successfully!');
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      pool.end().then(() => process.exit(1));
    });
}

export default migrate;
