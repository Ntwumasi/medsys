import { Request, Response } from 'express';
import pool from '../database/db';

// Dashboard stats
export const getDashboard = async (req: Request, res: Response) => {
  try {
    // Get customer stats
    const customersResult = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id) as total_customers,
        COUNT(DISTINCT CASE WHEN sm.quickbooks_id IS NOT NULL THEN p.id END) as synced_customers
      FROM patients p
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'patient' AND sm.medsys_id = p.id
    `);

    // Get invoice stats
    const invoicesResult = await pool.query(`
      SELECT
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN sm.quickbooks_id IS NOT NULL THEN 1 END) as synced_invoices,
        COUNT(CASE WHEN (i.total_amount - i.amount_paid) > 0 THEN 1 END) as unpaid_invoices
      FROM invoices i
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'invoice' AND sm.medsys_id = i.id
    `);

    // Get payment stats (from payments table)
    const paymentsResult = await pool.query(`
      SELECT
        COUNT(*) as total_payments,
        COUNT(CASE WHEN quickbooks_txn_id IS NOT NULL THEN 1 END) as synced_payments
      FROM payments
    `);

    // Get pending queue items
    const queueResult = await pool.query(`
      SELECT COUNT(*) as pending_items
      FROM quickbooks_request_queue
      WHERE status = 'pending'
    `);

    // Get last sync time
    const lastSyncResult = await pool.query(`
      SELECT MAX(completed_at) as last_sync
      FROM quickbooks_sync_log
      WHERE status = 'success' OR status = 'completed'
    `);

    // Get connection status from config
    const configResult = await pool.query(`
      SELECT is_connected, last_sync_at
      FROM quickbooks_config
      WHERE id = 1
    `);

    const customers = customersResult.rows[0];
    const invoices = invoicesResult.rows[0];
    const payments = paymentsResult.rows[0];
    const config = configResult.rows[0];

    res.json({
      totalCustomers: parseInt(customers.total_customers) || 0,
      syncedCustomers: parseInt(customers.synced_customers) || 0,
      unsyncedCustomers: (parseInt(customers.total_customers) || 0) - (parseInt(customers.synced_customers) || 0),
      totalInvoices: parseInt(invoices.total_invoices) || 0,
      syncedInvoices: parseInt(invoices.synced_invoices) || 0,
      unsyncedInvoices: (parseInt(invoices.total_invoices) || 0) - (parseInt(invoices.synced_invoices) || 0),
      totalPayments: parseInt(payments.total_payments) || 0,
      syncedPayments: parseInt(payments.synced_payments) || 0,
      pendingQueueItems: parseInt(queueResult.rows[0].pending_items) || 0,
      lastSyncTime: lastSyncResult.rows[0]?.last_sync || config?.last_sync_at || null,
      connectionStatus: config?.is_connected ? 'connected' : 'disconnected',
    });
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
};

// Get customers with QB sync status
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;

    let whereClause = '';
    if (filter === 'synced') {
      whereClause = 'AND sm.quickbooks_id IS NOT NULL';
    } else if (filter === 'not_synced') {
      whereClause = 'AND sm.quickbooks_id IS NULL';
    } else if (filter === 'pending') {
      whereClause = 'AND EXISTS (SELECT 1 FROM quickbooks_request_queue q WHERE q.entity_type = \'patient\' AND q.medsys_id = p.id AND q.status = \'pending\')';
    }

    const result = await pool.query(`
      SELECT
        p.id,
        p.patient_number,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        p.address,
        p.city,
        p.state,
        sm.quickbooks_id,
        sm.last_synced_at as quickbooks_synced_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM quickbooks_request_queue q WHERE q.entity_type = 'patient' AND q.medsys_id = p.id AND q.status = 'pending') THEN 'pending'
          WHEN sm.quickbooks_id IS NOT NULL THEN 'synced'
          ELSE 'not_synced'
        END as sync_status,
        COALESCE((SELECT SUM(total_amount - amount_paid) FROM invoices WHERE patient_id = p.id), 0) as outstanding_balance,
        COALESCE((SELECT COUNT(*) FROM invoices WHERE patient_id = p.id), 0) as total_invoices
      FROM patients p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'patient' AND sm.medsys_id = p.id
      WHERE 1=1 ${whereClause}
      ORDER BY u.last_name, u.first_name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
};

