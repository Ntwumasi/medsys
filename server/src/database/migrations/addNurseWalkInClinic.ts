import pool from '../db';

/**
 * Add the "Nurse (Procedures/Walk-in)" clinic so reception can check a patient
 * straight into the nurse station for a procedure/OTC nurse visit — mirroring
 * the existing Lab / Imaging / Pharmacy walk-in clinics.
 *
 * The routing (departmentWalkIns) and billing-skip (departmentClinics) code
 * already handle this clinic; only the clinics-table row was missing, so it
 * never appeared in the check-in dropdown.
 */
export async function addNurseWalkInClinic() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO clinics (name, description, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (name) DO NOTHING`,
      ['Nurse (Procedures/Walk-in)', 'Walk-in nurse procedures (wound dressing, injections, OTC) — billed per procedure.']
    );
    console.log(
      res.rowCount
        ? 'Added "Nurse (Procedures/Walk-in)" clinic.'
        : '"Nurse (Procedures/Walk-in)" clinic already present — nothing to do.'
    );
  } catch (error) {
    console.error('addNurseWalkInClinic migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addNurseWalkInClinic()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
