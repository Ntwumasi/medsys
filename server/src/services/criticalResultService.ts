import pool from '../database/db';
import { loadLabOrderParameters } from '../controllers/labInventoryController';
import notificationService from './notificationService';

/**
 * Critical lab values — detection and alerting.
 *
 * Until 2026-10 no critical alert had ever been raised: the template lookup
 * was an exact name match (so "BUE & Creatinine" never found the
 * "(Male)/(Female)" variants), values like ">500" or "5.4 mmol/L" were
 * skipped, and nobody was told even when a row was written. Now the template
 * is resolved the same sex/age-aware way the result screens use, values are
 * read leniently, and the ordering doctor + visit nurse are notified by name.
 */

export interface CriticalParam {
  parameter_code: string | null;
  parameter_name: string;
  value_type?: string;
  unit?: string | null;
  critical_low: number | string | null;
  critical_high: number | string | null;
}

export interface CriticalHit {
  alertType: 'critical_low' | 'critical_high';
  /** e.g. "Potassium: 7.1 mmol/L" — stored on the alert and shown to staff. */
  label: string;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "7.1", "7.1 mmol/L", ">500", "<= 2" → the number; anything else → null. */
export const readNumericValue = (raw: unknown): number | null => {
  const m = String(raw ?? '').trim().replace(',', '.').match(/^[<>≤≥]?=?\s*(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

/** Same inclusive thresholds as the staff result view (LabResultsInline). */
const classify = (v: number, low: number | null, high: number | null): CriticalHit['alertType'] | null => {
  if (low !== null && v <= low) return 'critical_low';
  if (high !== null && v >= high) return 'critical_high';
  return null;
};

export const findCriticalValues = (structured: Record<string, unknown>, params: CriticalParam[]): CriticalHit[] => {
  const hits: CriticalHit[] = [];
  for (const p of params) {
    if (p.value_type && p.value_type !== 'numeric') continue;
    const low = num(p.critical_low);
    const high = num(p.critical_high);
    if (low === null && high === null) continue;
    const raw = structured[p.parameter_code || ''] ?? structured[p.parameter_name];
    const v = readNumericValue(raw);
    if (v === null) continue;
    const alertType = classify(v, low, high);
    if (alertType) {
      const unit = p.unit && !String(raw).includes(p.unit) ? ` ${p.unit}` : '';
      hits.push({ alertType, label: `${p.parameter_name}: ${String(raw).trim()}${unit}` });
    }
  }
  return hits;
};

const parseStructured = (result: string): Record<string, unknown> | null => {
  const trimmed = result.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Check a finalised lab order's result for critical values; record each new
 * one and alert the ordering doctor / visit nurse. Safe to call more than
 * once (alerts are unique per order + value). Never throws.
 */
export const checkCriticalLabValues = async (
  orderId: number,
  order: { result?: string | null; ordering_provider?: number | null; test_code?: string | null; test_name?: string | null }
): Promise<CriticalHit[]> => {
  try {
    if (!order.result) return [];
    let hits: CriticalHit[] = [];
    const structured = parseStructured(order.result);

    if (structured) {
      const defs = await loadLabOrderParameters(orderId);
      if (!defs?.has_template) {
        console.warn(`[critical-check] lab order ${orderId}: no template for "${order.test_name}" — critical values not checked`);
        return [];
      }
      hits = findCriticalValues(structured, defs.parameters);
    } else {
      // Free-text result: compare its leading number with the catalog's limits.
      const cat = await pool.query(
        `SELECT critical_low, critical_high FROM lab_test_catalog
          WHERE test_code = $1 OR test_name ILIKE $2
          ORDER BY (test_code = $1) DESC
          LIMIT 1`,
        [order.test_code || '', order.test_name || '']
      );
      const v = readNumericValue(order.result);
      if (cat.rows.length && v !== null) {
        const alertType = classify(v, num(cat.rows[0].critical_low), num(cat.rows[0].critical_high));
        if (alertType) hits = [{ alertType, label: `${order.test_name}: ${order.result.trim()}` }];
      }
    }

    const fresh: string[] = [];
    for (const h of hits) {
      const r = await pool.query(
        `INSERT INTO critical_result_alerts (lab_order_id, ordering_provider_id, alert_type, result_value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [orderId, order.ordering_provider || null, h.alertType, h.label]
      );
      if (r.rows.length) fresh.push(h.label);
    }
    if (fresh.length) await notificationService.notifyCriticalResult(orderId, fresh);
    return hits;
  } catch (error) {
    console.error(`[critical-check] lab order ${orderId} failed:`, error);
    return [];
  }
};
