import { Request, Response } from 'express';
import pool from '../database/db';

// Corporate Clients
export const getCorporateClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT
        cc.*,
        u.first_name || ' ' || u.last_name as assigned_doctor_name
       FROM corporate_clients cc
       LEFT JOIN users u ON cc.assigned_doctor_id = u.id
       WHERE cc.is_active = true
       ORDER BY cc.name ASC`
    );

    res.json({
      corporate_clients: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get corporate clients error:', error);
    res.status(500).json({ error: 'Failed to fetch corporate clients' });
  }
};

export const createCorporateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, contact_person, contact_email, contact_phone, address, assigned_doctor_id } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Corporate client name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO corporate_clients (name, contact_person, contact_email, contact_phone, address, assigned_doctor_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, contact_person, contact_email, contact_phone, address, assigned_doctor_id || null]
    );

    res.status(201).json({
      message: 'Corporate client created successfully',
      corporate_client: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create corporate client error:', error);

    if (error.code === '23505') {
      res.status(409).json({
        error: 'Corporate client already exists',
        message: 'A corporate client with this name already exists.',
      });
      return;
    }

    res.status(500).json({ error: 'Failed to create corporate client' });
  }
};

export const updateCorporateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, contact_person, contact_email, contact_phone, address, is_active, assigned_doctor_id } = req.body;

    const result = await pool.query(
      `UPDATE corporate_clients
       SET name = COALESCE($1, name),
           contact_person = COALESCE($2, contact_person),
           contact_email = COALESCE($3, contact_email),
           contact_phone = COALESCE($4, contact_phone),
           address = COALESCE($5, address),
           is_active = COALESCE($6, is_active),
           assigned_doctor_id = COALESCE($7, assigned_doctor_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, contact_person, contact_email, contact_phone, address, is_active, assigned_doctor_id, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Corporate client not found' });
      return;
    }

    res.json({
      message: 'Corporate client updated successfully',
      corporate_client: result.rows[0],
    });
  } catch (error) {
    console.error('Update corporate client error:', error);
    res.status(500).json({ error: 'Failed to update corporate client' });
  }
};

export const deleteCorporateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Soft delete by setting is_active to false
    const result = await pool.query(
      `UPDATE corporate_clients SET is_active = false WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Corporate client not found' });
      return;
    }

    res.json({ message: 'Corporate client deactivated successfully' });
  } catch (error) {
    console.error('Delete corporate client error:', error);
    res.status(500).json({ error: 'Failed to deactivate corporate client' });
  }
};

// Insurance Providers
export const getInsuranceProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT * FROM insurance_providers WHERE is_active = true ORDER BY name ASC`
    );

    res.json({
      insurance_providers: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get insurance providers error:', error);
    res.status(500).json({ error: 'Failed to fetch insurance providers' });
  }
};

export const createInsuranceProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, contact_person, contact_email, contact_phone, address } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Insurance provider name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO insurance_providers (name, contact_person, contact_email, contact_phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, contact_person, contact_email, contact_phone, address]
    );

    res.status(201).json({
      message: 'Insurance provider created successfully',
      insurance_provider: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create insurance provider error:', error);

    if (error.code === '23505') {
      res.status(409).json({
        error: 'Insurance provider already exists',
        message: 'An insurance provider with this name already exists.',
      });
      return;
    }

    res.status(500).json({ error: 'Failed to create insurance provider' });
  }
};

export const updateInsuranceProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, contact_person, contact_email, contact_phone, address, is_active } = req.body;

    const result = await pool.query(
      `UPDATE insurance_providers
       SET name = COALESCE($1, name),
           contact_person = COALESCE($2, contact_person),
           contact_email = COALESCE($3, contact_email),
           contact_phone = COALESCE($4, contact_phone),
           address = COALESCE($5, address),
           is_active = COALESCE($6, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [name, contact_person, contact_email, contact_phone, address, is_active, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Insurance provider not found' });
      return;
    }

    res.json({
      message: 'Insurance provider updated successfully',
      insurance_provider: result.rows[0],
    });
  } catch (error) {
    console.error('Update insurance provider error:', error);
    res.status(500).json({ error: 'Failed to update insurance provider' });
  }
};

export const deleteInsuranceProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Soft delete by setting is_active to false
    const result = await pool.query(
      `UPDATE insurance_providers SET is_active = false WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Insurance provider not found' });
      return;
    }

    res.json({ message: 'Insurance provider deactivated successfully' });
  } catch (error) {
    console.error('Delete insurance provider error:', error);
    res.status(500).json({ error: 'Failed to deactivate insurance provider' });
  }
};

// Get patient payer sources
export const getPatientPayerSources = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;

    const result = await pool.query(
      `SELECT
        pps.*,
        cc.name as corporate_client_name,
        ip.name as insurance_provider_name
       FROM patient_payer_sources pps
       LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
       LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
       WHERE pps.patient_id = $1
       ORDER BY pps.is_primary DESC, pps.created_at ASC`,
      [patient_id]
    );

    res.json({
      payer_sources: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get patient payer sources error:', error);
    res.status(500).json({ error: 'Failed to fetch patient payer sources' });
  }
};

