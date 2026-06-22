/**
 * Migration: CareCode origin marker on the surviving record
 *
 * When a CareCode-imported record (CC- prefix) is merged into a native MedSys
 * record, we keep the native `P` patient_number as the survivor. That archives
 * the CC- record — and with it the `source = 'carecode'` flag that drove the
 * "Imported from CareCode" banner. To preserve the provenance, the merge stamps
 * the surviving record's `carecode_origin_number` with the original CC- number
 * so the patient card can still show it was migrated from CareCode.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  await pool.query(
    `ALTER TABLE patients ADD COLUMN IF NOT EXISTS carecode_origin_number VARCHAR(50)`
  );
  console.log('CareCode origin marker migration complete.');
};

if (require.main === module) {
  runMigration()
    .then(() => { console.log('done'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
