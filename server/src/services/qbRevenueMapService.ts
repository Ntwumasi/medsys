import pool from '../database/db';

/**
 * Decides which QuickBooks service item (and therefore which income account) an
 * invoice line books to. See migrations/addQuickBooksRevenueMap.ts for why this
 * exists and how the rules are ordered.
 */

export interface RevenueRule {
  id: number;
  rule_order: number;
  match_category: string | null;
  match_pattern: string | null;
  qb_account_full_name: string;
  qb_item_name: string;
  qb_account_listid: string | null;
  qb_item_listid: string | null;
}

export interface ResolvedLine {
  itemName: string | null;      // null => no rule matched; caller uses the global default item
  accountFullName: string | null;
  itemListId: string | null;
  ruleId: number | null;
}

let cache: { rules: RevenueRule[]; loadedAt: number } | null = null;
const CACHE_MS = 60_000;

export const loadRules = async (force = false): Promise<RevenueRule[]> => {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.rules;
  const r = await pool.query(
    `SELECT id, rule_order, match_category, match_pattern,
            qb_account_full_name, qb_item_name, qb_account_listid, qb_item_listid
       FROM quickbooks_revenue_map
      WHERE is_active
      ORDER BY rule_order ASC, id ASC`
  );
  cache = { rules: r.rows, loadedAt: Date.now() };
  return r.rows;
};

export const invalidateRuleCache = (): void => { cache = null; };

// SQL ILIKE semantics ('%' and '_'), evaluated in JS so a whole invoice can be
// routed without a query per line.
const ilike = (value: string, pattern: string): boolean => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = '^' + escaped.replace(/%/g, '[\\s\\S]*').replace(/_/g, '[\\s\\S]') + '$';
  return new RegExp(regex, 'i').test(value);
};

const matches = (rule: RevenueRule, category: string, description: string): boolean => {
  if (rule.match_category && rule.match_category.toLowerCase() !== category.toLowerCase()) return false;
  if (rule.match_pattern && !ilike(description, rule.match_pattern)) return false;
  return true;
};

/**
 * Second tier for the legacy 'service' junk drawer, where labs, drugs and
 * consultations were all filed under one category. Rather than hand-listing
 * every test abbreviation, match the line against the catalogs that already
 * define these things — so a newly added test or drug is classified without
 * anyone touching the rules.
 */
interface Catalogs { lab: Set<string>; pharmacy: Set<string>; consultation: Set<string> }
let catalogCache: { data: Catalogs; loadedAt: number } | null = null;
const CATALOG_CACHE_MS = 300_000;

const normalise = (s: string): string =>
  s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export const loadCatalogs = async (force = false): Promise<Catalogs> => {
  if (!force && catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_CACHE_MS) return catalogCache.data;

  const [lab, pharmacy, consultation] = await Promise.all([
    pool.query(`SELECT test_name, test_code FROM lab_test_catalog WHERE is_active`),
    pool.query(`SELECT medication_name, generic_name FROM pharmacy_inventory WHERE is_active`),
    pool.query(`SELECT service_name FROM charge_master WHERE is_active AND category = 'consultation'`),
  ]);

  const data: Catalogs = {
    lab: new Set<string>(),
    pharmacy: new Set<string>(),
    consultation: new Set<string>(),
  };
  for (const r of lab.rows) {
    if (r.test_name) data.lab.add(normalise(r.test_name));
    if (r.test_code) data.lab.add(normalise(r.test_code));
  }
  for (const r of pharmacy.rows) {
    if (r.medication_name) data.pharmacy.add(normalise(r.medication_name));
    if (r.generic_name) data.pharmacy.add(normalise(r.generic_name));
  }
  for (const r of consultation.rows) {
    if (r.service_name) data.consultation.add(normalise(r.service_name));
  }
  data.lab.delete(''); data.pharmacy.delete(''); data.consultation.delete('');

  catalogCache = { data, loadedAt: Date.now() };
  return data;
};

// A description counts as a hit when it equals a catalog entry or starts with
// one — "FORXIGA 10MG TAB" should find "Forxiga". Requires 4+ characters so
// short codes can't match half the ledger.
const hitsCatalog = (desc: string, names: Set<string>): boolean => {
  if (names.has(desc)) return true;
  for (const name of names) {
    if (name.length >= 4 && (desc.startsWith(name + ' ') || desc === name)) return true;
  }
  return false;
};

