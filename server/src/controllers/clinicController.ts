import { Request, Response } from 'express';
import pool from '../database/db';

// Get all active clinics
export const getAllClinics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT * FROM clinics WHERE is_active = true ORDER BY name'
    );
    res.json({ clinics: result.rows });
  } catch (error) {
    console.error('Get clinics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new clinic
export const createClinic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, consultation_price } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Clinic name is required' });
      return;
    }

    const price = consultation_price === '' || consultation_price == null ? null : Number(consultation_price);
    if (price !== null && (isNaN(price) || price < 0)) {
      res.status(400).json({ error: 'Consultation price must be a positive number' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO clinics (name, description, consultation_price) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), description?.trim() || null, price]
    );

    res.status(201).json({
      message: 'Clinic created successfully',
      clinic: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A clinic with this name already exists' });
      return;
    }
    console.error('Create clinic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a clinic
export const updateClinic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, consultation_price } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Clinic name is required' });
      return;
    }

    const price = consultation_price === '' || consultation_price == null ? null : Number(consultation_price);
    if (price !== null && (isNaN(price) || price < 0)) {
      res.status(400).json({ error: 'Consultation price must be a positive number' });
      return;
    }

    const result = await pool.query(
      `UPDATE clinics
       SET name = $1, description = $2, consultation_price = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [name.trim(), description?.trim() || null, price, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Clinic not found' });
      return;
    }

    res.json({
      message: 'Clinic updated successfully',
      clinic: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A clinic with this name already exists' });
      return;
    }
    console.error('Update clinic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Deactivate a clinic (soft delete)
export const deactivateClinic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE clinics SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Clinic not found' });
      return;
    }

    res.json({ message: 'Clinic deactivated successfully' });
  } catch (error) {
    console.error('Deactivate clinic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
