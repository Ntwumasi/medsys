import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../database/db';
import { auditService } from '../services/auditService';

/**
 * Patient contact list for marketing campaigns.
 *
 * This hands a person the phone number and email of every active patient, so:
 *  - patients who have opted out of marketing are excluded, always;
 *  - merged duplicates and deactivated records are excluded, so campaigns don't
 *    message the same person twice or someone no longer with the clinic;
 *  - placeholder addresses (<patient_number>@noemail.medsys.local, auto-assigned
 *    at registration when none was given) are blanked rather than exported as if
 *    they were reachable — only ~20% of patients have a real email;
 *  - every download is written to the audit log with who took it and how many
 *    rows, because this is the one action that removes patient contact details
 *    from the system in bulk;
 *  - browsing the on-screen list is audit-logged per search/filter (page 1),
 *    not per page turn, so the log shows who looked at what without noise.
 */

interface ContactRow {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  gender: string | null;
  last_visit: Date | null;
}

const PLACEHOLDER_EMAIL_DOMAIN = 'noemail.medsys.local';

interface ContactFilters {
  since?: string | null;
  /** name, phone or patient number */
  search?: string | null;
  /** only contacts that have a phone / a real email */
  has?: 'phone' | 'email' | null;
  /** list the opted-out patients instead (so an opt-out can be undone) */
  optedOut?: boolean;
}

// SQL that yields a real email or NULL (placeholder addresses count as none).
const REAL_EMAIL_SQL = `CASE WHEN u.email ILIKE '%@${PLACEHOLDER_EMAIL_DOMAIN}' THEN NULL
                 ELSE NULLIF(TRIM(COALESCE(u.email, '')), '') END`;

const parseFilters = (q: Request['query']): ContactFilters => {
  const has = q.has === 'phone' || q.has === 'email' ? q.has : null;
  const search = typeof q.search === 'string' ? q.search.trim().slice(0, 100) : '';
  return {
    since: (q.since as string) || null,
    search: search || null,
    has,
    optedOut: q.opted_out === 'true',
  };
};

const buildWhere = (f: ContactFilters): { where: string; params: any[] } => {
  const params: any[] = [];
  const clauses = [
    'p.merged_into IS NULL',
    'u.is_active = true',
    f.optedOut
      ? 'COALESCE(p.marketing_opt_out, false) = true'
      : 'COALESCE(p.marketing_opt_out, false) = false',
  ];
  if (f.since) {
    params.push(f.since);
    clauses.push(`EXISTS (
      SELECT 1 FROM encounters e
       WHERE e.patient_id = p.id AND e.created_at >= $${params.length}::date
    )`);
  }
  if (f.has === 'phone') clauses.push(`NULLIF(TRIM(COALESCE(u.phone, '')), '') IS NOT NULL`);
  if (f.has === 'email') clauses.push(`(${REAL_EMAIL_SQL}) IS NOT NULL`);
  if (f.search) {
    params.push(`%${f.search}%`);
    const like = `$${params.length}`;
    const parts = [
      `(u.first_name || ' ' || u.last_name) ILIKE ${like}`,
      `(u.last_name || ' ' || u.first_name) ILIKE ${like}`,
      `p.patient_number ILIKE ${like}`,
    ];
    // Phones are stored as both 0XXXXXXXXX and +233XXXXXXXXX. Strip the
    // national prefix off the search and substring-match the stored digits,
    // which then hits either form.
    let digits = f.search.replace(/\D/g, '');
    if (digits.startsWith('233')) digits = digits.slice(3);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      parts.push(`REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE $${params.length}`);
    }
    clauses.push(`(${parts.join(' OR ')})`);
  }
  return { where: clauses.join('\n        AND '), params };
};

const CONTACT_COLUMNS = `p.id,
            p.patient_number,
            BTRIM(REGEXP_REPLACE(u.first_name, '[\\t\\r\\n]+', ' ', 'g')) AS first_name,
            BTRIM(REGEXP_REPLACE(u.last_name,  '[\\t\\r\\n]+', ' ', 'g')) AS last_name,
            NULLIF(TRIM(COALESCE(u.phone, '')), '') AS phone,
            ${REAL_EMAIL_SQL} AS email,
            p.city,
            p.region,
            p.gender,
            (SELECT MAX(e.created_at) FROM encounters e WHERE e.patient_id = p.id) AS last_visit`;

const fetchContacts = async (f: ContactFilters): Promise<ContactRow[]> => {
  const { where, params } = buildWhere({ ...f, optedOut: false });
  const result = await pool.query(
    // Names are trimmed of stray whitespace, tabs and newlines: the live data
    // holds values like "<tab>FRANCIS" and " ANDERSON" from imports and typing,
    // which would otherwise reach a mail merge as "Dear <tab>FRANCIS".
    `SELECT ${CONTACT_COLUMNS}
       FROM patients p
       JOIN users u ON p.user_id = u.id
      WHERE ${where}
      ORDER BY u.last_name, u.first_name`,
    params
  );
  return result.rows;
};

const logExport = async (req: Request, rows: number, format: string, f: ContactFilters) => {
  await auditService.log({
    userId: (req as any).user?.id,
    action: 'export',
    entityType: 'patient_contacts',
    details: { rows, format, since: f.since || 'all', search: f.search || null, has: f.has || null },
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || undefined,
  });
};

/**
 * GET /api/marketing/contacts — the summary counts only. The rows themselves
 * come from the paginated /marketing/contacts/list, so this doesn't ship every
 * patient's details to the browser just to draw four numbers.
 */