// Get customer by ID with details
export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        p.id,
        p.patient_number,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        p.address,
        p.city,
        p.state,
        p.date_of_birth,
        sm.quickbooks_id,
        sm.last_synced_at as quickbooks_synced_at
      FROM patients p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'patient' AND sm.medsys_id = p.id
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get invoices for this customer
    const invoicesResult = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.total_amount,
        i.amount_paid,
        (i.total_amount - i.amount_paid) as balance_due,
        i.status,
        i.created_at,
        sm.quickbooks_id
      FROM invoices i
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'invoice' AND sm.medsys_id = i.id
      WHERE i.patient_id = $1
      ORDER BY i.created_at DESC
      LIMIT 10
    `, [id]);

    res.json({
      ...result.rows[0],
      invoices: invoicesResult.rows,
    });
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ error: 'Failed to get customer' });
  }
};

// Get invoices with QB sync status
export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;

    let whereClause = '';
    if (filter === 'synced') {
      whereClause = 'AND sm.quickbooks_id IS NOT NULL';
    } else if (filter === 'not_synced') {
      whereClause = 'AND sm.quickbooks_id IS NULL';
    } else if (filter === 'unpaid') {
      whereClause = 'AND (i.total_amount - i.amount_paid) > 0';
    } else if (filter === 'overdue') {
      whereClause = 'AND (i.total_amount - i.amount_paid) > 0 AND i.due_date < CURRENT_DATE';
    }

    const result = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.patient_id,
        u.first_name || ' ' || u.last_name as patient_name,
        i.encounter_id,
        i.total_amount,
        i.amount_paid,
        (i.total_amount - i.amount_paid) as balance_due,
        i.status,
        i.due_date,
        i.created_at,
        sm.quickbooks_id,
        sm.last_synced_at as quickbooks_synced_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM quickbooks_request_queue q WHERE q.entity_type = 'invoice' AND q.medsys_id = i.id AND q.status = 'pending') THEN 'pending'
          WHEN sm.quickbooks_id IS NOT NULL THEN 'synced'
          ELSE 'not_synced'
        END as sync_status
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'invoice' AND sm.medsys_id = i.id
      WHERE 1=1 ${whereClause}
      ORDER BY i.created_at DESC
    `);

    // Get line items for each invoice
    const invoicesWithItems = await Promise.all(result.rows.map(async (invoice: { id: number }) => {
      const itemsResult = await pool.query(`
        SELECT
          ii.id,
          ii.description,
          ii.quantity,
          ii.unit_price,
          ii.total_price as total,
          cm.service_code as charge_master_code
        FROM invoice_items ii
        LEFT JOIN charge_master cm ON ii.charge_master_id = cm.id
        WHERE ii.invoice_id = $1
      `, [invoice.id]);
      return { ...invoice, items: itemsResult.rows };
    }));

    res.json(invoicesWithItems);
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
};

// Get invoice by ID
export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        i.*,
        u.first_name || ' ' || u.last_name as patient_name,
        sm.quickbooks_id,
        sm.last_synced_at as quickbooks_synced_at
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'invoice' AND sm.medsys_id = i.id
      WHERE i.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Get line items
    const itemsResult = await pool.query(`
      SELECT
        ii.id,
        ii.description,
        ii.quantity,
        ii.unit_price,
        ii.total_price as total,
        cm.service_code as charge_master_code
      FROM invoice_items ii
      LEFT JOIN charge_master cm ON ii.charge_master_id = cm.id
      WHERE ii.invoice_id = $1
    `, [id]);

    // Get payments
    const paymentsResult = await pool.query(`
      SELECT
        pay.id,
        pay.payment_date,
        pay.amount,
        pay.payment_method,
        pay.reference_number,
        pay.quickbooks_txn_id
      FROM payments pay
      WHERE pay.invoice_id = $1
      ORDER BY pay.payment_date DESC
    `, [id]);

    res.json({
      ...result.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows,
    });
  } catch (error) {
    console.error('Error getting invoice:', error);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
};

