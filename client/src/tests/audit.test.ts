import { describe, it, expect } from 'vitest';
import {
  summarizeAudit,
  formatAuditValue,
  humanizeAuditField,
  buildAuditChangeSet,
  auditChangePreview,
} from '../utils/audit';

describe('summarizeAudit', () => {
  it('builds a plain-English sentence with role and id', () => {
    expect(
      summarizeAudit({
        user_name: 'Sharon Therson-Cofie',
        user_role: 'receptionist',
        action: 'delete',
        entity_type: 'invoice_item',
        entity_id: 729,
      })
    ).toBe('Sharon Therson-Cofie (Receptionist) deleted Invoice Item #729');
  });

  it('falls back to System when there is no user', () => {
    expect(
      summarizeAudit({ user_name: null, user_role: null, action: 'update', entity_type: 'lab_order', entity_id: 316 })
    ).toBe('System updated Lab Order #316');
  });

  it('uses the raw action when no verb mapping exists', () => {
    expect(
      summarizeAudit({ user_name: 'A B', user_role: 'lab', action: 'requeue', entity_type: 'lab_order', entity_id: 1 })
    ).toBe('A B (Lab) requeue Lab Order #1');
  });
});

describe('formatAuditValue', () => {
  it('returns null for blank values', () => {
    expect(formatAuditValue(null)).toBeNull();
    expect(formatAuditValue(undefined)).toBeNull();
    expect(formatAuditValue('')).toBeNull();
  });

  it('humanizes booleans', () => {
    expect(formatAuditValue(true)).toBe('Yes');
    expect(formatAuditValue(false)).toBe('No');
  });

  it('formats ISO timestamps', () => {
    expect(formatAuditValue('2026-06-03T11:54:22.000Z')).toMatch(/Jun 03, 2026/);
  });

  it('passes plain strings/numbers through', () => {
    expect(formatAuditValue(273)).toBe('273');
    expect(formatAuditValue('hello')).toBe('hello');
  });
});

describe('humanizeAuditField', () => {
  it('maps known foreign keys to friendly labels', () => {
    expect(humanizeAuditField('invoice_id')).toBe('Invoice');
    expect(humanizeAuditField('patient_id')).toBe('Patient');
  });

  it('title-cases unknown fields', () => {
    expect(humanizeAuditField('some_random_field')).toBe('Some Random Field');
  });
});

describe('buildAuditChangeSet', () => {
  it('diffs only changed fields for updates (before -> after)', () => {
    const set = buildAuditChangeSet(
      'update',
      { status: 'pending', notes: 'same' },
      { status: 'completed', notes: 'same' }
    );
    expect(set?.kind).toBe('diff');
    expect(set?.rows).toHaveLength(1);
    expect(set?.rows[0]).toMatchObject({ label: 'Status', before: 'pending', after: 'completed' });
  });

  it('reports no changes when nothing differs', () => {
    const set = buildAuditChangeSet('update', { a: 1 }, { a: 1 });
    expect(set?.kind).toBe('diff');
    expect(set?.rows).toHaveLength(0);
    expect(set?.heading).toMatch(/no field changes/i);
  });

  it('lists a snapshot for creates', () => {
    const set = buildAuditChangeSet('create', null, { invoice_id: 273 });
    expect(set?.kind).toBe('snapshot');
    expect(set?.heading).toBe('Created with');
    expect(set?.rows[0]).toMatchObject({ label: 'Invoice', after: '273' });
  });

  it('lists a snapshot for deletes (from new_values capture)', () => {
    const set = buildAuditChangeSet('delete', null, { invoice_id: 273 });
    expect(set?.kind).toBe('snapshot');
    expect(set?.heading).toBe('Deleted record');
  });

  it('parses stringified JSON', () => {
    const set = buildAuditChangeSet('create', null, JSON.stringify({ name: 'X' }));
    expect(set?.rows[0]).toMatchObject({ label: 'Name', after: 'X' });
  });

  it('returns null when there is nothing to show', () => {
    expect(buildAuditChangeSet('read', null, null)).toBeNull();
  });
});

describe('auditChangePreview', () => {
  it('summarizes a diff count', () => {
    expect(auditChangePreview('update', { a: 1, b: 2 }, { a: 9, b: 8 })).toBe('2 fields changed');
  });

  it('summarizes a single-field snapshot', () => {
    expect(auditChangePreview('create', null, { a: 1 })).toBe('1 field');
  });

  it('returns null when nothing to preview', () => {
    expect(auditChangePreview('read', null, null)).toBeNull();
  });
});
