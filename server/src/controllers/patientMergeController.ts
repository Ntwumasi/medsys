import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import pool from '../database/db';
import { auditService } from '../services/auditService';

export class MergeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface MergeOutcome {
  moved: Record<string, number>;
  dropped: Record<string, number>;
  source: { id: number; patient_number: string; user_id: number | null };
  target: { id: number; patient_number: string };
  carecodeOriginStamped: string | null;
}

const isCarecode = (row: { source?: string; patient_number: string }): boolean =>
  row.source === 'carecode' || String(row.patient_number).startsWith('CC-');

/**
 * Merge one patient record into another, INSIDE a transaction the caller has
 * already opened (caller owns BEGIN/COMMIT/ROLLBACK). Re-points every table
 * referencing patient_id, soft-archives the source, disables its login, records
 * a patient_merges row, and — when a CareCode record is absorbed into a native
 * survivor — stamps the survivor's carecode_origin_number so the patient card
 * still shows the legacy provenance. Reversible via the audit trail.
 *
 * Shared by the super-admin HTTP handler and the bulk cleanup script so the
 * destructive logic lives in exactly one place.
 */
export const performPatientMerge = async (
  client: PoolClient,
  sourcePatientId: number,
  targetPatientId: number,
  mergedById: number | null
): Promise<MergeOutcome> => {
  if (!sourcePatientId || !targetPatientId || sourcePatientId === targetPatientId) {
    throw new MergeError(400, 'A distinct source and target patient are required');
  }

  const both = await client.query(
    'SELECT id, patient_number, user_id, source, carecode_origin_number, merged_into FROM patients WHERE id = ANY($1)',
    [[sourcePatientId, targetPatientId]]
  );
  if (both.rows.length !== 2) {
    throw new MergeError(404, 'Patient not found');
  }
  const source = both.rows.find((r: any) => r.id === Number(sourcePatientId));
  const target = both.rows.find((r: any) => r.id === Number(targetPatientId));
  if (source.merged_into || target.merged_into) {
    throw new MergeError(409, 'One of these records has already been merged');
  }

  // Re-point every table referencing patient_id (dynamic — future-proof).
  const tables = (await client.query(
    "SELECT table_name FROM information_schema.columns WHERE column_name = 'patient_id' AND table_schema = 'public'"
  )).rows.map((r: any) => r.table_name);

  const moved: Record<string, number> = {};
  const dropped: Record<string, number> = {};
  for (const t of tables) {
    await client.query('SAVEPOINT sp');
    try {
      const r = await client.query(`UPDATE "${t}" SET patient_id = $1 WHERE patient_id = $2`, [targetPatientId, sourcePatientId]);
      if (r.rowCount) moved[t] = r.rowCount;
      await client.query('RELEASE SAVEPOINT sp');
    } catch {
      // A unique/constraint conflict means the target already has the canonical
      // row — drop the source's duplicate rows for this table instead.
      await client.query('ROLLBACK TO SAVEPOINT sp');
      const d = await client.query(`DELETE FROM "${t}" WHERE patient_id = $1`, [sourcePatientId]);
      if (d.rowCount) dropped[t] = d.rowCount;
      await client.query('RELEASE SAVEPOINT sp');
    }
  }

  // Preserve CareCode provenance: if a CareCode record is absorbed into a native
  // survivor, stamp the survivor so its card still flags the migration.
  let carecodeOriginStamped: string | null = null;
  if (isCarecode(source) && !isCarecode(target) && !target.carecode_origin_number) {
    await client.query('UPDATE patients SET carecode_origin_number = $1 WHERE id = $2', [source.patient_number, targetPatientId]);
    carecodeOriginStamped = source.patient_number;
  }

  // Soft-archive the source patient and disable its (orphaned) login.
  await client.query(
    'UPDATE patients SET merged_into = $1, merged_at = CURRENT_TIMESTAMP, merged_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
    [targetPatientId, mergedById, sourcePatientId]
  );
  if (source.user_id) {
    await client.query('UPDATE users SET is_active = false WHERE id = $1', [source.user_id]);
  }

  await client.query(
    `INSERT INTO patient_merges (source_patient_id, target_patient_id, source_patient_number, target_patient_number, merged_by, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sourcePatientId, targetPatientId, source.patient_number, target.patient_number, mergedById, JSON.stringify({ moved, dropped, carecodeOriginStamped })]
  );

  return {
    moved,
    dropped,
    source: { id: source.id, patient_number: source.patient_number, user_id: source.user_id },
    target: { id: target.id, patient_number: target.patient_number },
    carecodeOriginStamped,
  };
};

// Find likely duplicate patient pairs that aren't already merged.
//
// Exact name + DOB alone missed most real duplicates (it found 6 pairs, 4 of
// them two different walk-ins sharing the 1900-01-01 placeholder DOB, while
// ~50 real pairs differed only in spacing, name order, a DOB typo, or had no
// DOB). Records are compared on normalised keys instead:
//   name   — letters only, lowercased; also an order-insensitive token key so
//            "Mensah Richard" matches "Richard Mensah"
//   phone  — last 9 digits, so +233 24… and 024… match
//   dob    — ignored when missing or the 1900-01-01 placeholder
// A pair is listed when at least two of name / phone / DOB agree. Each pair
// carries the reasons so the reviewer can judge (same phone + DOB with
// different names can be twins; same name + phone with different DOBs can be
// a parent and child or a DOB typo).
export const getDuplicateCandidates = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      WITH p AS (
        SELECT
          pt.id, pt.patient_number, pt.source,
          TRIM(u.first_name) || ' ' || TRIM(u.last_name) AS name,
          u.phone,
          to_char(pt.date_of_birth, 'YYYY-MM-DD') AS dob,
          regexp_replace(LOWER(COALESCE(u.first_name, '') || COALESCE(u.last_name, '')), '[^a-z]', '', 'g') AS name_key,
          (SELECT string_agg(t, ' ' ORDER BY t)
             FROM regexp_split_to_table(
               regexp_replace(LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '[^a-z ]', ' ', 'g'),
               '[[:space:]]+') AS t
            WHERE length(t) > 1) AS name_tokens,
          CASE WHEN length(regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g')) >= 9
               THEN RIGHT(regexp_replace(u.phone, '[^0-9]', '', 'g'), 9) END AS phone_key,
          CASE WHEN pt.date_of_birth > DATE '1901-01-01' THEN pt.date_of_birth END AS dob_key,
          (SELECT COUNT(*) FROM encounters e WHERE e.patient_id = pt.id) AS encounters
        FROM patients pt
        JOIN users u ON pt.user_id = u.id
        WHERE pt.merged_into IS NULL
      ),
      pairs AS (
        SELECT a.*,
          b.id AS b_id, b.patient_number AS b_number, b.source AS b_source, b.name AS b_name,
          b.phone AS b_phone, b.dob AS b_dob, b.encounters AS b_encounters,
          (a.name_key <> '' AND (a.name_key = b.name_key OR a.name_tokens = b.name_tokens)) AS same_name,
          (a.phone_key IS NOT NULL AND a.phone_key = b.phone_key) AS same_phone,
          (a.dob_key IS NOT NULL AND a.dob_key = b.dob_key) AS same_dob,
          (a.dob_key IS NOT NULL AND b.dob_key IS NOT NULL AND a.dob_key <> b.dob_key) AS dob_conflict
        FROM p a
        JOIN p b ON b.id > a.id
      )
      SELECT * FROM pairs
      WHERE (same_name::int + same_phone::int + same_dob::int) >= 2
      ORDER BY (same_name AND same_dob) DESC, same_name DESC, name
    `);

    const side = (r: any, prefix: 'a' | 'b') => prefix === 'a'
      ? { id: r.id, patient_number: r.patient_number, source: r.source, name: r.name, dob: r.dob, phone: r.phone, encounters: Number(r.encounters) }
      : { id: r.b_id, patient_number: r.b_number, source: r.b_source, name: r.b_name, dob: r.b_dob, phone: r.b_phone, encounters: Number(r.b_encounters) };

    const pairs = result.rows.map((r: any) => {
      const a = side(r, 'a');
      const b = side(r, 'b');
      // Suggested survivor: the native (MedSys) record, else the one with more visits.
      const aFirst = a.source !== 'carecode' && b.source === 'carecode'
        ? true
        : b.source !== 'carecode' && a.source === 'carecode'
          ? false
          : a.encounters >= b.encounters;
      const reasons: string[] = [];
      if (r.same_name) reasons.push('Same name');
      if (r.same_dob) reasons.push('Same date of birth');
      if (r.same_phone) reasons.push('Same phone');
      if (r.dob_conflict) reasons.push('Different dates of birth');
      // Strong: name + DOB agree. Anything else needs a human look.
      const confidence: 'strong' | 'review' = r.same_name && r.same_dob ? 'strong' : 'review';
      return {
        name: (aFirst ? a : b).name,
        dob: (aFirst ? a : b).dob,
        reasons,
        confidence,
        survivor: aFirst ? a : b,
        duplicate: aFirst ? b : a,
      };
    });

    res.json({ candidates: pairs });
  } catch (error) {
    console.error('Get duplicate candidates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Merge one patient record into another. Re-points every table that references
// patient_id, soft-archives the source (merged_into), disables its login, and
// records an audit row. Super-admin only; reversible via the audit trail.
export const mergePatients = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as any;
  if (!authReq.user?.is_super_admin) {
    res.status(403).json({ error: 'Only super admins can merge patient records' });
    return;
  }
  const { source_patient_id, target_patient_id } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const outcome = await performPatientMerge(client, Number(source_patient_id), Number(target_patient_id), authReq.user.id);
    await client.query('COMMIT');

    await auditService.log({
      userId: authReq.user.id,
      action: 'update',
      entityType: 'patient_merge',
      entityId: outcome.target.id,
      details: { source: outcome.source.patient_number, target: outcome.target.patient_number, moved: outcome.moved, dropped: outcome.dropped },
    });

    res.json({ message: `Merged ${outcome.source.patient_number} into ${outcome.target.patient_number}`, moved: outcome.moved, dropped: outcome.dropped });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof MergeError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Merge patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};
