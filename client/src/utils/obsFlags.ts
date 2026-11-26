/**
 * Flags an observation outside the usual adult range so it stands out on the
 * Short Stay rounds list and stay chart. A prompt to look, not a diagnosis.
 */
export interface ObsValues {
  temperature?: string | number | null;
  temperature_unit?: string | null;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  heart_rate?: number | null;
  respiratory_rate?: number | null;
  oxygen_saturation?: number | null;
}

export type ObsKey = 'temperature' | 'bp' | 'heart_rate' | 'respiratory_rate' | 'oxygen_saturation';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function obsFlags(o: ObsValues | null | undefined): Set<ObsKey> {
  const out = new Set<ObsKey>();
  if (!o) return out;
  let t = num(o.temperature);
  if (t !== null && (o.temperature_unit || '').toUpperCase().startsWith('F')) t = ((t - 32) * 5) / 9;
  if (t !== null && (t >= 37.6 || t < 35.5)) out.add('temperature');
  const sys = num(o.blood_pressure_systolic);
  const dia = num(o.blood_pressure_diastolic);
  if ((sys !== null && (sys >= 160 || sys < 90)) || (dia !== null && (dia >= 100 || dia < 50))) out.add('bp');
  const hr = num(o.heart_rate);
  if (hr !== null && (hr > 100 || hr < 50)) out.add('heart_rate');
  const rr = num(o.respiratory_rate);
  if (rr !== null && (rr > 24 || rr < 10)) out.add('respiratory_rate');
  const sp = num(o.oxygen_saturation);
  if (sp !== null && sp < 94) out.add('oxygen_saturation');
  return out;
}
