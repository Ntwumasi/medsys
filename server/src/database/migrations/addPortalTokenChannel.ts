import pool from '../db';

/**
 * Patient portal links: remember which channel a link went out on.
 *
 * 22% of patients share a phone number with another patient (families).
 * A link texted to a shared phone may be signed into as ANY patient on that
 * number whose date of birth is entered — so it only applies to links that
 * actually went by SMS. Older rows stay NULL and keep the strict
 * one-patient behaviour. Idempotent.
 */
export async function addPortalTokenChannel() {
  await pool.query(`ALTER TABLE patient_portal_access_tokens ADD COLUMN IF NOT EXISTS channel VARCHAR(10)`);
  console.log('addPortalTokenChannel completed.');
}

if (require.main === module) {
  addPortalTokenChannel()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
