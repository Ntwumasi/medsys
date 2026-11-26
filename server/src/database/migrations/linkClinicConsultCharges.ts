import pool from '../db';

/**
 * Link clinics that had no consultation charge. Check-in fell back to a GP
 * consult (GHS 200) for them, so a General Surgery visit was billed as GP.
 *
 *  - GENERAL SURGERY / General Surgeon  -> SPEC-SURG  "General Surgeon"
 *  - Neurosurgery                       -> SPEC-NEURO "Neurosurgery"
 *  - Physiotherapy                      -> SPEC-PHYSIO "Physiotherapy"
 *  - Psychology                         -> SPEC-PSYCHOL "Psychology Clinic / Psychotherapy"
 *  - Health and Wellness                -> CONS-GP (what it has been billed all along;
 *                                          kept until the clinic confirms its price)
 *
 * Neurosurgery, Physiotherapy and Psychology already billed these charges via a
 * name search; linking them makes it exact. Only fills EMPTY links (an admin's
 * own choice is never overwritten). Additive and idempotent.
 */
const LINKS: Array<[clinic: string, serviceCode: string]> = [
  ['GENERAL SURGERY', 'SPEC-SURG'],
  ['General Surgeon', 'SPEC-SURG'],
  ['Neurosurgery', 'SPEC-NEURO'],
  ['Physiotherapy', 'SPEC-PHYSIO'],
  ['Psychology', 'SPEC-PSYCHOL'],
  ['Health and Wellness', 'CONS-GP'],
];

export async function linkClinicConsultCharges() {
  for (const [clinic, code] of LINKS) {
    const r = await pool.query(
      `UPDATE clinics c
          SET charge_master_id = cm.id, updated_at = CURRENT_TIMESTAMP
         FROM charge_master cm
        WHERE c.name = $1 AND c.charge_master_id IS NULL
          AND cm.service_code = $2 AND cm.is_active = true`,
      [clinic, code]
    );
    console.log(`  ${clinic} -> ${code}: ${r.rowCount ? 'linked' : 'unchanged'}`);
  }
  console.log('linkClinicConsultCharges migration complete.');
}

if (require.main === module) {
  linkClinicConsultCharges()
    .then(() => process.exit(0))
    .catch((e) => { console.error('linkClinicConsultCharges failed:', e); process.exit(1); });
}