export const resolveFromCatalogs = (
  catalogs: Catalogs,
  description: string | null | undefined
): 'lab' | 'medication' | 'consultation' | null => {
  const desc = normalise(description || '');
  if (!desc) return null;
  // Word-level cue first — "New Patient Consultation", "HEMATOLOGY CONSULTATION".
  if (/\bconsultation\b|\bconsult\b|\breview\b/.test(desc)) return 'consultation';
  if (hitsCatalog(desc, catalogs.lab)) return 'lab';
  if (hitsCatalog(desc, catalogs.pharmacy)) return 'medication';
  if (hitsCatalog(desc, catalogs.consultation)) return 'consultation';
  return null;
};

/** First matching rule wins. Returns nulls when nothing matches. */
export const resolveLine = (
  rules: RevenueRule[],
  category: string | null | undefined,
  description: string | null | undefined,
  catalogs?: Catalogs
): ResolvedLine => {
  const cat = (category || '').trim();
  const desc = (description || '').trim();

  const byRule = (rule: RevenueRule): ResolvedLine => ({
    itemName: rule.qb_item_name,
    accountFullName: rule.qb_account_full_name,
    itemListId: rule.qb_item_listid,
    ruleId: rule.id,
  });

  for (const rule of rules) {
    if (matches(rule, cat, desc)) return byRule(rule);
  }

  // Nothing matched by rule. Before giving up, try the catalogs — this is what
  // rescues the legacy 'service' lines that are really labs, drugs or
  // consultations. Reuse the existing category fallback rule for whatever the
  // catalogs say it is, so there's still exactly one place defining where a
  // category books to.
  if (catalogs) {
    const inferred = resolveFromCatalogs(catalogs, desc);
    if (inferred) {
      const fallback = rules.find((r) => r.match_category === inferred && !r.match_pattern);
      if (fallback) return byRule(fallback);
    }
  }

  return { itemName: null, accountFullName: null, itemListId: null, ruleId: null };
};

/** Convenience wrapper for a single line (loads/uses the cached rules). */
export const resolveLineForInvoiceItem = async (
  category: string | null | undefined,
  description: string | null | undefined
): Promise<ResolvedLine> => resolveLine(await loadRules(), category, description, await loadCatalogs());

/**
 * Classify a set of invoice lines and total them per destination account.
 * Used by the pre-flight report so the accountant can approve the routing
 * before anything is written into the live company file.
 */
export const summariseRouting = async (
  lines: Array<{ category: string | null; description: string | null; total_price: number | string }>
): Promise<Array<{ account: string; item: string; lines: number; amount: number }>> => {
  const rules = await loadRules(true);
  const catalogs = await loadCatalogs(true);
  const buckets = new Map<string, { account: string; item: string; lines: number; amount: number }>();

  for (const line of lines) {
    const resolved = resolveLine(rules, line.category, line.description, catalogs);
    const account = resolved.accountFullName || '(unclassified — falls back to the default item)';
    const item = resolved.itemName || '(default)';
    const key = `${account}|${item}`;
    const bucket = buckets.get(key) || { account, item, lines: 0, amount: 0 };
    bucket.lines += 1;
    bucket.amount += Number(line.total_price || 0);
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => b.amount - a.amount);
};

/** Distinct items we need to exist in QuickBooks, with their target account. */
export const requiredItems = async (): Promise<Array<{ itemName: string; accountFullName: string; itemListId: string | null; accountListId: string | null }>> => {
  const rules = await loadRules(true);
  const byItem = new Map<string, { itemName: string; accountFullName: string; itemListId: string | null; accountListId: string | null }>();
  for (const r of rules) {
    if (!byItem.has(r.qb_item_name)) {
      byItem.set(r.qb_item_name, {
        itemName: r.qb_item_name,
        accountFullName: r.qb_account_full_name,
        itemListId: r.qb_item_listid,
        accountListId: r.qb_account_listid,
      });
    }
  }
  return [...byItem.values()];
};

export default { loadRules, resolveLine, resolveLineForInvoiceItem, summariseRouting, requiredItems, invalidateRuleCache };
