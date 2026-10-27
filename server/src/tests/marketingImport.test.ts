import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  classifyRows,
  detectContactColumns,
  normalizeContactPhone,
} from '../controllers/marketingImportController';

describe('spreadsheet phone numbers', () => {
  it('reads the forms people type and Excel stores', () => {
    expect(normalizeContactPhone('024 412 3456')).toBe('233244123456');
    expect(normalizeContactPhone('+233-24-412-3456')).toBe('233244123456');
    expect(normalizeContactPhone(244123456)).toBe('233244123456'); // Excel dropped the 0
    expect(normalizeContactPhone(233244123456)).toBe('233244123456');
    expect(normalizeContactPhone('00233244123456')).toBe('233244123456');
    expect(normalizeContactPhone('0244123456 / 0201234567')).toBe('233244123456');
    expect(normalizeContactPhone('(024) 412-3456')).toBe('233244123456');
  });

  it('rejects what is not a Ghana number', () => {
    expect(normalizeContactPhone('')).toBeNull();
    expect(normalizeContactPhone('n/a')).toBeNull();
    expect(normalizeContactPhone('02441234')).toBeNull();
  });
});

describe('column detection', () => {
  it('finds the usual headers', () => {
    expect(detectContactColumns(['Full Name', 'Mobile No.', 'E-mail'])).toMatchObject({
      full: 'Full Name',
      phone: 'Mobile No.',
      email: 'E-mail',
    });
    expect(detectContactColumns(['Surname', 'First Name', 'Phone Number', 'Email Address'])).toMatchObject({
      first: 'First Name',
      last: 'Surname',
      phone: 'Phone Number',
      email: 'Email Address',
    });
    expect(detectContactColumns(['Contact Name', 'Contact Number'])).toMatchObject({
      full: 'Contact Name',
      phone: 'Contact Number',
    });
  });
});

describe('import rows', () => {
  const cols = detectContactColumns(['Name', 'Phone', 'Email']);
  const run = (records: Record<string, unknown>[], existing: any[] = [], optedOutPatients: string[] = [], patients: string[] = []) =>
    classifyRows(records, cols, existing, new Set(optedOutPatients), new Set(patients));

  it('splits full names and tidies case', () => {
    const [r] = run([{ Name: '  ama  SERWAA owusu', Phone: '0244123456', Email: '' }]);
    expect(r).toMatchObject({ status: 'new', first_name: 'Ama', last_name: 'Serwaa Owusu', phone: '233244123456', row: 2 });
  });

  it('skips bad and repeated rows, with a reason', () => {
    const rows = run([
      { Name: 'A', Phone: '0244123456', Email: '' },
      { Name: 'B', Phone: '+233244123456', Email: '' },
      { Name: 'C', Phone: '12345', Email: '' },
      { Name: 'D', Phone: '', Email: '' },
    ]);
    expect(rows.map((r) => r.status)).toEqual(['new', 'skip', 'skip', 'skip']);
    expect(rows[1].reason).toBe('Listed twice in this file');
    expect(rows[2].reason).toBe('Phone number not valid');
    expect(rows[3].reason).toBe('No phone or email');
  });

  it('never imports a number whose patient opted out, and keeps opted-out contacts out', () => {
    const rows = run(
      [
        { Name: 'A', Phone: '0244123456', Email: '' },
        { Name: 'B', Phone: '0201234567', Email: '' },
        { Name: 'C', Phone: '0551234567', Email: '' },
      ],
      [
        { id: 1, phone: '233201234567', email: null, opted_out: true },
        { id: 2, phone: '233551234567', email: null, opted_out: false },
      ],
      ['233244123456']
    );
    expect(rows.map((r) => [r.status, r.reason])).toEqual([
      ['skip', 'A patient with this number opted out of marketing'],
      ['skip', 'Opted out of marketing'],
      ['update', undefined],
    ]);
  });

  it('accepts email-only rows and flags people who are already patients', () => {
    const rows = run(
      [
        { Name: 'A', Phone: '', Email: 'Ama@Example.com' },
        { Name: 'B', Phone: '0244123456', Email: '' },
      ],
      [],
      [],
      ['233244123456']
    );
    expect(rows[0]).toMatchObject({ status: 'new', phone: null, email: 'ama@example.com' });
    expect(rows[1]).toMatchObject({ status: 'new', also_patient: true });
  });

  it('reads phone numbers from a real xlsx without scientific notation', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Name', 'Phone'], ['Kofi', 233244123456]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const back = XLSX.read(buf, { type: 'buffer' });
    const recs = XLSX.utils.sheet_to_json<Record<string, unknown>>(back.Sheets.S, { defval: '', raw: true });
    expect(normalizeContactPhone(recs[0].Phone)).toBe('233244123456');
  });
});