export const getPatientContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const f = parseFilters(req.query);
    const { where, params } = buildWhere({ since: f.since, optedOut: false });
    const counts = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(NULLIF(TRIM(COALESCE(u.phone, '')), ''))::int AS with_phone,
              COUNT(${REAL_EMAIL_SQL})::int AS with_email
         FROM patients p
         JOIN users u ON p.user_id = u.id
        WHERE ${where}`,
      params
    );

    const optedOut = await pool.query(
      `SELECT COUNT(*) AS n FROM patients WHERE COALESCE(marketing_opt_out, false) = true AND merged_into IS NULL`
    );

    res.json({
      total: counts.rows[0].total,
      with_phone: counts.rows[0].with_phone,
      with_email: counts.rows[0].with_email,
      excluded_opted_out: Number(optedOut.rows[0].n),
    });
  } catch (error) {
    console.error('Get patient contacts error:', error);
    res.status(500).json({ error: 'Failed to load patient contacts' });
  }
};

/**
 * GET /api/marketing/contacts/list?search=&has=phone|email&since=&opted_out=true&page=&limit=
 * One page of the on-screen contact list. opted_out=true lists the opted-out
 * patients instead, so marketing can re-include someone switched off by mistake.
 */
export const listPatientContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const f = parseFilters(req.query);
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const { where, params } = buildWhere(f);

    const result = await pool.query(
      `SELECT ${CONTACT_COLUMNS},
              COUNT(*) OVER()::int AS full_count
         FROM patients p
         JOIN users u ON p.user_id = u.id
        WHERE ${where}
        ORDER BY u.last_name, u.first_name, p.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );
    const total = result.rows[0]?.full_count ?? 0;
    const contacts = result.rows.map(({ full_count: _fc, ...c }) => c);

    // Audit each new search/filter (page 1), not every page turn.
    if (page === 1) {
      await auditService.log({
        userId: (req as any).user?.id,
        action: 'read',
        entityType: 'patient_contacts',
        details: {
          matches: total,
          since: f.since || 'all',
          search: f.search || null,
          has: f.has || null,
          opted_out: !!f.optedOut,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'] || undefined,
      });
    }

    res.json({ contacts, total, page, limit });
  } catch (error) {
    console.error('List patient contacts error:', error);
    res.status(500).json({ error: 'Failed to load patient contacts' });
  }
};

/** GET /api/marketing/contacts/export?format=csv|xlsx — honours the same search/has/since filters as the list. */
export const exportPatientContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const f = parseFilters(req.query);
    const format = ((req.query.format as string) || 'csv').toLowerCase();
    const contacts = await fetchContacts(f);

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `patient_contacts_${stamp}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;

    await logExport(req, contacts.length, format, f);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Contacts');
      sheet.columns = [
        { header: 'Patient #', key: 'patient_number', width: 18 },
        { header: 'First Name', key: 'first_name', width: 20 },
        { header: 'Last Name', key: 'last_name', width: 20 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'City', key: 'city', width: 18 },
        { header: 'Region', key: 'region', width: 18 },
        { header: 'Gender', key: 'gender', width: 12 },
        { header: 'Last Visit', key: 'last_visit', width: 14 },
      ];
      sheet.getRow(1).font = { bold: true };
      contacts.forEach((c) =>
        sheet.addRow({
          patient_number: c.patient_number,
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          email: c.email,
          city: c.city,
          region: c.region,
          gender: c.gender,
          last_visit: c.last_visit ? new Date(c.last_visit).toISOString().slice(0, 10) : '',
        })
      );
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }

    // CSV. Quote every field and double embedded quotes: names carry commas
    // ("PRAH, SARAH") and apostrophes, which would otherwise split columns.
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Patient #', 'First Name', 'Last Name', 'Phone', 'Email', 'City', 'Region', 'Gender', 'Last Visit'];
    const lines = [
      header.map(esc).join(','),
      ...contacts.map((c) =>
        [
          c.patient_number,
          c.first_name,
          c.last_name,
          c.phone,
          c.email,
          c.city,
          c.region,
          c.gender,
          c.last_visit ? new Date(c.last_visit).toISOString().slice(0, 10) : '',
        ].map(esc).join(',')
      ),
    ];
    // BOM so Excel opens UTF-8 names (Ghanaian names carry accents) correctly.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + lines.join('\r\n'));
  } catch (error) {
    console.error('Export patient contacts error:', error);
    res.status(500).json({ error: 'Failed to export patient contacts' });
  }
};

/** PUT /api/patients/:id/marketing-opt-out — record that a patient asked not to be contacted. */
export const setMarketingOptOut = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const optOut = req.body?.marketing_opt_out;
    if (typeof optOut !== 'boolean') {
      res.status(400).json({ error: 'marketing_opt_out must be true or false' });
      return;
    }

    const result = await pool.query(
      `UPDATE patients SET marketing_opt_out = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING id, patient_number, marketing_opt_out`,
      [id, optOut]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    await auditService.log({
      userId: (req as any).user?.id,
      action: 'update',
      entityType: 'patient_marketing_opt_out',
      entityId: Number(id),
      details: { marketing_opt_out: optOut },
    });

    res.json({
      message: optOut
        ? 'Patient will be excluded from marketing lists.'
        : 'Patient will be included in marketing lists.',
      patient: result.rows[0],
    });
  } catch (error) {
    console.error('Set marketing opt-out error:', error);
    res.status(500).json({ error: 'Failed to update marketing preference' });
  }
};
