import { describe, it, expect, vi } from 'vitest';
import { performPatientMerge, MergeError } from '../controllers/patientMergeController';

// A transaction client with patients 1 (source) and 2 (target) and two tables
// that reference patient_id. `failWith` decides what a bulk UPDATE of a table
// throws; `rowFails` what a single-row UPDATE (by ctid) throws.
const fakeClient = (opts: {
  failWith?: Record<string, { code: string; message: string }>;
  rows?: Record<string, Array<{ _ctid: string; id: number }>>;
  rowFails?: Record<string, { code: string; message: string }>;
}) => {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (raw: unknown, params: any[] = []) => {
      const sql = String(raw);
      calls.push(sql);
      if (sql.includes('FROM patients WHERE id = ANY')) {
        return { rows: [
          { id: 1, patient_number: 'P1', user_id: 11, source: null, carecode_origin_number: null, merged_into: null },
          { id: 2, patient_number: 'P2', user_id: 12, source: null, carecode_origin_number: null, merged_into: null },
        ] };
      }
      if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'encounters' }, { table_name: 'patient_payer_sources' }] };
      const m = sql.match(/^UPDATE "(\w+)" SET patient_id = \$1 WHERE (patient_id|ctid)/);
      if (m) {
        const [, table, by] = m;
        if (by === 'patient_id' && opts.failWith?.[table]) throw opts.failWith[table];
        if (by === 'ctid' && opts.rowFails?.[`${table}:${params[1]}`]) throw opts.rowFails[`${table}:${params[1]}`];
        return { rowCount: by === 'ctid' ? 1 : 3, rows: [] };
      }
      const sel = sql.match(/SELECT ctid::text AS _ctid, \* FROM "(\w+)"/);
      if (sel) return { rows: opts.rows?.[sel[1]] || [] };
      if (sql.startsWith('DELETE')) return { rowCount: 1, rows: [] };
      return { rows: [], rowCount: 0 };
    }),
  };
  return { client: client as any, calls };
};

describe('patient merge', () => {
  it('aborts — and deletes nothing — when a table fails for any reason but a duplicate', async () => {
    const { client, calls } = fakeClient({ failWith: { encounters: { code: '23503', message: 'fk violation' } } });
    await expect(performPatientMerge(client, 1, 2, 9)).rejects.toBeInstanceOf(MergeError);
    expect(calls.some((s) => s.startsWith('DELETE'))).toBe(false);
  });

  it('on a duplicate conflict, drops only the conflicting row and keeps a copy of it', async () => {
    const dup = { code: '23505', message: 'duplicate key' };
    const { client, calls } = fakeClient({
      failWith: { patient_payer_sources: dup },
      rows: { patient_payer_sources: [{ _ctid: '(0,1)', id: 50 }, { _ctid: '(0,2)', id: 51 }] },
      rowFails: { 'patient_payer_sources:(0,2)': dup },
    });
    const out = await performPatientMerge(client, 1, 2, 9);
    expect(out.moved.patient_payer_sources).toBe(1);
    expect(out.dropped.patient_payer_sources).toBe(1);
    const deletes = calls.filter((s) => s.startsWith('DELETE'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain('ctid');
    const record = vi.mocked(client.query).mock.calls.find(([s]: any[]) => String(s).includes('INSERT INTO patient_merges'));
    expect(JSON.parse(record![1][5]).dropped_rows.patient_payer_sources).toEqual([{ id: 51 }]);
  });
});
