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
 *    from the system in bulk.
 */

interface ContactRow {
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

const fetchContacts = async (opts: { since?: string | null }): Promise<ContactRow[]> => {
  const params: any[] = [];
  let visitFilter = '';
  if (opts.since) {
    params.push(opts.since);
    visitFilter = `AND EXISTS (
      SELECT 1 FROM encounters e
       WHERE e.patient_id = p.id AND e.created_at >= $${params.length}::date
    )`;
  }

  const result = await pool.query(
    // Names are trimmed of stray whitespace, tabs and newlines: the live data
    // holds values like "<tab>FRANCIS" and " ANDERSON" from imports and typing,
    // which would otherwise reach a mail merge as "Dear <tab>FRANCIS".
    `SELECT p.patient_number,
            BTRIM(REGEXP_REPLACE(u.first_name, '[\\t\\r\\n]+', ' ', 'g')) AS first_name,
            BTRIM(REGEXP_REPLACE(u.last_name,  '[\\t\\r\\n]+', ' ', 'g')) AS last_name,
            NULLIF(TRIM(COALESCE(u.phone, '')), '') AS phone,
            CASE WHEN u.email ILIKE '%@${PLACEHOLDER_EMAIL_DOMAIN}' THEN NULL
                 ELSE NULLIF(TRIM(COALESCE(u.email, '')), '') END AS email,
            p.city,
            p.region,
            p.gender,
            (SELECT MAX(e.created_at) FROM encounters e WHERE e.patient_id = p.id) AS last_visit
       FROM patients p
       JOIN users u ON p.user_id = u.id
      WHERE p.merged_into IS NULL
        AND u.is_active = true
        AND COALESCE(p.marketing_opt_out, false) = false
        ${visitFilter}
      ORDER BY u.last_name, u.first_name`,
    params
  );
  return result.rows;
};

const logExport = async (req: Request, rows: number, format: string, since?: string | null) => {
  await auditService.log({
    userId: (req as any).user?.id,
    action: 'export',
    entityType: 'patient_contacts',
    details: { rows, format, since: since || 'all' },
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || undefined,
  });
};

/** GET /api/marketing/contacts — JSON preview for the on-screen list. */
export const getPatientContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const since = (req.query.since as string) || null;
    const contacts = await fetchContacts({ since });

    const optedOut = await pool.query(
      `SELECT COUNT(*) AS n FROM patients WHERE COALESCE(marketing_opt_out, false) = true AND merged_into IS NULL`
    );

    res.json({
      contacts,
      total: contacts.length,
      with_phone: contacts.filter((c) => c.phone).length,
      with_email: contacts.filter((c) => c.email).length,
      excluded_opted_out: Number(optedOut.rows[0].n),
    });
  } catch (error) {
    console.error('Get patient contacts error:', error);
    res.status(500).json({ error: 'Failed to load patient contacts' });
  }
};

/** GET /api/marketing/contacts/export?format=csv|xlsx */
export const exportPatientContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const since = (req.query.since as string) || null;
    const format = ((req.query.format as string) || 'csv').toLowerCase();
    const contacts = await fetchContacts({ since });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `patient_contacts_${stamp}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;

    await logExport(req, contacts.length, format, since);

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
          ...c,
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
