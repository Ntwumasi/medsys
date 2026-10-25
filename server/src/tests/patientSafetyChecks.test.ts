import { describe, it, expect } from 'vitest';
import { findCriticalValues, readNumericValue } from '../services/criticalResultService';
import { medicationMatches, findPairInteractions } from '../services/drugInteractionService';

describe('critical lab values', () => {
  const potassium = { parameter_code: 'K', parameter_name: 'Potassium', unit: 'mmol/L', value_type: 'numeric', critical_low: '2.5', critical_high: '6.5' };
  const sodium = { parameter_code: 'NA', parameter_name: 'Sodium', unit: 'mmol/L', value_type: 'numeric', critical_low: '120', critical_high: '160' };
  const hb = { parameter_code: 'HGB', parameter_name: 'Haemoglobin', unit: 'g/dL', value_type: 'numeric', critical_low: null, critical_high: null };

  it('reads values written with units or comparators', () => {
    expect(readNumericValue('7.1')).toBe(7.1);
    expect(readNumericValue('7.1 mmol/L')).toBe(7.1);
    expect(readNumericValue('>500')).toBe(500);
    expect(readNumericValue('<= 2')).toBe(2);
    expect(readNumericValue('Haemolysed')).toBeNull();
  });

  it('flags values at or beyond the critical limits, and nothing else', () => {
    const hits = findCriticalValues({ K: '7.1 mmol/L', NA: '138', HGB: '4.0' }, [potassium, sodium, hb]);
    expect(hits).toEqual([{ alertType: 'critical_high', label: 'Potassium: 7.1 mmol/L' }]);
    expect(findCriticalValues({ NA: '<120' }, [sodium])).toEqual([{ alertType: 'critical_low', label: 'Sodium: <120 mmol/L' }]);
    expect(findCriticalValues({ K: '5.6' }, [potassium])).toEqual([]);
  });
});

describe('drug interaction matching', () => {
  it('matches a full prescription line to the short table name', () => {
    expect(medicationMatches('Warfarin 5mg tab', 'Warfarin')).toBe(true);
    expect(medicationMatches('Paracetamol 500mg', 'Warfarin')).toBe(false);
  });

  it('matches drug classes to their members', () => {
    expect(medicationMatches('Ibuprofen 400mg', 'NSAIDs')).toBe(true);
    expect(medicationMatches('Lisinopril 10mg', 'ACE Inhibitors')).toBe(true);
    expect(medicationMatches('Losartan 50mg', 'ARBs')).toBe(true);
  });

  it('finds an interaction whichever order the drugs come in', () => {
    const rows = [{ id: 1, drug1_name: 'Warfarin', drug2_name: 'Ibuprofen', severity: 'severe' as const, description: 'Bleeding', recommendation: 'Avoid' }];
    expect(findPairInteractions('IBUPROFEN 400MG TABS', 'warfarin 5mg', rows)).toHaveLength(1);
    expect(findPairInteractions('warfarin 5mg', 'Ibuprofen 400mg', rows)).toHaveLength(1);
    expect(findPairInteractions('warfarin 5mg', 'Paracetamol', rows)).toHaveLength(0);
  });
});
