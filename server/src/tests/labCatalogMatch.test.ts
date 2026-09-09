import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { resolveLabCatalogItem, resolveLabCatalogItems } from '../controllers/ordersController';

/**
 * Doctors type lab names freehand. The resolver must never silently bill a
 * DIFFERENT test than the one ordered — an unmatched line flagged
 * [PRICE PENDING] is safe and visible; a wrong test on the invoice is not.
 *
 * Both regressions below were seen on one real GLICO-insured invoice:
 * "URINE RE" billed as URINE PREGNANCY TEST, and "RBS" billed as BIOCARBONATE.
 */
const CATALOG = [
  { id: 1, test_code: 'R204', test_name: 'URINE R/E', base_price: '90.00' },
  { id: 2, test_code: 'J261', test_name: 'URINE PREGNANCY TEST (TOTA ßhCG --- URINE)', base_price: '80.00' },
  { id: 3, test_code: 'U345', test_name: 'URINE C/S (CULTURE & SENSITIVITY)', base_price: '230.00' },
  { id: 4, test_code: 'CO2', test_name: 'BIOCARBONATE', base_price: '40.00' },
  { id: 5, test_code: 'RBS', test_name: 'Random Blood Sugar', base_price: '60.00' },
  { id: 6, test_code: 'LIPID_M', test_name: 'Lipid Profile (Male)', base_price: '300.00' },
  { id: 7, test_code: 'LIPID_F', test_name: 'Lipid Profile (Female)', base_price: '300.00' },
  { id: 8, test_code: 'P358', test_name: 'MALARIA THICK AND THIN', base_price: '100.00' },
];

// Mimics the handful of queries the resolver issues, against CATALOG.
const mockCatalogQueries = () => {
  vi.mocked(pool.query).mockImplementation((async (sql: string, params?: any[]) => {
    const p = params || [];
    if (sql.includes('test_code = $1')) {
      return { rows: CATALOG.filter((r) => r.test_code === p[0]).slice(0, 1) };
    }
    if (sql.includes('test_name ILIKE $1')) {
      return { rows: CATALOG.filter((r) => r.test_name.toLowerCase() === String(p[0]).toLowerCase()).slice(0, 1) };
    }
    if (sql.includes('UPPER(test_code) = UPPER($1)')) {
      return { rows: CATALOG.filter((r) => r.test_code.toUpperCase() === String(p[0]).toUpperCase()).slice(0, 1) };
    }
    return { rows: CATALOG };
  }) as any);
};

describe('resolveLabCatalogItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCatalogQueries();
  });

  it.each(['URINE RE', 'Urine RE', 'urine re', 'urine r/e', 'URINE R/E'])(
    'resolves %s to URINE R/E, never the pregnancy test',
    async (name) => {
      const r = await resolveLabCatalogItem(null, name);
      expect(r.match?.test_code).toBe('R204');
    }
  );

  it('does not truncate RBS to RB and match BIOCARBONATE', async () => {
    const r = await resolveLabCatalogItem(null, 'RBS');
    expect(r.match?.test_code).toBe('RBS');
    expect(r.match?.test_name).not.toMatch(/BIOCARBONATE/i);
  });

  it('still resolves a genuine pregnancy test order', async () => {
    const r = await resolveLabCatalogItem(null, 'Urine Pregnancy Test');
    expect(r.match?.test_code).toBe('J261');
  });

  it('prefers an explicit code over the typed name', async () => {
    const r = await resolveLabCatalogItem('R204', 'anything at all');
    expect(r.match?.test_code).toBe('R204');
    expect(r.matchType).toBe('code');
  });

  it('matches a catalog name that begins with what was typed', async () => {
    const r = await resolveLabCatalogItem(null, 'URINE CS');
    expect(r.match?.test_code).toBe('U345');
  });

  it('picks the sex-matching variant instead of calling it ambiguous', async () => {
    const male = await resolveLabCatalogItem(null, 'Lipid Profile', { patientSex: 'Male' });
    expect(male.match?.test_code).toBe('LIPID_M');
    const female = await resolveLabCatalogItem(null, 'Lipid Profile', { patientSex: 'Female' });
    expect(female.match?.test_code).toBe('LIPID_F');
  });

  it('picks either variant when the price is identical and sex is unknown', async () => {
    // Both lipid profiles are GHS 300 here — whichever is chosen the patient
    // pays the same, so there is nothing for a human to decide.
    const r = await resolveLabCatalogItem(null, 'Lipid Profile');
    expect(r.match).not.toBeNull();
    expect(Number(r.match.base_price)).toBe(300);
  });

  it('still refuses when candidates carry DIFFERENT prices', async () => {
    // URINE C/S (230) vs URINE R/E (90) — a wrong pick changes the bill.
    const r = await resolveLabCatalogItem(null, 'urine');
    expect(r.match).toBeNull();
    expect(r.matchType).toBe('none');
  });

  it('leaves a multi-test free-text order unmatched rather than picking one', async () => {
    const r = await resolveLabCatalogItem(null, 'FBC, BUE + CR, LFT, URINE RE');
    expect(r.match).toBeNull();
  });

  it('returns none for an empty order', async () => {
    const r = await resolveLabCatalogItem(null, '');
    expect(r.matchType).toBe('none');
  });
});

/**
 * One order line often covers two tests. Billing only the first meant the rest
 * was never charged and the front desk had no way to add it — reception hit
 * exactly this with "urine r/e & c/s" on 2026-09-09.
 */
describe('resolveLabCatalogItems — combined orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCatalogQueries();
  });

  it('bills BOTH tests in "urine r/e & c/s"', async () => {
    const r = await resolveLabCatalogItems(null, 'urine r/e & c/s');
    const codes = r.matches.map((m: any) => m.test_code).sort();
    expect(codes).toEqual(['R204', 'U345']);
    expect(r.unmatchedParts).toHaveLength(0);
  });

  it('gives a bare trailing fragment the specimen from the first part', async () => {
    // "c/s" alone is meaningless; it means urine c/s here.
    const r = await resolveLabCatalogItems(null, 'urine r/e & c/s');
    expect(r.matches.some((m: any) => m.test_code === 'U345')).toBe(true);
  });

  it('does not shred a single test whose NAME contains "and"', async () => {
    const r = await resolveLabCatalogItems(null, 'malaria thick and thin');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].test_code).toBe('P358');
  });

  it('leaves a single-test order as one line', async () => {
    const r = await resolveLabCatalogItems(null, 'URINE RE');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].test_code).toBe('R204');
  });
});
