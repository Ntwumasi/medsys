import pool from '../db';
import { labTestTemplates } from '../seeds/labTestTemplates';

/**
 * Path No (accession number) + structured lab result templates.
 *
 * Schema:
 *   - lab_orders.path_no              : VARCHAR(10) — DDMM### format (e.g. "2205001").
 *                                       Allocated atomically on order create from
 *                                       path_no_counters. Backfilled for existing
 *                                       rows from created_at + sequential id order.
 *   - path_no_counters                : tracks the daily sequence. Updated via
 *                                       INSERT ... ON CONFLICT DO UPDATE so two
 *                                       concurrent creates don't collide.
 *   - lab_test_parameters             : per-test parameter definitions extracted
 *                                       from the docx templates. When a test has
 *                                       rows here, the result entry modal renders
 *                                       a structured table instead of a single
 *                                       text field.
 *
 * Also seeds the catalog + parameter rows from labTestTemplates.
 */
export async function addLabPathNoAndTemplates() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // --- Path No on lab_orders ---
    await client.query(`
      ALTER TABLE lab_orders
        ADD COLUMN IF NOT EXISTS path_no VARCHAR(10)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_orders_path_no
        ON lab_orders(path_no)
        WHERE path_no IS NOT NULL
    `);

    // --- Daily sequence counter ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS path_no_counters (
        date_key CHAR(4) PRIMARY KEY,  -- DDMM
        next_seq INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Backfill path_no for existing orders. Deterministic: order by
    // created_at then id, allocate per-day sequence numbers. This way
    // re-running the migration produces the same result.
    await client.query(`
      WITH numbered AS (
        SELECT id,
               TO_CHAR(created_at, 'DDMM') AS date_key,
               ROW_NUMBER() OVER (
                 PARTITION BY TO_CHAR(created_at, 'DDMM')
                 ORDER BY created_at, id
               ) AS seq
          FROM lab_orders
         WHERE path_no IS NULL
      )
      UPDATE lab_orders lo
         SET path_no = numbered.date_key || LPAD(numbered.seq::text, 3, '0')
        FROM numbered
       WHERE lo.id = numbered.id
    `);

    // Seed the counter so future allocations don't collide with backfilled
    // rows. For each day that has backfilled rows, store next_seq = max + 1.
    await client.query(`
      INSERT INTO path_no_counters (date_key, next_seq)
      SELECT SUBSTRING(path_no, 1, 4) AS date_key,
             MAX(SUBSTRING(path_no, 5, 3)::int) + 1 AS next_seq
        FROM lab_orders
       WHERE path_no IS NOT NULL
       GROUP BY SUBSTRING(path_no, 1, 4)
      ON CONFLICT (date_key) DO UPDATE
        SET next_seq = GREATEST(path_no_counters.next_seq, EXCLUDED.next_seq)
    `);

    // --- Parameter definitions table ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_test_parameters (
        id SERIAL PRIMARY KEY,
        lab_test_id INTEGER REFERENCES lab_test_catalog(id) ON DELETE CASCADE,
        parameter_name VARCHAR(150) NOT NULL,
        parameter_code VARCHAR(50),
        value_type VARCHAR(20) NOT NULL DEFAULT 'numeric'
          CHECK (value_type IN ('numeric', 'qualitative', 'text')),
        unit VARCHAR(50),
        normal_low NUMERIC,
        normal_high NUMERIC,
        critical_low NUMERIC,
        critical_high NUMERIC,
        reference_range_text VARCHAR(200),
        qualitative_options TEXT,
        default_qualitative_value VARCHAR(50),
        age_group VARCHAR(20),
        sex VARCHAR(10),
        section_label VARCHAR(100),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_test_parameters_test
        ON lab_test_parameters(lab_test_id, sort_order)
    `);

    // --- Seed catalog + parameters from labTestTemplates ---
    for (const template of labTestTemplates) {
      // Upsert into lab_test_catalog
      const catalogResult = await client.query(
        `INSERT INTO lab_test_catalog
            (test_name, test_code, category, specimen_type, is_active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (test_code) DO UPDATE
            SET test_name = EXCLUDED.test_name,
                category = EXCLUDED.category,
                specimen_type = EXCLUDED.specimen_type,
                is_active = true
          RETURNING id`,
        [
          template.test_name,
          template.test_code || template.test_name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 50),
          template.category,
          template.specimen_type,
        ],
      );
      const testId = catalogResult.rows[0].id;

      // Replace parameter rows for this test (idempotent re-run)
      await client.query(`DELETE FROM lab_test_parameters WHERE lab_test_id = $1`, [testId]);

      for (const p of template.parameters) {
        await client.query(
          `INSERT INTO lab_test_parameters
             (lab_test_id, parameter_name, parameter_code, value_type, unit,
              normal_low, normal_high, critical_low, critical_high,
              reference_range_text, qualitative_options, default_qualitative_value,
              age_group, sex, section_label, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            testId,
            p.parameter_name,
            p.parameter_code || null,
            p.value_type,
            p.unit || null,
            p.normal_low ?? null,
            p.normal_high ?? null,
            p.critical_low ?? null,
            p.critical_high ?? null,
            p.reference_range_text || null,
            p.qualitative_options || null,
            p.default_qualitative_value || null,
            p.age_group || null,
            p.sex || null,
            p.section_label || null,
            p.sort_order,
          ],
        );
      }
    }

    await client.query('COMMIT');
    console.log(
      `Lab Path No + templates migration completed. Seeded ${labTestTemplates.length} tests.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lab Path No + templates migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addLabPathNoAndTemplates()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
