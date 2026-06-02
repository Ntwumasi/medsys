import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import pool from '../database/db';
import { auditService } from '../services/auditService';

/**
 * Self-serve pharmacy inventory uploader.
 *
 * Accepts a CSV or Excel file (base64), auto-detects columns, matches rows to
 * existing inventory by item_code (falling back to medication name), and returns
 * a validated dry-run preview. With { commit: true } it applies the changes in a
 * single transaction. Guardrails:
 *   - never overwrites an existing selling price with a blank/zero value
 *   - flags rows where selling price <= cost (margin loss) instead of silently saving
 *   - flags new items with no selling price instead of selling them at cost
 *   - stock quantities are only touched when updateStock is explicitly requested
 */

// Flexible header detection — normalize then match against priority lists.
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELD_MATCHERS: Record<string, string[]> = {
  code: ['itemcode', 'code', 'sku', 'productcode'],
  name: ['itemname', 'medicationname', 'productname', 'drugname', 'name', 'product', 'medication', 'item'],
  description: ['description', 'desc', 'genericname'],
  qoh: ['qoh', 'quantityonhand', 'quantity', 'stock', 'qty', 'currentstock'],
  cost: ['averagelandedcost', 'landedcost', 'purchasecost', 'unitcost', 'costprice', 'buyingprice', 'cost'],
  selling: ['sellingprice', 'defaultsellingprice', 'retailprice', 'saleprice', 'sellprice', 'price', 'sp'],
};

function detectColumns(headers: string[]): Record<string, string | null> {
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  const result: Record<string, string | null> = { code: null, name: null, description: null, qoh: null, cost: null, selling: null };
  for (const field of Object.keys(FIELD_MATCHERS)) {
    for (const candidate of FIELD_MATCHERS[field]) {
      // exact normalized match first, then "contains"
      const exact = normalized.find((h) => h.n === candidate);
      const partial = normalized.find((h) => h.n.includes(candidate));
      const hit = exact || partial;
      if (hit && !Object.values(result).includes(hit.raw)) {
        result[field] = hit.raw;
        break;
      }
    }
  }
  return result;
}

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function categorizeItem(itemName: string): { category: string; unit: string; requiresPrescription: boolean } {
  const name = itemName.toLowerCase();
  let unit = 'unit';
  if (name.includes('tab') || name.includes('caps') || name.includes('caplet')) unit = 'tablet';
  else if (name.includes('syr') || name.includes('susp') || name.includes('solution') || name.includes('drops')) unit = 'bottle';
  else if (name.includes('inj') || name.includes('vial') || name.includes('ampoule') || name.includes('amp')) unit = 'vial';
  else if (name.includes('cream') || name.includes('ointment') || name.includes('gel')) unit = 'tube';
  else if (name.includes('sachet') || name.includes('powder')) unit = 'sachet';
  let category = 'General';
  if (/(paracetamol|ibuprofen|diclofenac|tramadol|codeine)/.test(name)) category = 'Analgesic';
  else if (/(amoxicillin|azithro|cipro|metro|doxycycline|ceftriaxone|augmentin)/.test(name)) category = 'Antibiotic';
  else if (/(vitamin|vit |folic|iron|zinc|calcium|multivit)/.test(name)) category = 'Vitamins & Supplements';
  const requiresPrescription = !(category === 'Vitamins & Supplements');
  return { category, unit, requiresPrescription };
}

interface PreviewRow {
  rowNum: number;
  code: string | null;
  name: string;
  cost: number | null;
  selling: number | null;
  qoh: number | null;
  currentCost: number | null;
  currentSelling: number | null;
  action: 'update' | 'new' | 'skip';
  matchedId: number | null;
  warnings: string[];
}

