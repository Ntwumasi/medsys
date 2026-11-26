import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import pool from '../database/db';
import apiRouter from '../routes/index';
import {
  campaignReportNumbers,
  recipientsFilename,
  slugify,
  summarizeMonths,
} from '../controllers/smsCampaignReportController';

// The real route table on a real Express app, so role gates and headers are
// exactly what production serves.
let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use('/api', express.json(), apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

const countsRow = {
  id: 7,
  name: 'October BP check',
  message: 'Hello {first_name}, free BP checks this Saturday. To stop these messages, call the clinic.',
  status: 'sent',
  sandbox: false,
  filters: {},
  rejection_reason: null,
  created_by_name: 'Charles Mensah',
  created_at: '2026-10-01T09:00:00Z',
  approved_by_name: 'Nokio Twumasi',
  approved_at: '2026-10-01T10:00:00Z',
  sent_by_name: 'Charles Mensah',
  started_at: '2026-10-02T09:00:00Z',
  completed_at: '2026-10-02T09:05:00Z',
  recipient_count: 10,
  credits_per_message: 2,
  pending: 0,
  submitted: 2,
  delivered: 5,
  failed: 2,
  skipped: 1,
  skipped_opted_out: 1,
  accepted: 8, // one of the failures was rejected by Arkesel up front
};

const recipientRows = [
  { id: 1, patient_id: 11, contact_id: null, phone: '233244123456', status: 'delivered', delivery_status: 'DELIVERED', error: null, updated_at: '2026-10-02T09:01:00Z', patient_number: 'P-0011', name: 'Ama Owusu' },
  { id: 2, patient_id: null, contact_id: 3, phone: '233201234567', status: 'failed', delivery_status: 'NOT_DELIVERED', error: 'Not delivered: NOT_DELIVERED', updated_at: '2026-10-02T09:02:00Z', patient_number: null, name: 'Kofi Boateng' },
];

const queries: { sql: string; params: unknown[] }[] = [];

beforeEach(() => {
  queries.length = 0;
  vi.mocked(pool.query).mockReset();
  vi.mocked(pool.query).mockImplementation((async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('token_blacklist')) return { rows: [] };
    // user 3 is a super admin; the flag is read from the database, not the token.
    if (sql.includes('FROM users WHERE id')) return { rows: [{ is_active: true, is_super_admin: params[0] === 3, revoked_at_sec: null }] };
    if (sql.includes('INSERT INTO audit_logs')) return { rows: [] };
    if (sql.includes('LEFT JOIN users su')) return { rows: params[0] === 7 ? [countsRow] : [] };
    if (sql.includes('SELECT COUNT(*)::int AS n')) return { rows: [{ n: 1 }] };
    if (sql.includes('SELECT id, name, sandbox FROM sms_campaigns')) return { rows: params[0] === 7 ? [{ id: 7, name: countsRow.name, sandbox: false }] : [] };
    if (sql.includes('LEFT JOIN users pu')) return { rows: recipientRows };
    if (sql.includes('WITH months AS')) {
      return {
        rows: [
          { month: '2026-06', campaigns: 0, attempted: 0, delivered: 0, failed: 0, credits_used: 0 },
          { month: '2026-07', campaigns: 0, attempted: 0, delivered: 0, failed: 0, credits_used: 0 },
          { month: '2026-08', campaigns: 1, attempted: 100, delivered: 90, failed: 10, credits_used: 100 },
          { month: '2026-09', campaigns: 0, attempted: 0, delivered: 0, failed: 0, credits_used: 0 },
          { month: '2026-10', campaigns: 2, attempted: 300, delivered: 240, failed: 30, credits_used: 600 },
          { month: '2026-11', campaigns: 0, attempted: 0, delivered: 0, failed: 0, credits_used: 0 },
        ],
      };
    }
    return { rows: [] };
  }) as any);
});

const token = (role: string, extra: Record<string, unknown> = {}) =>
  jwt.sign({ id: 2, role, ...extra }, process.env.JWT_SECRET as string);

const get = (path: string, role: string, extra: Record<string, unknown> = {}) =>
  fetch(`${base}/api${path}`, { headers: { Authorization: `Bearer ${token(role, extra)}` } });

const noWrites = () =>
  queries
    .filter((q) => !q.sql.includes('INSERT INTO audit_logs'))
    .every((q) => !/\b(INSERT|UPDATE|DELETE)\b/i.test(q.sql));

describe('campaign report numbers', () => {
  it('counts, delivery rate and credits', () => {
    const n = campaignReportNumbers(countsRow as any, 1);
    expect(n).toMatchObject({
      recipients: 10,
      submitted: 2,
      delivered: 5,
      failed: 2,
      pending: 0,
      skipped: 1,
      skipped_opted_out: 1,
      attempted: 9,
      delivery_rate: 55.6, // 5 of 9 sent
      credits_per_message: 2,
      credits_estimated: 20,
      credits_used: 16, // 8 accepted × 2
      credits_charged: 16,
      opted_out_since: 1,
    });
  });

  it('a sandbox campaign is never charged', () => {
    const n = campaignReportNumbers({ ...countsRow, sandbox: true } as any, 0);
    expect(n.credits_used).toBe(16);
    expect(n.credits_charged).toBe(0);
  });

  it('no delivery rate before anything is sent', () => {
    const n = campaignReportNumbers({ ...countsRow, pending: 10, submitted: 0, delivered: 0, failed: 0, skipped: 0, accepted: 0 } as any, 0);
    expect(n.attempted).toBe(0);
    expect(n.delivery_rate).toBeNull();
    expect(n.credits_used).toBe(0);
  });
});

