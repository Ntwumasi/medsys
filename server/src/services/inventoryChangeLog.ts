import type { Pool, PoolClient } from 'pg';

// Item fields whose edits are recorded in inventory_item_changes. Stock
// quantity is not here — stock movements live in inventory_transactions.
const TRACKED_FIELDS = [
  'medication_name', 'generic_name', 'category', 'unit', 'reorder_level',
  'unit_cost', 'selling_price', 'pack_size', 'expiry_date', 'supplier',
  'supplier_id', 'location', 'requires_prescription', 'is_active',
] as const;

const NUMERIC_FIELDS = new Set(['reorder_level', 'unit_cost', 'selling_price', 'pack_size', 'supplier_id']);

// pg returns NUMERIC as strings ('12.50') and DATE as Date objects; normalise
// so an unchanged value never looks like an edit.
const normalise = (field: string, value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined || value === '') return null;
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'boolean') return value;
  return String(value);
};

/**
 * Record what changed on a pharmacy inventory item between `before` and
 * `after` (full rows). Writes nothing when no tracked field changed.
 */
export const logInventoryItemChanges = async (
  db: Pool | PoolClient,
  opts: {
    inventoryId: number;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    source: 'edit' | 'procurement' | 'import';
    reason?: string | null;
    userId?: number | null;
  }
): Promise<void> => {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of TRACKED_FIELDS) {
    const from = normalise(field, opts.before[field]);
    const to = normalise(field, opts.after[field]);
    if (from !== to) changes[field] = { from, to };
  }
  if (Object.keys(changes).length === 0) return;

  await db.query(
    `INSERT INTO inventory_item_changes (inventory_id, changes, source, reason, performed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [opts.inventoryId, JSON.stringify(changes), opts.source, opts.reason?.trim() || null, opts.userId ?? null]
  );
};
