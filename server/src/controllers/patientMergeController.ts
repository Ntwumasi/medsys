import { Request, Response } from 'express';
import pool from '../database/db';
import { auditService } from '../services/auditService';

// Find duplicate patient pairs (same name + DOB) that aren't already merged.
// Primary case: a CareCode-imported record colliding with a native record.
export const getDuplicateCandidates = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        a.id AS a_id, a.patient_number AS a_number, a.source AS a_source,
        ua.first_name || ' ' || ua.last_name AS a_name,
        to_char(a.date_of_birth, 'YYYY-MM-DD') AS dob,
        (SELECT COUNT(*) FROM encounters e WHERE e.patient_id = a.id) AS a_encounters,
        b.id AS b_id, b.patient_number AS b_number, b.source AS b_source,
        ub.first_name || ' ' || ub.last_name AS b_name,
        (SELECT COUNT(*) FROM encounters e WHERE e.patient_id = b.id) AS b_encounters
      FROM patients a
      JOIN users ua ON a.user_id = ua.id
      JOIN patients b ON b.id > a.id
        AND LOWER(ua.first_name) = LOWER((SELECT first_name FROM users WHERE id = b.user_id))
        AND LOWER(ua.last_name) = LOWER((SELECT last_name FROM users WHERE id = b.user_id))
        AND a.date_of_birth = b.date_of_birth
      JOIN users ub ON b.user_id = ub.id
      WHERE a.merged_into IS NULL AND b.merged_into IS NULL
      ORDER BY a_name
    `);

    // Present each pair with the native (medsys) record as the suggested survivor.
    const pairs = result.rows.map((r: any) => {
      const aIsNative = r.a_source !== 'carecode';
      const survivor = aIsNative
        ? { id: r.a_id, patient_number: r.a_number, source: r.a_source, encounters: Number(r.a_encounters) }
        : { id: r.b_id, patient_number: r.b_number, source: r.b_source, encounters: Number(r.b_encounters) };
      const duplicate = aIsNative
        ? { id: r.b_id, patient_number: r.b_number, source: r.b_source, encounters: Number(r.b_encounters) }
        : { id: r.a_id, patient_number: r.a_number, source: r.a_source, encounters: Number(r.a_encounters) };
      return { name: r.a_name, dob: r.dob, survivor, duplicate };
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
  if (!source_patient_id || !target_patient_id || source_patient_id === target_patient_id) {
    res.status(400).json({ error: 'A distinct source and target patient are required' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const both = await client.query(
      'SELECT id, patient_number, user_id, merged_into FROM patients WHERE id = ANY($1)',
      [[source_patient_id, target_patient_id]]
    );
    if (both.rows.length !== 2) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    const source = both.rows.find((r: any) => r.id === Number(source_patient_id));
    const target = both.rows.find((r: any) => r.id === Number(target_patient_id));
    if (source.merged_into || target.merged_into) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'One of these records has already been merged' });
      return;
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
        const r = await client.query(`UPDATE "${t}" SET patient_id = $1 WHERE patient_id = $2`, [target_patient_id, source_patient_id]);
        if (r.rowCount) moved[t] = r.rowCount;
        await client.query('RELEASE SAVEPOINT sp');
      } catch {
        // A unique/constraint conflict means the target already has the canonical
        // row — drop the source's duplicate rows for this table instead.
        await client.query('ROLLBACK TO SAVEPOINT sp');
        const d = await client.query(`DELETE FROM "${t}" WHERE patient_id = $1`, [source_patient_id]);
        if (d.rowCount) dropped[t] = d.rowCount;
        await client.query('RELEASE SAVEPOINT sp');
      }
    }

    // Soft-archive the source patient and disable its (orphaned) login.
    await client.query(
      'UPDATE patients SET merged_into = $1, merged_at = CURRENT_TIMESTAMP, merged_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [target_patient_id, authReq.user.id, source_patient_id]
    );
    if (source.user_id) {
      await client.query('UPDATE users SET is_active = false WHERE id = $1', [source.user_id]);
    }

    await client.query(
      `INSERT INTO patient_merges (source_patient_id, target_patient_id, source_patient_number, target_patient_number, merged_by, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [source_patient_id, target_patient_id, source.patient_number, target.patient_number, authReq.user.id, JSON.stringify({ moved, dropped })]
    );

    await client.query('COMMIT');

    await auditService.log({
      userId: authReq.user.id,
      action: 'update',
      entityType: 'patient_merge',
      entityId: Number(target_patient_id),
      details: { source: source.patient_number, target: target.patient_number, moved, dropped },
    });

    res.json({ message: `Merged ${source.patient_number} into ${target.patient_number}`, moved, dropped });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Merge patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};