describe('monthly summary', () => {
  it('adds rates and totals', () => {
    const s = summarizeMonths([
      { month: '2026-09', campaigns: 0, attempted: 0, delivered: 0, failed: 0, credits_used: 0 },
      { month: '2026-10', campaigns: 2, attempted: 200, delivered: 150, failed: 50, credits_used: 400 },
      { month: '2026-11', campaigns: 1, attempted: 100, delivered: 100, failed: 0, credits_used: 100 },
    ]);
    expect(s.months.map((m) => m.delivery_rate)).toEqual([null, 75, 100]);
    expect(s.totals).toEqual({ campaigns: 3, attempted: 300, delivered: 250, failed: 50, credits_used: 500, delivery_rate: 83.3 });
  });
});

describe('filename', () => {
  it('slugs the campaign name', () => {
    expect(slugify('October BP check!')).toBe('october-bp-check');
    expect(slugify('Café  Ɔkwan — 50% off')).toBe('cafe-kwan-50-off');
    expect(slugify('***')).toBe('campaign');
    expect(recipientsFilename(7, 'October BP check')).toBe('campaign-7-october-bp-check-recipients.xlsx');
  });
});

describe('GET /marketing/sms/campaigns/:id/report', () => {
  it('returns the campaign details and numbers, read-only', async () => {
    const res = await get('/marketing/sms/campaigns/7/report', 'marketing');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.campaign).toMatchObject({
      name: 'October BP check',
      created_by_name: 'Charles Mensah',
      approved_by_name: 'Nokio Twumasi',
      started_at: '2026-10-02T09:00:00Z',
      completed_at: '2026-10-02T09:05:00Z',
    });
    expect(body.campaign.message).toContain('free BP checks');
    expect(body.numbers).toMatchObject({ delivered: 5, delivery_rate: 55.6, credits_charged: 16, opted_out_since: 1 });
    // Parameterized, and no data changed.
    expect(queries.find((q) => q.sql.includes('LEFT JOIN users su'))?.params).toEqual([7]);
    expect(noWrites()).toBe(true);
  });

  it('404 for an unknown campaign, 400 for a bad id', async () => {
    expect((await get('/marketing/sms/campaigns/99/report', 'marketing')).status).toBe(404);
    expect((await get('/marketing/sms/campaigns/abc/report', 'marketing')).status).toBe(400);
  });
});

describe('GET /marketing/sms/campaigns/:id/recipients/export', () => {
  it('streams an xlsx with one row per recipient', async () => {
    const res = await get('/marketing/sms/campaigns/7/recipients/export', 'marketing');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="campaign-7-october-bp-check-recipients.xlsx"');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const sheet = wb.getWorksheet('Recipients')!;
    expect(sheet.rowCount).toBe(3); // header + 2
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
    expect(sheet.getRow(2).getCell(1).value).toBe('Ama Owusu');
    expect(sheet.getRow(2).getCell(3).value).toBe('P-0011');
    expect(sheet.getRow(2).getCell(4).value).toBe('Delivered');
    expect(sheet.getRow(3).getCell(3).value).toBe('Imported contact');
    expect(sheet.getRow(3).getCell(5).value).toBe('NOT_DELIVERED');
    expect(sheet.getRow(3).getCell(7).value).toBeInstanceOf(Date);

    // The export is audited; nothing else is written.
    expect(queries.some((q) => q.sql.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(noWrites()).toBe(true);
  });

  it('404 for an unknown campaign', async () => {
    expect((await get('/marketing/sms/campaigns/99/recipients/export', 'marketing')).status).toBe(404);
  });
});

describe('GET /marketing/sms/reports/summary', () => {
  it('six months plus totals, live campaigns only by default', async () => {
    const res = await get('/marketing/sms/reports/summary', 'marketing');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.months).toHaveLength(6);
    expect(body.include_sandbox).toBe(false);
    expect(body.totals).toEqual({ campaigns: 3, attempted: 400, delivered: 330, failed: 40, credits_used: 700, delivery_rate: 82.5 });
    expect(queries.find((q) => q.sql.includes('WITH months AS'))?.params).toEqual([6, false]);
    expect(noWrites()).toBe(true);
  });

  it('can include sandbox campaigns', async () => {
    await get('/marketing/sms/reports/summary?include_sandbox=1', 'admin');
    expect(queries.find((q) => q.sql.includes('WITH months AS'))?.params).toEqual([6, true]);
  });
});

describe('who can see reports', () => {
  const paths = ['/marketing/sms/reports/summary', '/marketing/sms/campaigns/7/report', '/marketing/sms/campaigns/7/recipients/export'];

  it('same roles as the campaign list: marketing, admin (and office manager, super admin)', async () => {
    for (const p of paths) {
      expect((await get(p, 'marketing')).status).toBe(200);
      expect((await get(p, 'admin')).status).toBe(200);
      expect((await get(p, 'office_manager')).status).toBe(200);
      expect((await get(p, 'nurse', { id: 3, is_super_admin: true })).status).toBe(200);
    }
  });

  it('everyone else is refused', async () => {
    for (const p of paths) {
      for (const role of ['receptionist', 'doctor', 'nurse', 'accountant', 'pharmacist', 'patient']) {
        expect((await get(p, role)).status).toBe(403);
      }
      expect((await fetch(`${base}/api${p}`)).status).toBe(401);
    }
  });
});
