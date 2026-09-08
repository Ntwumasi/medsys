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

/** The 400 body every blocked path returns, so the UI can react consistently. */
export const diagnosisRequiredResponse = {
  error:
    'A diagnosis is required before this visit can be closed. Add one in the Diagnoses section, then try again.',
  code: 'DIAGNOSIS_REQUIRED' as const,
};
