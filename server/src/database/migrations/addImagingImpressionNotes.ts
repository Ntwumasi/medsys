import pool from '../db';

/**
 * The imaging results form asks for an Impression and Radiologist Notes, but
 * imaging_orders only had `findings`, so both were dropped on save while the
 * screen said "Results saved". Additive and idempotent.
 */
export async function addImagingImpressionNotes() {
  await pool.query(`ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS impression TEXT`);
  await pool.query(`ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS radiologist_notes TEXT`);
  console.log('addImagingImpressionNotes migration complete.');
}

if (require.main === module) {
  addImagingImpressionNotes()
    .then(() => process.exit(0))
    .catch((e) => { console.error('addImagingImpressionNotes failed:', e); process.exit(1); });
}
