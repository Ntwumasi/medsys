/**
 * What happens to vitals a nurse has typed but not yet saved when they switch
 * to a different patient. They must never carry over to the next patient (the
 * auto-save used to post them to whoever was selected 3 seconds later).
 *
 *  - 'save-to-previous': valid readings typed for patient A are saved to A.
 *  - 'discard': readings with validation errors are dropped (and the nurse told).
 *  - 'none': nothing typed, or the same patient re-selected.
 * In every case except 'none' the form is cleared before the next patient loads.
 */
export type VitalsHandoff = 'save-to-previous' | 'discard' | 'none';

const READING_FIELDS = [
  'temperature', 'heart_rate', 'blood_pressure_systolic', 'blood_pressure_diastolic',
  'respiratory_rate', 'oxygen_saturation', 'weight', 'height',
] as const;

export const hasVitalReadings = (vitals: Record<string, unknown>): boolean =>
  READING_FIELDS.some((f) => vitals[f] !== undefined && vitals[f] !== null && vitals[f] !== '');

export const decideVitalsHandoff = (args: {
  previousPatientId: number | null | undefined;
  nextPatientId: number;
  vitals: Record<string, unknown>;
  modified: boolean;
  errorCount: number;
}): VitalsHandoff => {
  const { previousPatientId, nextPatientId, vitals, modified, errorCount } = args;
  if (!previousPatientId || previousPatientId === nextPatientId) return 'none';
  if (!modified || !hasVitalReadings(vitals)) return 'none';
  return errorCount === 0 ? 'save-to-previous' : 'discard';
};
