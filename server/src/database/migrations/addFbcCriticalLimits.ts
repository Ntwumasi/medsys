/**
 * Migration: critical (panic) limits for the Full Blood Count.
 *
 * Until now only potassium, sodium, creatinine, glucose and calcium had
 * critical limits, so a dangerously low haemoglobin or platelet count never
 * raised an alert. These limits apply to every FBC variant (adult M/F, child
 * 6-12, child under 6). Backtest on 240 FBCs since May 2026: 1 would have
 * alerted. Same values as FBC_CRITICAL_LIMITS in seeds/labTestTemplates.ts.
 */

import pool from '../db';
import { FBC_CRITICAL_LIMITS } from '../seeds/labTestTemplates';

export const runMigration = async (): Promise<void> => {
  try {
    for (const [code, [low, high]] of Object.entries(FBC_CRITICAL_LIMITS)) {
      const r = await pool.query(
        `UPDATE lab_test_parameters p
            SET critical_low = $2, critical_high = $3
           FROM lab_test_catalog t
          WHERE t.id = p.lab_test_id
            AND t.test_code IN ('FBC_AF', 'FBC_AM', 'FBC_C6', 'FBC_CU')
            AND p.parameter_code = $1`,
        [code, low, high]
      );
      console.log(`${code}: critical ${low ?? '-'} / ${high ?? '-'} on ${r.rowCount} FBC template row(s)`);
    }
  } catch (e) {
    console.error('addFbcCriticalLimits migration failed:', e);
    throw e;
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
