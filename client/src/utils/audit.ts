/**
 * Audit-log humanization helpers.
 *
 * The admin "Audit Logs" view stores raw rows (snake_case fields, foreign-key
 * ids, ISO timestamps). These helpers turn a row into something a human can
 * read at a glance: a one-line summary, friendly field labels, formatted
 * values, and a before -> after change set for updates.
 *
 * Pure functions only (no JSX) so they can be unit-tested and reused.
 */
import { format } from 'date-fns';

// Maps the audit `action` to a past-tense verb for the summary sentence.
export const AUDIT_ACTION_VERB: Record<string, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  sign: 'signed',
  dispense: 'dispensed',
  complete: 'completed',
  cancel: 'cancelled',
  checkout: 'checked out',
  verify: 'verified',
  reject: 'rejected',
  read: 'viewed',
};

// Friendly labels for common foreign-key / coded fields. Anything not listed
// falls back to title-cased snake_case.
const FIELD_LABELS: Record<string, string> = {
  invoice_id: 'Invoice',
  patient_id: 'Patient',
  provider_id: 'Provider',
  encounter_id: 'Encounter',
  appointment_id: 'Appointment',
  lab_order_id: 'Lab Order',
  pharmacy_order_id: 'Pharmacy Order',
  user_id: 'User',
  recipient_id: 'Recipient',
  sender_id: 'Sender',
  corporate_client_id: 'Corporate Client',
  insurance_provider_id: 'Insurance Provider',
  total_amount: 'Total Amount',
  unit_price: 'Unit Price',
  is_active: 'Active',
  is_super_admin: 'Super Admin',
};

const titleCase = (s: string): string =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const humanizeEntity = (type?: string | null): string =>
  type ? titleCase(type) : 'Record';

export const humanizeAuditField = (key: string): string =>
  FIELD_LABELS[key] || titleCase(key);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|\s)/;

/** Render a stored value as human text. Returns null for "not set". */
export const formatAuditValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => formatAuditValue(v) ?? '—').join(', ') : null;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  if (ISO_DATE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return format(d, 'MMM dd, yyyy h:mm a');
  }
  return s;
};

export interface AuditLogLike {
  user_name?: string | null;
  user_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: number | null;
}

/** e.g. "Sharon Therson-Cofie (Receptionist) deleted Invoice Item #729" */
export const summarizeAudit = (log: AuditLogLike): string => {
  const who = log.user_name || 'System';
  const role = log.user_role ? ` (${titleCase(log.user_role)})` : '';
  const verb = AUDIT_ACTION_VERB[log.action] || log.action;
  const entity = humanizeEntity(log.entity_type);
  const id = log.entity_id ? ` #${log.entity_id}` : '';
  return `${who}${role} ${verb} ${entity}${id}`;
};

export const parseAuditJson = (v: unknown): Record<string, unknown> | null => {
  if (!v) return null;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof v === 'object') return v as Record<string, unknown>;
  return null;
};

export interface AuditChangeRow {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
  changed: boolean;
}

export interface AuditChangeSet {
  /** 'diff' = before -> after columns; 'snapshot' = single value column */
  kind: 'diff' | 'snapshot';
  heading: string;
  rows: AuditChangeRow[];
}

/**
 * Build the change rows for the detail modal.
 * - update with both old & new -> diff of ONLY the fields that changed.
 * - create -> list what was set.
 * - delete (or anything with a single side) -> list the captured snapshot.
 */
export const buildAuditChangeSet = (
  action: string,
  oldRaw: unknown,
  newRaw: unknown,
): AuditChangeSet | null => {
  const oldVals = parseAuditJson(oldRaw);
  const newVals = parseAuditJson(newRaw);

  // Real before/after -> show only changed fields.
  if (oldVals && newVals) {
    const keys = Array.from(new Set([...Object.keys(oldVals), ...Object.keys(newVals)]));
    const rows = keys
      .map((field) => {
        const before = formatAuditValue(oldVals[field]);
        const after = formatAuditValue(newVals[field]);
        return { field, label: humanizeAuditField(field), before, after, changed: before !== after };
      })
      .filter((r) => r.changed)
      .sort((a, b) => a.label.localeCompare(b.label));
    return { kind: 'diff', heading: rows.length ? 'What changed' : 'No field changes recorded', rows };
  }

  // Single snapshot (create = new, delete = old or new).
  const snap = newVals || oldVals;
  if (snap) {
    const rows = Object.keys(snap)
      .map((field) => ({
        field,
        label: humanizeAuditField(field),
        before: null,
        after: formatAuditValue(snap[field]),
        changed: true,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const heading =
      action === 'create' ? 'Created with' : action === 'delete' ? 'Deleted record' : 'Details';
    return { kind: 'snapshot', heading, rows };
  }

  return null;
};

/** Short one-liner for the list's Details column, e.g. "3 fields changed". */
export const auditChangePreview = (action: string, oldRaw: unknown, newRaw: unknown): string | null => {
  const set = buildAuditChangeSet(action, oldRaw, newRaw);
  if (!set || set.rows.length === 0) return null;
  const n = set.rows.length;
  const noun = `${n} field${n === 1 ? '' : 's'}`;
  return set.kind === 'diff' ? `${noun} changed` : noun;
};