export const importInventory = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as any;
  try {
    const { dataBase64, filename, commit, updateStock } = req.body || {};
    if (!dataBase64) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    // Parse CSV or Excel via xlsx
    let rows: Record<string, any>[];
    let headers: string[];
    try {
      const buf = Buffer.from(String(dataBase64), 'base64');
      const wb = XLSX.read(buf, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] as string[];
      headers = (headerRow || []).map((h) => String(h));
    } catch (e) {
      res.status(400).json({ error: 'Could not read file. Please upload a valid .csv or .xlsx file.' });
      return;
    }

    if (!rows.length) {
      res.status(400).json({ error: 'The file has no data rows.' });
      return;
    }

    const cols = detectColumns(headers);
    if (!cols.name) {
      res.status(400).json({ error: 'Could not find an item/medication name column.', detectedColumns: cols, headers });
      return;
    }
    if (!cols.selling && !cols.cost) {
      res.status(400).json({ error: 'Could not find a selling price or cost column.', detectedColumns: cols, headers });
      return;
    }

    // Preload existing inventory for matching
    const existing = await pool.query(
      `SELECT id, item_code, medication_name, unit_cost, selling_price FROM pharmacy_inventory WHERE is_active = true`
    );
    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const r of existing.rows) {
      if (r.item_code) byCode.set(String(r.item_code).toLowerCase().trim(), r);
      byName.set(String(r.medication_name).toLowerCase().trim(), r);
    }

    const preview: PreviewRow[] = [];
    let toUpdate = 0, toCreate = 0, priceChanges = 0, warnCount = 0, errorCount = 0;

    rows.forEach((raw, idx) => {
      const name = String(cols.name ? raw[cols.name] : '').trim();
      const code = cols.code ? String(raw[cols.code] || '').trim() : '';
      const cost = cols.cost ? parseNum(raw[cols.cost]) : null;
      const selling = cols.selling ? parseNum(raw[cols.selling]) : null;
      const qoh = cols.qoh ? parseNum(raw[cols.qoh]) : null;
      const warnings: string[] = [];

      if (!name) {
        errorCount++;
        preview.push({ rowNum: idx + 2, code: code || null, name: '(missing)', cost, selling, qoh, currentCost: null, currentSelling: null, action: 'skip', matchedId: null, warnings: ['Missing item name — row skipped'] });
        return;
      }

      const match = (code && byCode.get(code.toLowerCase())) || byName.get(name.toLowerCase()) || null;

      if (selling !== null && cost !== null && selling > 0 && selling <= cost) {
        warnings.push('Selling price is at or below cost');
      }
      if ((selling === null || selling === 0)) {
        warnings.push(match ? 'No selling price in file — existing price kept' : 'No selling price — new item will need a price');
      }

      let action: 'update' | 'new' = match ? 'update' : 'new';
      if (action === 'update') {
        toUpdate++;
        if (selling !== null && selling > 0 && Number(match.selling_price) !== selling) priceChanges++;
      } else {
        toCreate++;
      }
      if (warnings.length) warnCount++;

      preview.push({
        rowNum: idx + 2,
        code: code || (match?.item_code ?? null),
        name,
        cost,
        selling,
        qoh,
        currentCost: match ? Number(match.unit_cost) : null,
        currentSelling: match ? Number(match.selling_price) : null,
        action,
        matchedId: match?.id ?? null,
        warnings,
      });
    });

    const summary = {
      total: rows.length,
      toUpdate,
      toCreate,
      priceChanges,
      warnings: warnCount,
      errors: errorCount,
      updateStock: !!updateStock,
    };

    if (!commit) {
      res.json({ committed: false, summary, detectedColumns: cols, rows: preview.slice(0, 2000) });
      return;
    }

    // ---- COMMIT ----
    const client = await pool.connect();
    let updated = 0, created = 0;
    try {
      await client.query('BEGIN');
      for (const row of preview) {
        if (row.action === 'skip') continue;

        if (row.action === 'update' && row.matchedId) {
          const sets: string[] = [];
          const vals: any[] = [];
          let p = 1;
          if (row.cost !== null) { sets.push(`unit_cost = $${p++}`); vals.push(row.cost); }
          // Guardrail: never overwrite an existing price with blank/zero
          if (row.selling !== null && row.selling > 0) { sets.push(`selling_price = $${p++}`); vals.push(row.selling); }
          if (updateStock && row.qoh !== null) { sets.push(`quantity_on_hand = $${p++}`); vals.push(Math.max(0, Math.round(row.qoh))); }
          if (row.code) { sets.push(`item_code = COALESCE(item_code, $${p++})`); vals.push(row.code); }
          sets.push(`is_active = true`, `updated_at = CURRENT_TIMESTAMP`);
          vals.push(row.matchedId);
          await client.query(`UPDATE pharmacy_inventory SET ${sets.join(', ')} WHERE id = $${p}`, vals);
          updated++;
        } else if (row.action === 'new') {
          const { category, unit, requiresPrescription } = categorizeItem(row.name);
          await client.query(
            `INSERT INTO pharmacy_inventory
              (item_code, medication_name, generic_name, category, unit, quantity_on_hand, reorder_level,
               unit_cost, selling_price, location, is_active, requires_prescription)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Main Pharmacy',true,$10)`,
            [
              row.code || null,
              row.name,
              row.name,
              category,
              unit,
              updateStock && row.qoh !== null ? Math.max(0, Math.round(row.qoh)) : 0,
              10,
              row.cost ?? 0,
              row.selling && row.selling > 0 ? row.selling : 0,
              requiresPrescription,
            ]
          );
          created++;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Inventory import commit failed:', e);
      res.status(500).json({ error: 'Import failed while saving. No changes were applied.' });
      return;
    } finally {
      client.release();
    }

    await auditService.log({
      userId: authReq.user?.id,
      action: 'update',
      entityType: 'pharmacy_inventory_import',
      details: { filename: filename || null, updated, created, priceChanges, updateStock: !!updateStock },
    });

    res.json({
      committed: true,
      summary: { ...summary, applied: updated + created, updated, created },
      detectedColumns: cols,
      rows: preview.slice(0, 2000),
    });
  } catch (error) {
    console.error('Inventory import error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
