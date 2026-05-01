import { Request, Response } from 'express';
import pool from '../database/db';

// Get all receipts (payment records) with filters
export const getAllReceipts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, payment_method, start_date, end_date, limit = '100', offset = '0' } = req.query;

    let query = `
      SELECT p.id, p.invoice_id, p.payment_date, p.amount, p.payment_method,
             p.reference_number, p.notes, p.created_at,
             i.invoice_number, i.total_amount, i.amount_paid, i.status as invoice_status,
             pat.patient_number,
             u.first_name || ' ' || u.last_name as patient_name,
             cu.first_name || ' ' || cu.last_name as received_by
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN patients pat ON i.patient_id = pat.id
      JOIN users u ON pat.user_id = u.id
      LEFT JOIN users cu ON p.created_by = cu.id
    `;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(i.invoice_number ILIKE $${paramIdx} OR u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR pat.patient_number ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (payment_method && payment_method !== 'all') {
      conditions.push(`p.payment_method = $${paramIdx}`);
      params.push(payment_method);
      paramIdx++;
    }

    if (start_date) {
      conditions.push(`p.payment_date >= $${paramIdx}`);
      params.push(start_date);
      paramIdx++;
    }

    if (end_date) {
      conditions.push(`p.payment_date <= $${paramIdx}`);
      params.push(end_date);
      paramIdx++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get stats
    let statsQuery = `
      SELECT
        COUNT(*) as total_receipts,
        COALESCE(SUM(p.amount), 0) as total_collected,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_date = CURRENT_DATE), 0) as collected_today,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_date >= CURRENT_DATE - INTERVAL '7 days'), 0) as collected_week,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as collected_month,
        COUNT(*) FILTER (WHERE p.payment_method = 'cash') as cash_count,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'cash'), 0) as cash_total,
        COUNT(*) FILTER (WHERE p.payment_method = 'card') as card_count,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'card'), 0) as card_total,
        COUNT(*) FILTER (WHERE p.payment_method = 'mobile_money') as momo_count,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'mobile_money'), 0) as momo_total
      FROM payments p
    `;

    // Apply same date filters to stats
    const statsConditions: string[] = [];
    const statsParams: any[] = [];
    let statsParamIdx = 1;

    if (start_date) {
      statsConditions.push(`p.payment_date >= $${statsParamIdx}`);
      statsParams.push(start_date);
      statsParamIdx++;
    }
    if (end_date) {
      statsConditions.push(`p.payment_date <= $${statsParamIdx}`);
      statsParams.push(end_date);
      statsParamIdx++;
    }

    if (statsConditions.length > 0) {
      statsQuery += ' WHERE ' + statsConditions.join(' AND ');
    }

    const statsResult = await pool.query(statsQuery, statsParams);

    res.json({
      receipts: result.rows,
      total: parseInt(result.rows.length > 0 ? result.rows.length.toString() : '0'),
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get a single receipt with full details
export const getReceiptById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.*, i.invoice_number, i.total_amount, i.amount_paid, i.invoice_date,
              i.status as invoice_status, i.patient_id, i.encounter_id,
              pat.patient_number,
              u.first_name || ' ' || u.last_name as patient_name,
              u.email as patient_email, u.phone as patient_phone,
              cu.first_name || ' ' || cu.last_name as received_by
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       JOIN patients pat ON i.patient_id = pat.id
       JOIN users u ON pat.user_id = u.id
       LEFT JOIN users cu ON p.created_by = cu.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    // Get invoice items for context
    const itemsResult = await pool.query(
      `SELECT ii.description, ii.quantity, ii.unit_price, ii.total_price
       FROM invoice_items ii
       WHERE ii.invoice_id = $1
       ORDER BY ii.created_at`,
      [result.rows[0].invoice_id]
    );

    res.json({
      receipt: result.rows[0],
      invoice_items: itemsResult.rows,
    });
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
