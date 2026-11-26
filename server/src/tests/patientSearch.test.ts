import { describe, it, expect } from 'vitest';
import { buildPatientSearch, parseDobTerm, phoneDigits } from '../utils/patientSearch';

describe('parseDobTerm', () => {
  it('reads ISO dates', () => expect(parseDobTerm('1984-03-23')).toEqual(['1984-03-23']));
  it('reads day-first Ghana dates', () => expect(parseDobTerm('23/03/1984')).toEqual(['1984-03-23']));
  it('returns both readings when day and month are ambiguous', () =>
    expect(parseDobTerm('05/03/1984').sort()).toEqual(['1984-03-05', '1984-05-03']));
  it('reads spelled-out months', () => {
    expect(parseDobTerm('23 Mar 1984')).toEqual(['1984-03-23']);
    expect(parseDobTerm('March 23, 1984')).toEqual(['1984-03-23']);
  });
  it('rejects impossible dates and non-dates', () => {
    expect(parseDobTerm('31/02/1984')).toEqual([]);
    expect(parseDobTerm('Owusu')).toEqual([]);
    expect(parseDobTerm('0240802696')).toEqual([]);
  });
});

describe('phoneDigits', () => {
  it('drops the 0 trunk prefix and the 233 country code', () => {
    expect(phoneDigits('024 080 2696')).toBe('240802696');
    expect(phoneDigits('+233 24 080 2696')).toBe('240802696');
  });
  it('ignores names and very short numbers', () => {
    expect(phoneDigits('Ama')).toBeNull();
    expect(phoneDigits('12')).toBeNull();
  });
});

describe('buildPatientSearch', () => {
  it('returns null for a blank term', () => expect(buildPatientSearch('   ')).toBeNull());

  it('matches full names in either order, word by word', () => {
    const r = buildPatientSearch('Ama  Owusu')!;
    expect(r.params).toEqual(['%Ama Owusu%', '%Ama%', '%Owusu%']);
    expect(r.clause).toContain('u.first_name ILIKE $2 OR u.last_name ILIKE $2');
    expect(r.clause).toContain('u.first_name ILIKE $3 OR u.last_name ILIKE $3');
  });

  it('searches phone (and patient number) for a number, not names', () => {
    const r = buildPatientSearch('0240802696')!;
    expect(r.params).toEqual(['%0240802696%', '%240802696%']);
    expect(r.clause).toContain("regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') LIKE $2");
    expect(r.clause).not.toContain('first_name');
  });

  it('searches date of birth for a date', () => {
    const r = buildPatientSearch('23/03/1984')!;
    expect(r.params).toContain('{1984-03-23}');
    expect(r.clause).toContain('p.date_of_birth::date = ANY($2::date[])');
  });

  it('numbers params from the given start index', () => {
    const r = buildPatientSearch('Mensah', 3)!;
    expect(r.clause).toContain('p.patient_number ILIKE $3');
    expect(r.clause).toContain('u.first_name ILIKE $4');
  });

  it('searches email when the term has an @', () => {
    const r = buildPatientSearch('ama@example.com')!;
    expect(r.clause).toContain('u.email ILIKE $2');
    expect(r.clause).not.toContain('first_name');
  });
});
