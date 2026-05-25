import { Request, Response } from 'express';
import pool from '../database/db';
import { buildSafeUpdateClause } from '../utils/sqlSecurity';

export const createEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const provider_id = authReq.user?.id;

    const {
      patient_id,
      encounter_date,
      encounter_type,
      chief_complaint,
      history_of_present_illness,
      vital_signs,
      physical_examination,
      assessment,
      plan,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO encounters (
        patient_id, provider_id, encounter_date, encounter_type, chief_complaint,
        history_of_present_illness, vital_signs, physical_examination, assessment, plan, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'in-progress')
      RETURNING *`,
      [
        patient_id,
        provider_id,
        encounter_date || new Date(),
        encounter_type,
        chief_complaint,
        history_of_present_illness,
        vital_signs,
        physical_examination,
        assessment,
        plan,
      ]
    );

    res.status(201).json({
      message: 'Encounter created successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Create encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEncounters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, provider_id, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT e.*,
        u.first_name || ' ' || u.last_name as provider_name,
        p.patient_number
      FROM encounters e
      LEFT JOIN users u ON e.provider_id = u.id
      LEFT JOIN patients p ON e.patient_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND e.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (provider_id) {
      query += ` AND e.provider_id = $${paramCount}`;
      params.push(provider_id);
      paramCount++;
    }

    if (status) {
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY e.encounter_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      encounters: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get encounters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEncounterById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.*,
        u.first_name || ' ' || u.last_name as provider_name,
        p.patient_number,
        p.date_of_birth,
        p.gender
      FROM encounters e
      LEFT JOIN users u ON e.provider_id = u.id
      LEFT JOIN patients p ON e.patient_id = p.id
      WHERE e.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    // Get diagnoses for this encounter
    const diagnosesResult = await pool.query(
      `SELECT * FROM diagnoses WHERE encounter_id = $1`,
      [id]
    );

    res.json({
      encounter: result.rows[0],
      diagnoses: diagnosesResult.rows,
    });
  } catch (error) {
    console.error('Get encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { setClause, values } = buildSafeUpdateClause('encounters', updateData, 2);

    const result = await pool.query(
      `UPDATE encounters SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    res.json({
      message: 'Encounter updated successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Update encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addDiagnosis = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id, patient_id, diagnosis_code, diagnosis_description, type, onset_date } = req.body;

    const result = await pool.query(
      `INSERT INTO diagnoses (encounter_id, patient_id, diagnosis_code, diagnosis_description, type, onset_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [encounter_id, patient_id, diagnosis_code, diagnosis_description, type, onset_date]
    );

    res.status(201).json({
      message: 'Diagnosis added successfully',
      diagnosis: result.rows[0],
    });
  } catch (error) {
    console.error('Add diagnosis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Self-pay tier prices. Hardcoded for the Medics Clinic go-live; long-term
// this should live in a `clinic_settings.self_pay_tiers` JSON column so each
// clinic can have its own ladder. Indices 1-5; index 0 is unused.
const SELF_PAY_TIER_PRICES: Record<number, number> = {
  1: 100, 2: 200, 3: 300, 4: 400, 5: 500,
};
const SELF_PAY_LINE_PREFIX = 'Self-Pay Consult — Level';

/**
 * POST /encounters/:id/self-pay-tier
 * Body: { tier: 1|2|3|4|5|null }
 *
 * Sets the encounter's self-pay tier AND replaces the matching invoice
 * line item in one atomic transaction. Pass `null` to clear the tier and
 * remove the line.
 *
 * Idempotent: re-running with the same tier is a no-op (description match
 * deletes old → insert new).
 */
export const setSelfPayTier = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id as string, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid encounter id' });
      return;
    }
    const { tier } = req.body || {};
    if (tier !== null && tier !== undefined && ![1, 2, 3, 4, 5].includes(tier)) {
      res.status(400).json({ error: 'tier must be 1-5 or null' });
      return;
    }

    await client.query('BEGIN');

    // Update the encounter
    const encResult = await client.query(
      `UPDATE encounters
          SET self_pay_tier = $2,
              updated_at    = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, self_pay_tier`,
      [id, tier ?? null]
    );
    if (encResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    // Find the invoice for this encounter (may not exist yet)
    const invoiceRow = await client.query(
      `SELECT id, subtotal, total_amount FROM invoices WHERE encounter_id = $1 LIMIT 1`,
      [id]
    );
    let invoiceId: number | null = null;
    let oldLineDelta = 0;

    if (invoiceRow.rows.length > 0) {
      invoiceId = invoiceRow.rows[0].id;

      // Remove any prior Self-Pay Consult line(s) — there should only ever
      // be one, but delete all to be safe in case of historical dupes.
      const removed = await client.query(
        `DELETE FROM invoice_items
          WHERE invoice_id = $1
            AND description LIKE $2
          RETURNING total_price`,
        [invoiceId, `${SELF_PAY_LINE_PREFIX}%`]
      );
      for (const row of removed.rows) {
        oldLineDelta -= parseFloat(row.total_price || '0');
      }
    }

    // Insert the new tier line + adjust invoice total
    let newPrice = 0;
    if (tier && invoiceId !== null) {
      newPrice = SELF_PAY_TIER_PRICES[tier as 1 | 2 | 3 | 4 | 5];
      const description = `${SELF_PAY_LINE_PREFIX} ${tier}`;
      await client.query(
        `INSERT INTO invoice_items
           (invoice_id, description, quantity, unit_price, total_price, category)
         VALUES ($1, $2, 1, $3, $3, 'consultation')`,
        [invoiceId, description, newPrice]
      );
    }

    if (invoiceId !== null) {
      const delta = oldLineDelta + newPrice;
      if (delta !== 0) {
        await client.query(
          `UPDATE invoices
              SET subtotal     = subtotal + $2,
                  total_amount = total_amount + $2,
                  updated_at   = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [invoiceId, delta]
        );
      }
    }

    await client.query('COMMIT');
    res.json({
      message: tier ? `Self-pay tier set to Level ${tier}` : 'Self-pay tier cleared',
      encounter: encResult.rows[0],
      invoice_id: invoiceId,
      line_price: newPrice,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Set self-pay tier error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

/**
 * POST /encounters/:id/billing-payer
 * Body: { payer_source_id: number }
 *
 * Doctor's Bill flow for insurance/corporate patients: assigns one of the
 * patient's existing payer_sources (insurance provider OR corporate client)
 * to this encounter's invoice. Validates that the payer_source belongs to
 * the same patient as the encounter (no cross-patient billing leaks).
 *
 * For self-pay tiers, use POST /encounters/:id/self-pay-tier instead.
 */
export const setBillingPayer = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const payerSourceId = parseInt(req.body?.payer_source_id, 10);
    if (Number.isNaN(id) || Number.isNaN(payerSourceId)) {
      res.status(400).json({ error: 'encounter id and payer_source_id are required' });
      return;
    }

    const enc = await pool.query(
      `SELECT id, patient_id FROM encounters WHERE id = $1`,
      [id]
    );
    if (enc.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }
    const patientId = enc.rows[0].patient_id;

    // Make sure the payer source belongs to this patient
    const ps = await pool.query(
      `SELECT id, payer_type, patient_id FROM patient_payer_sources WHERE id = $1`,
      [payerSourceId]
    );
    if (ps.rows.length === 0) {
      res.status(404).json({ error: 'Payer source not found' });
      return;
    }
    if (ps.rows[0].patient_id !== patientId) {
      res.status(403).json({ error: 'Payer source does not belong to this patient' });
      return;
    }

    // Find or skip invoice
    const invoiceRow = await pool.query(
      `SELECT id FROM invoices WHERE encounter_id = $1 LIMIT 1`,
      [id]
    );
    if (invoiceRow.rows.length === 0) {
      // No invoice yet — nothing to update server-side. Could be created later.
      res.json({
        message: 'No invoice yet for this encounter — payer assignment will apply when one is created',
        invoice_id: null,
        payer_source_id: payerSourceId,
      });
      return;
    }
    const invoiceId = invoiceRow.rows[0].id;

    await pool.query(
      `UPDATE invoices
          SET payer_source_id = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [invoiceId, payerSourceId]
    );

    res.json({
      message: 'Invoice payer updated',
      invoice_id: invoiceId,
      payer_source_id: payerSourceId,
      payer_type: ps.rows[0].payer_type,
    });
  } catch (error) {
    console.error('Set billing payer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update chief complaint (Today's Visit) - used by nurses
export const updateChiefComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { chief_complaint } = req.body;

    if (!chief_complaint || !chief_complaint.trim()) {
      res.status(400).json({ error: 'Chief complaint is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE encounters SET chief_complaint = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [chief_complaint.trim(), id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    res.json({
      message: 'Chief complaint updated successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Update chief complaint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
