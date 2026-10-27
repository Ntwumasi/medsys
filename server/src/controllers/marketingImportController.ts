import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import pool from '../database/db';
import { auditService } from '../services/auditService';
import { validatePhoneNumber } from '../services/smsService';

/**
 * Imported marketing contacts: people who are not patients, uploaded by
 * marketing from an Excel or CSV file and reachable by bulk SMS campaigns.
 *
 *  - kept apart from patients: an import never creates a patient record;
 *  - every file needs the uploader's confirmation that the people in it agreed
 *    to receive marketing messages, recorded with who and when;
 *  - a phone that belongs to a patient who opted out of marketing is never
 *    imported, and a contact who opted out stays opted out when a later file
 *    lists them again;
 *  - an import is previewed first and only saved with { commit: true };
 *  - a whole import can be removed (contacts it added, except opted-out ones,
 *    which are kept so the opt-out is remembered).
 */

const MAX_ROWS = 10000;
const PREVIEW_ROWS = 500;

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELD_MATCHERS: Record<'first' | 'last' | 'full' | 'phone' | 'email', string[]> = {
  first: ['firstname', 'givenname', 'forename', 'othernames', 'first'],
  last: ['lastname', 'surname', 'familyname', 'last'],
  full: ['fullname', 'name', 'contactname', 'customername', 'clientname'],
  phone: ['phonenumber', 'mobilenumber', 'mobile', 'phone', 'cellphone', 'cell', 'telephone', 'tel', 'whatsapp', 'contactnumber', 'contact', 'msisdn', 'number'],
  email: ['emailaddress', 'email', 'mail'],
};

type Columns = Record<keyof typeof FIELD_MATCHERS, string | null>;

export const detectContactColumns = (headers: string[]): Columns => {
  const normalized = headers.map((raw) => ({ raw, n: norm(raw) })).filter((h) => h.n);
  const result: Columns = { first: null, last: null, full: null, phone: null, email: null };
  const taken = new Set<string>();
  for (const field of ['email', 'phone', 'first', 'last', 'full'] as const) {
    for (const candidate of FIELD_MATCHERS[field]) {
      // "Contact Name" must not be taken for the phone column.
      const usable = (h: { raw: string; n: string }) => !taken.has(h.raw) && !(field === 'phone' && h.n.includes('name'));
      const hit = normalized.find((h) => h.n === candidate && usable(h))
        || normalized.find((h) => h.n.includes(candidate) && usable(h));
      if (hit) {
        result[field] = hit.raw;
        taken.add(hit.raw);
        break;
      }
    }
  }
  return result;
};

/**
 * A spreadsheet phone cell → 233XXXXXXXXX, or null. Excel stores numbers
 * without the leading 0 (244123456) and cells often hold two numbers
 * ("0244123456 / 0201234567"): the first one is used.
 */
export const normalizeContactPhone = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  let s = typeof value === 'number' ? String(Math.round(value)) : String(value);
  s = s.split(/[/,;]|\bor\b/i)[0].trim();
  s = s.replace(/(?!^\+)[^\d]/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (!s.replace('+', '')) return null;
  const v = validatePhoneNumber(s);
  return v.valid ? v.formatted.replace(/^\+/, '') : null;
};

const cleanEmail = (value: unknown): string | null => {
  const s = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.slice(0, 255) : null;
};

const cleanName = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())
    .slice(0, 100);

/** A patient's stored phone (0XXXXXXXXX or +233XXXXXXXXX) as 233XXXXXXXXX. */
const PATIENT_PHONE_SQL = `'233' || RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g'), 9)`;
const PATIENT_HAS_PHONE_SQL = `LENGTH(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g')) >= 9`;

/** Phones of patients who opted out of marketing. Never imported, never texted. */
export const optedOutPatientPhonesSql = `
  SELECT DISTINCT ${PATIENT_PHONE_SQL} AS phone
    FROM patients p JOIN users u ON u.id = p.user_id
   WHERE COALESCE(p.marketing_opt_out, false) = true AND ${PATIENT_HAS_PHONE_SQL}`;

const activePatientPhonesSql = `
  SELECT DISTINCT ${PATIENT_PHONE_SQL} AS phone
    FROM patients p JOIN users u ON u.id = p.user_id
   WHERE p.merged_into IS NULL AND u.is_active = true AND ${PATIENT_HAS_PHONE_SQL}`;

export type RowStatus = 'new' | 'update' | 'skip';

export interface ImportRow {
  row: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  status: RowStatus;
  reason?: string;
  also_patient?: boolean;
}

export interface ExistingContact {
  id: number;
  phone: string | null;
  email: string | null;
  opted_out: boolean;
}

