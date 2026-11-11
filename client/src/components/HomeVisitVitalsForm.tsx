import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { validateVitalSign } from '../utils/vitalSignsValidation';
import { getApiError } from '../utils/apiError';

/**
 * Vitals recorded by the doctor during a home visit (in the clinic the nurse
 * records them). Same ranges, same critical-value confirmation and the same
 * server endpoint as the nurse's form, so critical alerts work identically.
 */

interface Props {
  encounterId: number;
  patientName: string;
  onSaved: () => void;
}

type Field = 'temperature' | 'blood_pressure_systolic' | 'blood_pressure_diastolic' | 'heart_rate' | 'respiratory_rate' | 'oxygen_saturation' | 'weight' | 'height';

const FIELDS: { key: Field; label: string; unit: string; rule: string; step?: string }[] = [
  { key: 'temperature', label: 'Temp', unit: '°C', rule: 'temperature_C', step: '0.1' },
  { key: 'blood_pressure_systolic', label: 'BP systolic', unit: 'mmHg', rule: 'blood_pressure_systolic' },
  { key: 'blood_pressure_diastolic', label: 'BP diastolic', unit: 'mmHg', rule: 'blood_pressure_diastolic' },
  { key: 'heart_rate', label: 'Pulse', unit: 'bpm', rule: 'heart_rate' },
  { key: 'respiratory_rate', label: 'Resp. rate', unit: '/min', rule: 'respiratory_rate' },
  { key: 'oxygen_saturation', label: 'SpO₂', unit: '%', rule: 'oxygen_saturation' },
  { key: 'weight', label: 'Weight', unit: 'kg', rule: 'weight_kg', step: '0.1' },
  { key: 'height', label: 'Height', unit: 'cm', rule: 'height_cm' },
];

const empty = (): Record<Field, string> =>
  Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Record<Field, string>;

const HomeVisitVitalsForm: React.FC<Props> = ({ encounterId, patientName, onSaved }) => {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [values, setValues] = useState<Record<Field, string>>(empty);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);

  // A different patient's visit: never carry readings across.
  useEffect(() => {
    setValues(empty());
    setErrors({});
  }, [encounterId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Partial<Record<Field, string>> = {};
    const warnings: string[] = [];
    for (const f of FIELDS) {
      const v = values[f.key].trim();
      if (!v) continue;
      const r = validateVitalSign(Number(v), f.rule as Parameters<typeof validateVitalSign>[1]);
      if (!r.isValid) nextErrors[f.key] = r.message || `Check ${f.label}`;
      else if (r.isCritical) warnings.push(`${f.label}: ${r.message}`);
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (FIELDS.every((f) => !values[f.key].trim())) {
      showToast('Enter at least one reading', 'warning');
      return;
    }
    if (warnings.length > 0) {
      const ok = await confirm({
        title: 'Critical vital signs',
        message: `${warnings.join('\n')}\n\nSave these readings for ${patientName}?`,
        variant: 'danger',
        confirmLabel: 'Save',
      });
      if (!ok) return;
    }

    const vital_signs: Record<string, number | string> = { temperature_unit: 'C', weight_unit: 'kg', height_unit: 'cm' };
    for (const f of FIELDS) if (values[f.key].trim()) vital_signs[f.key] = Number(values[f.key]);

    setSaving(true);
    try {
      const res = await apiClient.post('/workflow/nurse/vitals', { encounter_id: encounterId, vital_signs });
      const critical: string[] = res.data.criticalValues || [];
      showToast(
        critical.length
          ? `Vitals saved for ${patientName}. Critical: ${critical.join(', ')}`
          : `Vitals saved for ${patientName}`,
        critical.length ? 'warning' : 'success'
      );
      setValues(empty());
      onSaved();
    } catch (err) {
      showToast(getApiError(err, `Vitals NOT saved for ${patientName}`), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-ds-surface rounded-ds-card border border-ds-border p-4" aria-labelledby="hv-vitals-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 id="hv-vitals-title" className="text-sm font-semibold text-ds-text">Record vitals — home visit</h3>
        <span className="text-xs text-ds-text-muted">{patientName}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`hv-${f.key}`} className="block text-xs font-medium text-ds-text-secondary mb-1">
              {f.label} <span className="text-ds-text-muted">({f.unit})</span>
            </label>
            <input
              id={`hv-${f.key}`}
              type="number"
              inputMode="decimal"
              step={f.step || '1'}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              aria-invalid={!!errors[f.key]}
              aria-describedby={errors[f.key] ? `hv-${f.key}-err` : undefined}
              className={`w-full min-h-ds-touch px-3 border rounded-lg bg-ds-surface text-ds-text tabular-nums focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent ${
                errors[f.key] ? 'border-ds-critical' : 'border-ds-border-control'
              }`}
            />
            {errors[f.key] && <p id={`hv-${f.key}-err`} className="text-xs text-ds-critical-text mt-1">{errors[f.key]}</p>}
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-3">
        <button
          type="submit"
          disabled={saving}
          className="min-h-ds-touch px-4 rounded-lg bg-ds-accent text-ds-on-accent text-sm font-medium hover:bg-ds-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save vitals'}
        </button>
      </div>
    </form>
  );
};

export default HomeVisitVitalsForm;
