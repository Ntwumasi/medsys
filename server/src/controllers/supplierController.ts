import { Request, Response } from 'express';
import pool from '../database/db';

// Get all suppliers
export const getSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, active_only } = req.query;

    let query = `SELECT * FROM suppliers`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (active_only === 'true') {
      conditions.push(`is_active = true`);
    }

    if (search) {
      conditions.push(`(name ILIKE $${params.length + 1} OR contact_person ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY name ASC`;

    const result = await pool.query(query, params);

    res.json({
      suppliers: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
};

// Get single supplier by ID
export const getSupplierById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM pharmacy_inventory WHERE supplier_id = s.id) as product_count
       FROM suppliers s
       WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    res.json({ supplier: result.rows[0] });
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
};

// Create new supplier
export const createSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      contact_person,
      phone,
      email,
      address,
      city,
      notes
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Supplier name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO suppliers (name, contact_person, phone, email, address, city, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, contact_person, phone, email, address, city, notes]
    );

    res.status(201).json({
      message: 'Supplier created successfully',
      supplier: result.rows[0]
    });
  } catch (error: any) {
    console.error('Create supplier error:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'A supplier with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create supplier' });
  }
};

// Update supplier
export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      contact_person,
      phone,
      email,
      address,
      city,
      notes,
      is_active
    } = req.body;

    const result = await pool.query(
      `UPDATE suppliers SET
        name = COALESCE($1, name),
        contact_person = COALESCE($2, contact_person),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        address = COALESCE($5, address),
        city = COALESCE($6, city),
        notes = COALESCE($7, notes),
        is_active = COALESCE($8, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [name, contact_person, phone, email, address, city, notes, is_active, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    res.json({
      message: 'Supplier updated successfully',
      supplier: result.rows[0]
    });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
};

// Delete supplier (soft delete - set inactive)
export const deleteSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if supplier has inventory items
    const inventoryCheck = await pool.query(
      `SELECT COUNT(*) FROM pharmacy_inventory WHERE supplier_id = $1`,
      [id]
    );

    if (parseInt(inventoryCheck.rows[0].count) > 0) {
      // Soft delete - just deactivate
      await pool.query(
        `UPDATE suppliers SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
      res.json({ message: 'Supplier deactivated (has linked inventory items)' });
      return;
    }

    // Hard delete if no linked inventory
    const result = await pool.query(
      `DELETE FROM suppliers WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
};

// Get supplier products (inventory items linked to this supplier)
export const getSupplierProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, medication_name, generic_name, category, quantity_on_hand, unit, selling_price
       FROM pharmacy_inventory
       WHERE supplier_id = $1
       ORDER BY medication_name`,
      [id]
    );

    res.json({
      products: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get supplier products error:', error);
    res.status(500).json({ error: 'Failed to fetch supplier products' });
  }
};
