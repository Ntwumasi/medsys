import { describe, it, expect } from 'vitest';
import { obsFlags } from '../utils/obsFlags';

describe('obsFlags', () => {
  it('flags nothing for normal obs', () => {
    expect(obsFlags({ temperature: '36.8', blood_pressure_systolic: 124, blood_pressure_diastolic: 78, heart_rate: 80, respiratory_rate: 16, oxygen_saturation: 98 }).size).toBe(0);
  });
  it('flags fever, high BP, fast pulse, fast breathing and low SpO2', () => {
    const f = obsFlags({ temperature: 38.4, blood_pressure_systolic: 182, blood_pressure_diastolic: 104, heart_rate: 118, respiratory_rate: 28, oxygen_saturation: 91 });
    expect([...f].sort()).toEqual(['bp', 'heart_rate', 'oxygen_saturation', 'respiratory_rate', 'temperature']);
  });
  it('reads Fahrenheit temperatures', () => {
    expect(obsFlags({ temperature: 98.6, temperature_unit: 'F' }).has('temperature')).toBe(false);
    expect(obsFlags({ temperature: 101.5, temperature_unit: 'F' }).has('temperature')).toBe(true);
  });
  it('ignores missing values', () => {
    expect(obsFlags(null).size).toBe(0);
    expect(obsFlags({ temperature: '', heart_rate: null }).size).toBe(0);
  });
});
