import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { resolveLabCatalogItem } from '../controllers/ordersController';

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

  it('refuses to guess when several tests are equally plausible', async () => {
    // Male and female lipid profiles — billing cannot pick one.
    const r = await resolveLabCatalogItem(null, 'Lipid Profile');
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
