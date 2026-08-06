import { describe, it, expect } from 'vitest';
import { resolveLine, resolveFromCatalogs, type RevenueRule } from '../services/qbRevenueMapService';

// Mirrors the seeded rules that actually matter for ordering. Kept inline so the
// test doesn't need a database — it's the matching logic under test, not the seed.
let nextId = 1;
const rule = (
  order: number,
  category: string | null,
  pattern: string | null,
  account: string,
  item: string
): RevenueRule => ({
  id: nextId++,
  rule_order: order,
  match_category: category,
  match_pattern: pattern,
  qb_account_full_name: account,
  qb_item_name: item,
  qb_account_listid: null,
  qb_item_listid: null,
});

const RULES: RevenueRule[] = [
  rule(10, null, '%consumables for short stay%', 'Revenue:Consumables:Consumables for Detention', 'Consumables for Detention'),
  rule(12, null, '%consumables for injection%', 'Revenue:Consumables:Consumables for injection', 'Consumables for Injection'),
  rule(13, null, '%consumable%', 'Revenue:Consumables', 'Consumables'),
  rule(20, null, '%short stay%', 'Revenue:Detention', 'Detention'),
  rule(32, null, '%ecg%', 'Revenue:Scan/Procedure:Procedure - ECG', 'Procedure - ECG'),
  rule(38, null, '%wound dressing%', 'Revenue:Scan/Procedure:Wound dressing', 'Wound Dressing'),
  rule(40, null, '%ultrasound%', 'Revenue:Ultrasound Scans', 'Ultrasound Scans'),
  rule(60, 'service', 'lab:%', 'Revenue:Lab.Service Fee', 'Lab Services'),
  rule(100, 'lab', null, 'Revenue:Lab.Service Fee', 'Lab Services'),
  rule(101, 'medication', null, 'Revenue:Pharmacy', 'Pharmacy'),
  rule(103, 'consultation', null, 'Revenue:Consultation', 'Consultation'),
  rule(106, 'imaging', null, 'Revenue:Scan/Procedure', 'Scan and Procedure'),
];

const accountFor = (category: string | null, description: string, catalogs?: any) =>
  resolveLine(RULES, category, description, catalogs).accountFullName;

describe('QuickBooks revenue routing', () => {
  describe('rule ordering', () => {
    it('files consumables-for-short-stay as consumables, not detention', () => {
      // The narrower rule must win; "CONSUMABLES FOR SHORT STAY" also contains
      // "short stay", so a reordering would silently misfile GHS thousands.
      expect(accountFor('procedure', 'CONSUMABLES FOR SHORT STAY'))
        .toBe('Revenue:Consumables:Consumables for Detention');
      expect(accountFor('procedure', 'SHORT STAY ')).toBe('Revenue:Detention');
    });

    it('separates injection consumables from generic consumables', () => {
      expect(accountFor('procedure', 'Consumables for Injection'))
        .toBe('Revenue:Consumables:Consumables for injection');
      expect(accountFor('service', 'CONSUMABLES')).toBe('Revenue:Consumables');
    });

    it('routes ECG to the procedure account even though it is filed under imaging', () => {
      expect(accountFor('imaging', 'Imaging: ECG')).toBe('Revenue:Scan/Procedure:Procedure - ECG');
      expect(accountFor('imaging', 'Imaging: 12 lead ecg')).toBe('Revenue:Scan/Procedure:Procedure - ECG');
      expect(accountFor('procedure', 'ECG Recording')).toBe('Revenue:Scan/Procedure:Procedure - ECG');
    });

    it('sends ultrasounds to their own account and leaves other imaging on the parent', () => {
      expect(accountFor('imaging', 'Imaging: Abdominopelvic ultrasound')).toBe('Revenue:Ultrasound Scans');
      expect(accountFor('imaging', 'Imaging: X-Ray - Chest')).toBe('Revenue:Scan/Procedure');
    });
  });

  describe('pattern matching', () => {
    it('is case-insensitive', () => {
      expect(accountFor('procedure', 'wound dressing - MAJOR')).toBe('Revenue:Scan/Procedure:Wound dressing');
      expect(accountFor('procedure', 'Wound Dressing (Large)')).toBe('Revenue:Scan/Procedure:Wound dressing');
    });

    it('honours a prefix pattern anchored at the start', () => {
      expect(accountFor('service', 'Lab: Gonorrhoea PCR')).toBe('Revenue:Lab.Service Fee');
      // 'lab:%' is anchored — a description merely containing "lab:" shouldn't match.
      expect(accountFor('service', 'Send to lab: urgent')).toBeNull();
    });

    it('respects the category constraint on a rule', () => {
      // The 'lab:%' rule is scoped to the service category, so a consultation
      // line worded that way must not be pulled into lab revenue — it falls
      // through to its own category account instead.
      expect(accountFor('consultation', 'lab: something')).toBe('Revenue:Consultation');
      expect(accountFor('service', 'lab: something')).toBe('Revenue:Lab.Service Fee');
    });

    it('treats regex metacharacters in a description literally', () => {
      expect(accountFor('lab', 'C-Reactive Protein (high.sensitivity)')).toBe('Revenue:Lab.Service Fee');
    });
  });

  describe('category fallbacks', () => {
    it('routes each billing category to its account', () => {
      expect(accountFor('lab', 'HBA1C')).toBe('Revenue:Lab.Service Fee');
      expect(accountFor('medication', 'CAP PREGABALIN 75MG')).toBe('Revenue:Pharmacy');
      expect(accountFor('consultation', 'Cardiology')).toBe('Revenue:Consultation');
    });

    it('leaves an unmatched line unclassified rather than guessing', () => {
      const resolved = resolveLine(RULES, 'service', 'Something nobody has seen before');
      expect(resolved.accountFullName).toBeNull();
      expect(resolved.itemName).toBeNull();
    });
  });

  describe('catalog fallback for the legacy "service" junk drawer', () => {
    const catalogs = {
      lab: new Set(['full blood count', 'liver function test']),
      pharmacy: new Set(['forxiga', 'nexium']),
      consultation: new Set(['internal medicine', 'nephrology']),
    };

    it('recognises a drug by its catalog name even with a strength suffix', () => {
      expect(accountFor('service', 'FORXIGA 10MG TAB', catalogs)).toBe('Revenue:Pharmacy');
    });

    it('recognises a consultation by wording', () => {
      expect(accountFor('service', 'New Patient Consultation', catalogs)).toBe('Revenue:Consultation');
      expect(accountFor('service', 'HEMATOLOGY CONSULTATION', catalogs)).toBe('Revenue:Consultation');
    });

    it('recognises a lab test from the catalog', () => {
      expect(accountFor('service', 'Liver Function Test', catalogs)).toBe('Revenue:Lab.Service Fee');
    });

    it('does not let a short catalog entry swallow unrelated lines', () => {
      const greedy = { lab: new Set(['fbc']), pharmacy: new Set<string>(), consultation: new Set<string>() };
      // 'fbc' is under the 4-character floor, so it must not match by prefix.
      expect(resolveFromCatalogs(greedy as any, 'FBC something else entirely')).toBeNull();
    });

    it('still returns null when no catalog knows the line', () => {
      expect(accountFor('service', 'INJ MOUNJARO 2.5', catalogs)).toBeNull();
    });
  });
});