/**
 * Decide what happens to each spreadsheet row. Pure, so it can be tested
 * without a database.
 */
export const classifyRows = (
  records: Record<string, unknown>[],
  cols: Columns,
  existing: ExistingContact[],
  optedOutPatientPhones: Set<string>,
  patientPhones: Set<string>
): ImportRow[] => {
  const byPhone = new Map(existing.filter((c) => c.phone).map((c) => [c.phone as string, c]));
  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
  const seen = new Set<string>();
  return records.map((rec, i) => {
    let first = cols.first ? cleanName(rec[cols.first]) : '';
    let last = cols.last ? cleanName(rec[cols.last]) : '';
    if (!first && !last && cols.full) {
      const full = cleanName(rec[cols.full]);
      const sp = full.indexOf(' ');
      first = sp === -1 ? full : full.slice(0, sp);
      last = sp === -1 ? '' : full.slice(sp + 1);
    }
    const rawPhone = cols.phone ? rec[cols.phone] : '';
    const phone = normalizeContactPhone(rawPhone);
    const email = cols.email ? cleanEmail(rec[cols.email]) : null;
    const out: ImportRow = { row: i + 2, first_name: first, last_name: last, phone, email, status: 'new' };

    if (!phone && !email) {
      out.status = 'skip';
      out.reason = String(rawPhone ?? '').trim() ? 'Phone number not valid' : 'No phone or email';
      return out;
    }
    const key = phone || `email:${email}`;
    if (seen.has(key)) {
      out.status = 'skip';
      out.reason = 'Listed twice in this file';
      return out;
    }
    seen.add(key);
    if (phone && optedOutPatientPhones.has(phone)) {
      out.status = 'skip';
      out.reason = 'A patient with this number opted out of marketing';
      return out;
    }
    // Same person = same phone; email decides only for rows without a phone.
    const match = (phone ? byPhone.get(phone) : byEmail.get(email as string)) || null;
    if (match) {
      if (match.opted_out) {
        out.status = 'skip';
        out.reason = 'Opted out of marketing';
        return out;
      }
      if (!phone && match.phone) {
        out.status = 'skip';
        out.reason = 'Already in the list';
        return out;
      }
      out.status = 'update';
    }
    if (phone && patientPhones.has(phone)) out.also_patient = true;
    return out;
  });
};

const readSheet = (dataBase64: string): { headers: string[]; records: Record<string, unknown>[] } => {
  const wb = XLSX.read(Buffer.from(dataBase64, 'base64'), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], records: [] };
  const headerRow = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })[0] || []) as unknown[];
  // raw: true keeps phone numbers as numbers, so 233244123456 isn't turned
  // into "2.33244E+11" by the cell's display format.
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true, blankrows: false });
  return { headers: headerRow.map((h) => String(h ?? '')), records };
};

const audit = (req: Request, action: 'create' | 'update' | 'delete' | 'read', entityId: number | undefined, details: Record<string, unknown>) =>
  auditService.log({
    userId: (req as any).user?.id,
    action,
    entityType: 'marketing_contacts',
    entityId,
    details,
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || undefined,
  });

/**
 * POST /marketing/imported-contacts/import
 * { dataBase64, filename, source, consent, commit }
 * Without commit: a preview of what would happen to every row. With commit
 * (and consent): saves it.
 */
