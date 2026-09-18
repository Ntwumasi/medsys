import pool from '../database/db';

/**
 * Diagnosis requirement for closing a clinical encounter.
 *
 * Dr. Sedo: insurers reject claims with no diagnosis, and 79% of encounters had
 * none. A first pass (2026-08-23) blocked doctor sign-off for insurer- and
 * corporate-billed patients only. Measured two weeks later, compliance in that
 * blocked group was still 39% — because sign-off is not the only way out of an
 * encounter. `PUT /encounters/:id` sets any status directly and never checked.
 *
 * So the rule is now: no encounter reaches a closed or handed-off state without
 * a diagnosis, for EVERY patient, whichever endpoint is used.
 */

/** Statuses that mean the doctor is finished with the patient. */
export const CLOSING_STATUSES = ['completed', 'discharged', 'with_nurse'] as const;

/**
 * A cancelled visit is exempt. A no-show or abandoned encounter has nothing to
 * diagnose, and forcing a made-up diagnosis to cancel would be worse than the
 * gap it closes.
 */
export const isClosingStatus = (status: unknown): boolean =>
  typeof status === 'string' && (CLOSING_STATUSES as readonly string[]).includes(status);

/**
 * Department walk-ins — buying an OTC medicine, a walk-in lab test, a nurse
 * dressing — never see a doctor and have nothing to diagnose. Measured on
 * production two weeks after the hard stop shipped: of 43 encounters closed
 * without a diagnosis, 28 were exactly these, and 27 never had a doctor
 * assigned at all. Requiring a diagnosis there would stop the pharmacy selling
 * paracetamol.
 */
const DEPARTMENT_CLINICS = [
  'Pharmacy (OTC/Walk-in)',
  'Lab (Walk-in)',
  'Imaging (Walk-in)',
  'Nurse (Procedures/Walk-in)',
];

/**
 * Does this encounter actually require a diagnosis before it can be closed?
 *
 * False for department walk-ins and for encounters no doctor was ever assigned
 * to — in both cases there is no clinician to have formed one.
 */
export const encounterNeedsDiagnosis = async (encounterId: number | string): Promise<boolean> => {
  const result = await pool.query(
    `SELECT clinic, is_otc, provider_id FROM encounters WHERE id = $1`,
    [encounterId]
  );
  const e = result.rows[0];
  if (!e) return false;
  if (e.is_otc) return false;
  if (e.clinic && DEPARTMENT_CLINICS.includes(e.clinic)) return false;
  if (!e.provider_id) return false;
  return true;
};

export const encounterHasDiagnosis = async (encounterId: number | string): Promise<boolean> => {
  const result = await pool.query(
    `SELECT 1 FROM diagnoses
      WHERE encounter_id = $1
        AND COALESCE(TRIM(diagnosis_description), '') <> ''
      LIMIT 1`,
    [encounterId]
  );
  return result.rows.length > 0;
};

/**
 * One call for every exit: does closing this encounter need to be blocked?
 * Use this rather than calling the two helpers separately, so a new exit can't
 * pick up one check and miss the other.
 */
export const shouldBlockForDiagnosis = async (encounterId: number | string): Promise<boolean> => {
  if (!(await encounterNeedsDiagnosis(encounterId))) return false;
  return !(await encounterHasDiagnosis(encounterId));
};

/** The 400 body every blocked path returns, so the UI can react consistently. */
export const diagnosisRequiredResponse = {
  error:
    'A diagnosis is required before this visit can be closed. Add one in the Diagnoses section, then try again.',
  code: 'DIAGNOSIS_REQUIRED' as const,
};
