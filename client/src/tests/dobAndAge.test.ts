import { describe, it, expect, vi, afterEach } from 'vitest';
import { dobAndAge } from '../utils/age';

describe('dobAndAge (patient search label)', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a spelled-out date and the age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00'));
    expect(dobAndAge('1984-03-23T12:00:00')).toBe('DOB 23 Mar 1984 · 42y');
  });

  it('shows months for infants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00'));
    expect(dobAndAge('2026-06-10T12:00:00')).toBe('DOB 10 Jun 2026 · 5mo');
  });

  it('says so when there is no usable DOB instead of "Invalid Date"', () => {
    expect(dobAndAge(null)).toBe('DOB not recorded');
    expect(dobAndAge('')).toBe('DOB not recorded');
    expect(dobAndAge('not-a-date')).toBe('DOB not recorded');
  });
});

describe('dobAndAge — CareCode placeholder', () => {
  it('treats the 1900-01-01 placeholder (and its 31 Dec 1899 timezone shadow) as not recorded', () => {
    expect(dobAndAge('1900-01-01')).toBe('DOB not recorded');
    expect(dobAndAge('1900-01-01T00:00:00.000Z')).toBe('DOB not recorded');
    expect(dobAndAge('1899-12-31T23:00:00.000Z')).toBe('DOB not recorded');
  });
});