// Update patient payer sources (replace all with new set)
export const updatePatientPayerSources = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { payer_sources } = req.body;

    if (!Array.isArray(payer_sources)) {
      res.status(400).json({ error: 'payer_sources must be an array' });
      return;
    }

    // Normalise the incoming sources so corp/insurer ids only live on the
    // matching payer_type (satisfies the valid_payer_source CHECK).
    const incoming = payer_sources.map((ps: any) => ({
      payer_type: ps.payer_type,
      corporate_client_id: ps.payer_type === 'corporate' ? ps.corporate_client_id : null,
      insurance_provider_id: ps.payer_type === 'insurance' ? ps.insurance_provider_id : null,
    }));
    // Exactly ONE may be primary (DB enforces via uniq_primary_payer_per_patient).
    const explicitPrimary = payer_sources.findIndex((ps: any) => ps.is_primary === true);
    const primaryIndex = explicitPrimary >= 0 ? explicitPrimary : 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // We RECONCILE rather than delete-all-then-reinsert: an invoice's
      // payer_source_id references these rows (FK is NO ACTION), so blindly
      // deleting a referenced source throws a FK violation and would also
      // orphan the invoice's record of which payer it was billed to. Instead:
      // reuse matching rows, insert genuinely new ones, and only delete rows
      // that are both no longer wanted AND not referenced by any invoice.
      const existingRes = await client.query(
        `SELECT id, payer_type, corporate_client_id, insurance_provider_id
           FROM patient_payer_sources WHERE patient_id = $1`,
        [patient_id]
      );
      const existing = existingRes.rows as Array<{
        id: number; payer_type: string; corporate_client_id: number | null; insurance_provider_id: number | null;
      }>;

      // Clear all primaries first so we never trip the single-primary unique
      // index while shuffling rows around.
      await client.query(
        `UPDATE patient_payer_sources SET is_primary = false WHERE patient_id = $1`,
        [patient_id]
      );

      const matches = (a: typeof incoming[number], b: typeof existing[number]) =>
        a.payer_type === b.payer_type &&
        (a.corporate_client_id ?? null) === (b.corporate_client_id ?? null) &&
        (a.insurance_provider_id ?? null) === (b.insurance_provider_id ?? null);

      const usedExistingIds = new Set<number>();
      const rowIds: number[] = []; // resolved row id per incoming index

      for (const src of incoming) {
        const match = existing.find((e) => !usedExistingIds.has(e.id) && matches(src, e));
        if (match) {
          usedExistingIds.add(match.id);
          rowIds.push(match.id);
        } else {
          const ins = await client.query(
            `INSERT INTO patient_payer_sources (patient_id, payer_type, corporate_client_id, insurance_provider_id, is_primary)
             VALUES ($1, $2, $3, $4, false) RETURNING id`,
            [patient_id, src.payer_type, src.corporate_client_id, src.insurance_provider_id]
          );
          rowIds.push(ins.rows[0].id);
        }
      }

      // Remove existing rows that are no longer wanted — but keep any still
      // referenced by an invoice (they become historical, non-primary rows).
      const stale = existing.filter((e) => !usedExistingIds.has(e.id));
      if (stale.length > 0) {
        const staleIds = stale.map((e) => e.id);
        const refRes = await client.query(
          `SELECT DISTINCT payer_source_id FROM invoices WHERE payer_source_id = ANY($1::int[])`,
          [staleIds]
        );
        const referenced = new Set<number>(refRes.rows.map((r: any) => r.payer_source_id));
        const deletable = staleIds.filter((id) => !referenced.has(id));
        if (deletable.length > 0) {
          await client.query(
            `DELETE FROM patient_payer_sources WHERE id = ANY($1::int[])`,
            [deletable]
          );
        }
      }

      // Set the single primary among the desired set.
      if (rowIds.length > 0) {
        await client.query(
          `UPDATE patient_payer_sources SET is_primary = true WHERE id = $1`,
          [rowIds[Math.min(primaryIndex, rowIds.length - 1)]]
        );
      }

      await client.query('COMMIT');

      // Return updated payer sources
      const result = await pool.query(
        `SELECT pps.*, cc.name as corporate_client_name, ip.name as insurance_provider_name
         FROM patient_payer_sources pps
         LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
         LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
         WHERE pps.patient_id = $1
         ORDER BY pps.is_primary DESC`,
        [patient_id]
      );

      res.json({ payer_sources: result.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update patient payer sources error:', error);
    res.status(500).json({ error: 'Failed to update patient payer sources' });
  }
};

// ===== Staff health-package benefit =====

// Get a staff patient's package cap + live usage for the current period.
export const getStaffBenefit = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;

    const benefit = await pool.query(
      `SELECT annual_limit, period_start, notes FROM staff_benefits WHERE patient_id = $1`,
      [patient_id]
    );

    if (benefit.rows.length === 0) {
      res.json({ benefit: null, used: 0, remaining: 0 });
      return;
    }

    const row = benefit.rows[0];
    const limit = parseFloat(row.annual_limit) || 0;

    // Usage = total billed to this patient since the period start (live, no counter).
    const usage = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as used
       FROM invoices
       WHERE patient_id = $1 AND invoice_date >= $2 AND status <> 'cancelled'`,
      [patient_id, row.period_start]
    );
    const used = parseFloat(usage.rows[0].used) || 0;

    res.json({
      benefit: { annual_limit: limit, period_start: row.period_start, notes: row.notes },
      used,
      remaining: Math.max(0, limit - used),
    });
  } catch (error) {
    console.error('Get staff benefit error:', error);
    res.status(500).json({ error: 'Failed to fetch staff benefit' });
  }
};

// Set/clear a staff patient's annual package amount.
export const upsertStaffBenefit = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { annual_limit, notes } = req.body;

    const limit = parseFloat(annual_limit);
    if (!Number.isFinite(limit) || limit < 0) {
      res.status(400).json({ error: 'Invalid package amount.' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO staff_benefits (patient_id, annual_limit, notes, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (patient_id)
       DO UPDATE SET annual_limit = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [patient_id, limit, notes || null]
    );

    res.json({ benefit: result.rows[0] });
  } catch (error) {
    console.error('Upsert staff benefit error:', error);
    res.status(500).json({ error: 'Failed to save staff benefit' });
  }
};