// Record payment on invoice
export const recordPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, payment_method, reference_number, notes } = req.body;
    const userId = (req as any).user?.id;

    // Get the invoice
    const invoiceResult = await pool.query(
      'SELECT * FROM invoices WHERE id = $1',
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const currentBalance = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid);

    if (amount > currentBalance) {
      return res.status(400).json({ error: 'Payment amount exceeds balance due' });
    }

    // Insert payment record
    const paymentResult = await pool.query(`
      INSERT INTO payments (invoice_id, payment_date, amount, payment_method, reference_number, notes, created_by)
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, amount, payment_method, reference_number, notes, userId]);

    // Update invoice
    const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(amount);
    const newBalanceDue = parseFloat(invoice.total_amount) - newAmountPaid;
    const newStatus = newBalanceDue <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : invoice.status;

    await pool.query(`
      UPDATE invoices
      SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [newAmountPaid, newStatus, id]);

    // Queue payment to QuickBooks (if connected)
    const configResult = await pool.query('SELECT is_connected FROM quickbooks_config WHERE id = 1');
    if (configResult.rows[0]?.is_connected) {
      await pool.query(`
        INSERT INTO quickbooks_request_queue (operation, entity_type, medsys_id, status, priority, created_at)
        VALUES ('push', 'payment', $1, 'pending', 5, CURRENT_TIMESTAMP)
      `, [paymentResult.rows[0].id]);
    }

    res.json({
      message: 'Payment recorded successfully',
      payment: paymentResult.rows[0],
      invoice: {
        id: invoice.id,
        amount_paid: newAmountPaid,
        balance_due: newBalanceDue,
        status: newStatus,
      }
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

// Get payments with QB sync status
export const getPayments = async (req: Request, res: Response) => {
  try {
    const { filter, method, start, end } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (filter === 'synced') {
      whereClause += ' AND pay.quickbooks_txn_id IS NOT NULL';
    } else if (filter === 'not_synced') {
      whereClause += ' AND pay.quickbooks_txn_id IS NULL';
    }

    if (method && method !== 'all') {
      paramCount++;
      whereClause += ` AND pay.payment_method = $${paramCount}`;
      params.push(method);
    }

    if (start) {
      paramCount++;
      whereClause += ` AND pay.payment_date >= $${paramCount}`;
      params.push(start);
    }

    if (end) {
      paramCount++;
      whereClause += ` AND pay.payment_date <= $${paramCount}`;
      params.push(end);
    }

    const result = await pool.query(`
      SELECT
        pay.id,
        pay.invoice_id,
        i.invoice_number,
        u.first_name || ' ' || u.last_name as patient_name,
        pay.payment_date,
        pay.amount,
        pay.payment_method,
        pay.reference_number,
        pay.notes,
        cu.first_name || ' ' || cu.last_name as created_by_name,
        pay.quickbooks_txn_id,
        pay.quickbooks_synced_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM quickbooks_request_queue q WHERE q.entity_type = 'payment' AND q.medsys_id = pay.id AND q.status = 'pending') THEN 'pending'
          WHEN pay.quickbooks_txn_id IS NOT NULL THEN 'synced'
          ELSE 'not_synced'
        END as sync_status
      FROM payments pay
      JOIN invoices i ON pay.invoice_id = i.id
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN users cu ON pay.created_by = cu.id
      ${whereClause}
      ORDER BY pay.payment_date DESC, pay.id DESC
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
};

// Get services (charge master) with QB sync status
export const getServices = async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;

    let whereClause = 'WHERE cm.is_active = true';
    if (filter === 'synced') {
      whereClause += ' AND sm.quickbooks_id IS NOT NULL';
    } else if (filter === 'not_synced') {
      whereClause += ' AND sm.quickbooks_id IS NULL';
    }

    const result = await pool.query(`
      SELECT
        cm.id,
        cm.service_code as code,
        cm.service_name as name,
        cm.description,
        cm.price,
        cm.category,
        cm.is_active,
        sm.quickbooks_id,
        sm.last_synced_at as quickbooks_synced_at,
        CASE
          WHEN sm.quickbooks_id IS NOT NULL THEN 'synced'
          ELSE 'not_synced'
        END as sync_status
      FROM charge_master cm
      LEFT JOIN quickbooks_sync_map sm ON sm.entity_type = 'service' AND sm.medsys_id = cm.id
      ${whereClause}
      ORDER BY cm.category, cm.service_name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting services:', error);
    res.status(500).json({ error: 'Failed to get services' });
  }
};

// Sync service to QuickBooks
export const syncService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify service exists
    const serviceResult = await pool.query(
      'SELECT * FROM charge_master WHERE id = $1',
      [id]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Queue to QuickBooks
    await pool.query(`
      INSERT INTO quickbooks_request_queue (operation, entity_type, medsys_id, status, priority, created_at)
      VALUES ('push', 'service', $1, 'pending', 5, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `, [id]);

    res.json({ message: 'Service queued for sync' });
  } catch (error) {
    console.error('Error syncing service:', error);
    res.status(500).json({ error: 'Failed to sync service' });
  }
};
