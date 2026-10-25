import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { decideVitalsHandoff, hasVitalReadings } from '../utils/vitalsHandoff';
import { useActiveId } from '../hooks/useActiveId';

describe('nurse vitals when switching patient', () => {
  const typed = { temperature: 38.2, heart_rate: 96, temperature_unit: 'C' };

  it('saves valid readings to the patient they were typed for, never the next one', () => {
    expect(decideVitalsHandoff({ previousPatientId: 1, nextPatientId: 2, vitals: typed, modified: true, errorCount: 0 }))
      .toBe('save-to-previous');
  });

  it('drops readings that failed validation', () => {
    expect(decideVitalsHandoff({ previousPatientId: 1, nextPatientId: 2, vitals: typed, modified: true, errorCount: 1 }))
      .toBe('discard');
  });

  it('does nothing when nothing was typed, or the same patient is re-selected', () => {
    expect(decideVitalsHandoff({ previousPatientId: 1, nextPatientId: 2, vitals: { temperature_unit: 'C' }, modified: true, errorCount: 0 })).toBe('none');
    expect(decideVitalsHandoff({ previousPatientId: 1, nextPatientId: 1, vitals: typed, modified: true, errorCount: 0 })).toBe('none');
    expect(decideVitalsHandoff({ previousPatientId: null, nextPatientId: 2, vitals: typed, modified: true, errorCount: 0 })).toBe('none');
  });

  it('only counts real readings, not unit toggles', () => {
    expect(hasVitalReadings({ temperature_unit: 'F', weight_unit: 'kg' })).toBe(false);
    expect(hasVitalReadings({ oxygen_saturation: 88 })).toBe(true);
  });
});

describe('ignoring replies for a patient no longer on screen', () => {
  it("drops patient A's late reply after switching to patient B", async () => {
    const { result, rerender } = renderHook(({ id }) => useActiveId<number | null>(id), { initialProps: { id: 1 as number | null } });
    const shown: string[] = [];

    // Load A, but the reply is slow.
    let resolveA!: (v: string) => void;
    const loadA = new Promise<string>((r) => { resolveA = r; }).then((v) => { if (result.current(1)) shown.push(v); });

    // The user moves to B; B loads quickly.
    rerender({ id: 2 });
    await Promise.resolve('B data').then((v) => { if (result.current(2)) shown.push(v); });

    resolveA('A data');
    await loadA;

    expect(shown).toEqual(['B data']);
  });

  it('keeps the same checker across renders (safe in effect dependencies)', () => {
    const { result, rerender } = renderHook(({ id }) => useActiveId(id), { initialProps: { id: 'a' } });
    const first = result.current;
    rerender({ id: 'b' });
    expect(result.current).toBe(first);
    expect(first('b')).toBe(true);
    expect(first('a')).toBe(false);
  });
});