export const importMarketingContacts = async (req: Request, res: Response): Promise<void> => {
  const { dataBase64, filename, commit } = req.body || {};
  const source = String(req.body?.source || '').trim().slice(0, 100) || null;
  if (!dataBase64) {
    res.status(400).json({ error: 'Choose a spreadsheet to upload' });
    return;
  }
  let sheet: { headers: string[]; records: Record<string, unknown>[] };
  try {
    sheet = readSheet(String(dataBase64));
  } catch {
    res.status(400).json({ error: 'Could not read that file. Upload an Excel (.xlsx, .xls) or CSV file.' });
    return;
  }
  if (sheet.records.length === 0) {
    res.status(400).json({ error: 'The first sheet of that file is empty' });
    return;
  }
  if (sheet.records.length > MAX_ROWS) {
    res.status(400).json({ error: `That file has ${sheet.records.length.toLocaleString()} rows; split it into files of ${MAX_ROWS.toLocaleString()} or fewer` });
    return;
  }
  const cols = detectContactColumns(sheet.headers);
  if (!cols.phone && !cols.email) {
    res.status(400).json({
      error: 'Could not find a phone or email column. Name the columns e.g. "Name", "Phone", "Email".',
      headers: sheet.headers,
    });
    return;
  }
  if (commit && req.body?.consent !== true) {
    res.status(400).json({ error: 'Confirm that everyone in this file agreed to receive marketing messages' });
    return;
  }

  const client = await pool.connect();
  try {
    if (commit) {
      await client.query('BEGIN');
      // One import at a time, so two uploads of overlapping files can't race.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('marketing_contacts_import'))`);
    }
    const [existing, optedOut, patients] = await Promise.all([
      client.query(`SELECT id, phone, email, opted_out FROM marketing_contacts`),
      client.query(optedOutPatientPhonesSql),
      client.query(activePatientPhonesSql),
    ]);
    const rows = classifyRows(
      sheet.records,
      cols,
      existing.rows,
      new Set(optedOut.rows.map((r) => r.phone)),
      new Set(patients.rows.map((r) => r.phone))
    );
    const summary = {
      rows_in_file: rows.length,
      new: rows.filter((r) => r.status === 'new').length,
      update: rows.filter((r) => r.status === 'update').length,
      skipped: rows.filter((r) => r.status === 'skip').length,
      also_patients: rows.filter((r) => r.status !== 'skip' && r.also_patient).length,
    };

    if (!commit) {
      // Skipped rows first, so problems are visible without scrolling.
      const ordered = [...rows.filter((r) => r.status === 'skip'), ...rows.filter((r) => r.status !== 'skip')];
      res.json({ columns: cols, headers: sheet.headers, summary, rows: ordered.slice(0, PREVIEW_ROWS) });
      return;
    }

    const userId = (req as any).user?.id;
    const imp = await client.query(
      `INSERT INTO marketing_contact_imports (filename, source, rows_in_file, consent_confirmed, imported_by)
       VALUES ($1, $2, $3, true, $4) RETURNING id`,
      [String(filename || '').slice(0, 255) || null, source, rows.length, userId]
    );
    const importId = imp.rows[0].id;
    const keep = rows.filter((r) => r.status !== 'skip');
    const withPhone = keep.filter((r) => r.phone);
    const emailOnly = keep.filter((r) => !r.phone);
    let added = 0;
    let updated = 0;

    const upsert = async (list: ImportRow[], conflict: string) => {
      for (let i = 0; i < list.length; i += 1000) {
        const chunk = list.slice(i, i + 1000);
        const r = await client.query(
          `INSERT INTO marketing_contacts
             (first_name, last_name, phone, email, source, import_id, consent_confirmed_by, consent_confirmed_at)
           SELECT NULLIF(x.first_name, ''), NULLIF(x.last_name, ''), x.phone, x.email, $5, $6, $7, NOW()
             FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[]) AS x(first_name, last_name, phone, email)
           ON CONFLICT ${conflict} DO UPDATE
             SET first_name = COALESCE(EXCLUDED.first_name, marketing_contacts.first_name),
                 last_name = COALESCE(EXCLUDED.last_name, marketing_contacts.last_name),
                 email = COALESCE(EXCLUDED.email, marketing_contacts.email),
                 consent_confirmed_by = EXCLUDED.consent_confirmed_by,
                 consent_confirmed_at = NOW(),
                 updated_at = NOW()
             WHERE marketing_contacts.opted_out = false
           RETURNING (xmax = 0) AS inserted`,
          [
            chunk.map((c) => c.first_name),
            chunk.map((c) => c.last_name),
            chunk.map((c) => c.phone),
            chunk.map((c) => c.email),
            source,
            importId,
            userId,
          ]
        );
        for (const row of r.rows) {
          if (row.inserted) added++;
          else updated++;
        }
      }
    };
    await upsert(withPhone, '(phone) WHERE phone IS NOT NULL');
    await upsert(emailOnly, '((LOWER(email))) WHERE phone IS NULL');

    const skipped = rows.length - added - updated;
    await client.query(
      `UPDATE marketing_contact_imports SET added = $2, updated = $3, skipped = $4 WHERE id = $1`,
      [importId, added, updated, skipped]
    );
    await client.query('COMMIT');
    await audit(req, 'create', importId, { filename, source, rows: rows.length, added, updated, skipped, consent_confirmed: true });
    res.status(201).json({ import_id: importId, added, updated, skipped });
  } catch (error) {
    if (commit) await client.query('ROLLBACK').catch(() => undefined);
    console.error('Import marketing contacts error:', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  } finally {
    client.release();
  }
};

/** GET /marketing/imported-contacts?search=&source=&opted_out=true&page=&limit= */
export const listMarketingContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const optedOut = req.query.opted_out === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim().slice(0, 100) : '';

    const params: any[] = [optedOut];
    const clauses = ['c.opted_out = $1'];
    if (source) {
      params.push(source);
      clauses.push(`c.source = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const parts = [
        `(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) ILIKE $${params.length}`,
        `c.email ILIKE $${params.length}`,
      ];
      let digits = search.replace(/\D/g, '');
      if (digits.startsWith('233')) digits = digits.slice(3);
      else if (digits.startsWith('0')) digits = digits.slice(1);
      if (digits.length >= 3) {
        params.push(`%${digits}%`);
        parts.push(`c.phone LIKE $${params.length}`);
      }
      clauses.push(`(${parts.join(' OR ')})`);
    }

    const [list, counts, sources] = await Promise.all([
      pool.query(
        `SELECT c.id, c.first_name, c.last_name, c.phone, c.email, c.source, c.created_at, c.opted_out_at,
                COUNT(*) OVER()::int AS full_count
           FROM marketing_contacts c
          WHERE ${clauses.join(' AND ')}
          ORDER BY c.last_name NULLS LAST, c.first_name NULLS LAST, c.id
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE NOT opted_out)::int AS total,
                COUNT(*) FILTER (WHERE NOT opted_out AND phone IS NOT NULL)::int AS with_phone,
                COUNT(*) FILTER (WHERE NOT opted_out AND email IS NOT NULL)::int AS with_email,
                COUNT(*) FILTER (WHERE opted_out)::int AS opted_out
           FROM marketing_contacts`
      ),
      pool.query(
        `SELECT source, COUNT(*)::int AS n FROM marketing_contacts
          WHERE source IS NOT NULL AND NOT opted_out GROUP BY source ORDER BY source`
      ),
    ]);
    const total = list.rows[0]?.full_count ?? 0;
    res.json({
      contacts: list.rows.map(({ full_count: _fc, ...c }) => c),
      total,
      page,
      limit,
      summary: counts.rows[0],
      sources: sources.rows,
    });
  } catch (error) {
    console.error('List marketing contacts error:', error);
    res.status(500).json({ error: 'Failed to load imported contacts' });
  }
};

/** PUT /marketing/imported-contacts/:id/opt-out { opted_out } */
export const setMarketingContactOptOut = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const optedOut = req.body?.opted_out;
    if (typeof optedOut !== 'boolean') {
      res.status(400).json({ error: 'opted_out must be true or false' });
      return;
    }
    const result = await pool.query(
      `UPDATE marketing_contacts
          SET opted_out = $2, opted_out_at = CASE WHEN $2 THEN NOW() ELSE NULL END, updated_at = NOW()
        WHERE id = $1 RETURNING id, first_name, last_name, opted_out`,
      [id, optedOut]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    await audit(req, 'update', id, { opted_out: optedOut });
    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('Set marketing contact opt-out error:', error);
    res.status(500).json({ error: 'Failed to update marketing preference' });
  }
};

/** GET /marketing/imported-contacts/imports — upload history. */
export const listMarketingContactImports = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT i.*, u.first_name || ' ' || u.last_name AS imported_by_name,
              (SELECT COUNT(*) FROM marketing_contacts c WHERE c.import_id = i.id)::int AS still_listed
         FROM marketing_contact_imports i
         LEFT JOIN users u ON u.id = i.imported_by
        ORDER BY i.created_at DESC
        LIMIT 50`
    );
    res.json({ imports: result.rows });
  } catch (error) {
    console.error('List marketing contact imports error:', error);
    res.status(500).json({ error: 'Failed to load import history' });
  }
};

/**
 * POST /marketing/imported-contacts/imports/:id/remove — undo a wrong upload.
 * Deletes the contacts that file added. Opted-out ones are kept, so a later
 * upload can't add them back. Unsent campaign messages to the removed
 * contacts are skipped at send time.
 */
export const removeMarketingContactImport = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const imp = await client.query(
      `SELECT id, removed_at FROM marketing_contact_imports WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (imp.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Import not found' });
      return;
    }
    if (imp.rows[0].removed_at) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'This import was already removed' });
      return;
    }
    const del = await client.query(
      `DELETE FROM marketing_contacts WHERE import_id = $1 AND opted_out = false`,
      [id]
    );
    await client.query(
      `UPDATE marketing_contact_imports SET removed_at = NOW(), removed_by = $2 WHERE id = $1`,
      [id, (req as any).user?.id]
    );
    await client.query('COMMIT');
    await audit(req, 'delete', id, { removed_contacts: del.rowCount });
    res.json({ removed: del.rowCount });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Remove marketing contact import error:', error);
    res.status(500).json({ error: 'Failed to remove the import' });
  } finally {
    client.release();
  }
};
