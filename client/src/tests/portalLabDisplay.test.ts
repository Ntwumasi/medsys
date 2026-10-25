import { describe, it, expect } from 'vitest';
import { parseLabResult, labFlag, rangeText } from '../components/portal/labDisplay';
import type { PortalLabParameter } from '../api/patientPortal';

const hb: PortalLabParameter = {
  parameter_code: 'HGB', parameter_name: 'Hemoglobin', unit: 'g/dL',
  normal_low: '12', normal_high: '16', critical_low: '7', critical_high: '20',
  reference_range_text: null, value_type: 'numeric',
};

describe('patient lab flags', () => {
  it('flags low, high, critical and normal from the template ranges', () => {
    expect(labFlag('13.5', hb)).toBe('normal');
    expect(labFlag('10.1', hb)).toBe('low');
    expect(labFlag('17', hb)).toBe('high');
    expect(labFlag('6.5', hb)).toBe('critical');
  });

  it('reads values written with a comparator or a unit', () => {
    expect(labFlag('<6', hb)).toBe('critical');
    expect(labFlag('13 g/dL', hb)).toBe('normal');
  });

  it('gives no flag without a numeric range', () => {
    expect(labFlag('Negative', { ...hb, value_type: 'qualitative' })).toBe('none');
    expect(labFlag('5', undefined)).toBe('none');
    expect(labFlag('5', { ...hb, normal_low: null, normal_high: null, critical_low: null, critical_high: null })).toBe('none');
  });

  it('describes the normal range for the patient', () => {
    expect(rangeText(hb)).toBe('12 – 16 g/dL');
    expect(rangeText({ ...hb, reference_range_text: 'Negative' })).toBe('Negative');
  });

  it('parses structured results, dropping blanks and keeping notes', () => {
    const parsed = parseLabResult('{"HGB":"13.5","WBC":"","__notes":"Repeat in 3 months"}');
    expect(parsed).toEqual({
      kind: 'structured',
      values: [{ code: 'HGB', label: 'HGB', value: '13.5' }],
      notes: 'Repeat in 3 months',
    });
    expect(parseLabResult('Malaria parasites not seen')).toEqual({ kind: 'text', text: 'Malaria parasites not seen' });
  });
});
