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
