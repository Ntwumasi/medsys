import { Request, Response } from 'express';
import pool from '../database/db';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// Get financial dashboard summary
export const getFinancialSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    const dateFilter = start_date && end_date
      ? `AND i.invoice_date BETWEEN $1 AND $2`
      : `AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'`;

    const params = start_date && end_date ? [start_date, end_date] : [];

    // Revenue summary
    const revenueQuery = `
      SELECT
        COUNT(*) as total_invoices,
        COALESCE(SUM(total_amount), 0) as total_billed,
        COALESCE(SUM(amount_paid), 0) as total_collected,
        COALESCE(SUM(total_amount - COALESCE(amount_paid, 0)), 0) as total_outstanding,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'partial') as partial_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) as paid_amount
      FROM invoices i
      WHERE 1=1 ${dateFilter}
    `;

    const revenueResult = await pool.query(revenueQuery, params);

    // Revenue by category
    const categoryQuery = `
      SELECT
        COALESCE(ii.category, 'Other') as category,
        COUNT(DISTINCT i.id) as invoice_count,
        COALESCE(SUM(ii.total_price), 0) as total_amount
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE 1=1 ${dateFilter.replace('i.invoice_date', 'i.invoice_date')}
      GROUP BY ii.category
      ORDER BY total_amount DESC
    `;

    const categoryResult = await pool.query(categoryQuery, params);

    // Daily revenue for chart (last 30 days)
    const dailyQuery = `
      SELECT
        DATE(i.invoice_date) as date,
        COALESCE(SUM(total_amount), 0) as billed,
        COALESCE(SUM(amount_paid), 0) as collected
      FROM invoices i
      WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(i.invoice_date)
      ORDER BY date
    `;

    const dailyResult = await pool.query(dailyQuery);

    // Top services by revenue
    const topServicesQuery = `
      SELECT
        ii.description,
        COUNT(*) as times_billed,
        COALESCE(SUM(ii.total_price), 0) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE 1=1 ${dateFilter.replace('i.invoice_date', 'i.invoice_date')}
      GROUP BY ii.description
      ORDER BY total_revenue DESC
      LIMIT 10
    `;

    const topServicesResult = await pool.query(topServicesQuery, params);

    // Payment method breakdown
    const paymentMethodQuery = `
      SELECT
        COALESCE(payment_method, 'Unknown') as method,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY payment_method
      ORDER BY total DESC
    `;

    const paymentMethodResult = await pool.query(paymentMethodQuery);

    // Insurance claims summary
    const claimsQuery = `
      SELECT
        COUNT(*) as total_claims,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_claims,
        COUNT(*) FILTER (WHERE status = 'submitted') as submitted_claims,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_claims,
        COUNT(*) FILTER (WHERE status = 'denied') as denied_claims,
        COALESCE(SUM(total_charged), 0) as total_charged,
        COALESCE(SUM(amount_approved), 0) as total_approved,
        COALESCE(SUM(amount_paid), 0) as total_paid
      FROM insurance_claims
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `;

    const claimsResult = await pool.query(claimsQuery);

    res.json({
      summary: revenueResult.rows[0],
      revenue_by_category: categoryResult.rows,
      daily_revenue: dailyResult.rows,
      top_services: topServicesResult.rows,
      payment_methods: paymentMethodResult.rows,
      insurance_claims: claimsResult.rows[0],
    });
  } catch (error) {
    console.error('Get financial summary error:', error);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
};

// Export invoices to Excel
export const exportInvoicesToExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, status } = req.query;

    let query = `
      SELECT
        i.id,
        i.invoice_number,
        i.invoice_date,
        p.patient_number,
        u.first_name || ' ' || u.last_name as patient_name,
        u.phone as patient_phone,
        e.encounter_number,
        e.chief_complaint,
        i.total_amount,
        i.amount_paid,
        (i.total_amount - COALESCE(i.amount_paid, 0)) as balance,
        i.status,
        i.created_at
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN encounters e ON i.encounter_id = e.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND i.invoice_date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND i.invoice_date <= $${paramCount}`;
      params.push(end_date);
    }

    if (status && status !== 'all') {
      paramCount++;
      query += ` AND i.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY i.invoice_date DESC, i.id DESC`;

    const result = await pool.query(query, params);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MedSys';
    workbook.created = new Date();

    // Invoices Summary Sheet
    const summarySheet = workbook.addWorksheet('Invoices');

    // Header styling
    summarySheet.columns = [
      { header: 'Invoice #', key: 'invoice_number', width: 15 },
      { header: 'Date', key: 'invoice_date', width: 12 },
      { header: 'Patient #', key: 'patient_number', width: 15 },
      { header: 'Patient Name', key: 'patient_name', width: 25 },
      { header: 'Phone', key: 'patient_phone', width: 15 },
      { header: 'Encounter #', key: 'encounter_number', width: 15 },
      { header: 'Chief Complaint', key: 'chief_complaint', width: 30 },
      { header: 'Total (GHS)', key: 'total_amount', width: 12 },
      { header: 'Paid (GHS)', key: 'amount_paid', width: 12 },
      { header: 'Balance (GHS)', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    // Style header row
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data rows
    result.rows.forEach((row) => {
      summarySheet.addRow({
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date ? new Date(row.invoice_date).toLocaleDateString() : '',
        patient_number: row.patient_number,
        patient_name: row.patient_name,
        patient_phone: row.patient_phone || '',
        encounter_number: row.encounter_number || '',
        chief_complaint: row.chief_complaint || '',
        total_amount: parseFloat(row.total_amount) || 0,
        amount_paid: parseFloat(row.amount_paid) || 0,
        balance: parseFloat(row.balance) || 0,
        status: row.status?.toUpperCase() || '',
      });
    });

    // Add totals row
    const totalRow = summarySheet.addRow({
      invoice_number: 'TOTALS',
      total_amount: { formula: `SUM(H2:H${result.rows.length + 1})` },
      amount_paid: { formula: `SUM(I2:I${result.rows.length + 1})` },
      balance: { formula: `SUM(J2:J${result.rows.length + 1})` },
    });
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2EFDA' },
    };

    // Format currency columns
    ['H', 'I', 'J'].forEach((col) => {
      summarySheet.getColumn(col).numFmt = '#,##0.00';
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Set response headers
    const filename = `invoices_${start_date || 'all'}_to_${end_date || 'now'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Export invoices error:', error);
    res.status(500).json({ error: 'Failed to export invoices' });
  }
};

// Export detailed invoice with line items
export const exportInvoiceDetailToExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get invoice details
    const invoiceResult = await pool.query(
      `SELECT i.*,
              p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name,
              u.email as patient_email,
              u.phone as patient_phone,
              p.address as patient_address,
              p.city as patient_city,
              e.encounter_number,
              e.chief_complaint,
              e.encounter_date
       FROM invoices i
       JOIN patients p ON i.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN encounters e ON i.encounter_id = e.id
       WHERE i.id = $1`,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsResult = await pool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id`,
      [id]
    );

    // Get payments
    const paymentsResult = await pool.query(
      `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date`,
      [id]
    );

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MedSys';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Invoice');

    // Invoice Header
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'INVOICE';
    sheet.getCell('A1').font = { bold: true, size: 20 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    // Invoice details
    sheet.getCell('A3').value = 'Invoice Number:';
    sheet.getCell('B3').value = invoice.invoice_number;
    sheet.getCell('D3').value = 'Date:';
    sheet.getCell('E3').value = invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString() : '';

    sheet.getCell('A4').value = 'Patient:';
    sheet.getCell('B4').value = invoice.patient_name;
    sheet.getCell('D4').value = 'Patient #:';
    sheet.getCell('E4').value = invoice.patient_number;

    sheet.getCell('A5').value = 'Phone:';
    sheet.getCell('B5').value = invoice.patient_phone || '';
    sheet.getCell('D5').value = 'Encounter:';
    sheet.getCell('E5').value = invoice.encounter_number || '';

    // Line items header (row 8)
    const itemsHeaderRow = 8;
    sheet.getCell(`A${itemsHeaderRow}`).value = 'Description';
    sheet.getCell(`B${itemsHeaderRow}`).value = 'Quantity';
    sheet.getCell(`C${itemsHeaderRow}`).value = 'Unit Price (GHS)';
    sheet.getCell(`D${itemsHeaderRow}`).value = 'Total (GHS)';

    sheet.getRow(itemsHeaderRow).font = { bold: true };
    sheet.getRow(itemsHeaderRow).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    sheet.getRow(itemsHeaderRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add items
    let currentRow = itemsHeaderRow + 1;
    itemsResult.rows.forEach((item) => {
      sheet.getCell(`A${currentRow}`).value = item.description;
      sheet.getCell(`B${currentRow}`).value = item.quantity;
      sheet.getCell(`C${currentRow}`).value = parseFloat(item.unit_price) || 0;
      sheet.getCell(`D${currentRow}`).value = parseFloat(item.total_price) || 0;
      currentRow++;
    });

    // Totals
    currentRow += 1;
    sheet.getCell(`C${currentRow}`).value = 'Subtotal:';
    sheet.getCell(`D${currentRow}`).value = parseFloat(invoice.total_amount) || 0;
    sheet.getRow(currentRow).font = { bold: true };

    currentRow++;
    sheet.getCell(`C${currentRow}`).value = 'Amount Paid:';
    sheet.getCell(`D${currentRow}`).value = parseFloat(invoice.amount_paid) || 0;
    sheet.getCell(`D${currentRow}`).font = { color: { argb: 'FF008000' } };

    currentRow++;
    sheet.getCell(`C${currentRow}`).value = 'Balance Due:';
    sheet.getCell(`D${currentRow}`).value = (parseFloat(invoice.total_amount) || 0) - (parseFloat(invoice.amount_paid) || 0);
    sheet.getRow(currentRow).font = { bold: true };
    if ((parseFloat(invoice.total_amount) || 0) - (parseFloat(invoice.amount_paid) || 0) > 0) {
      sheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
    }

    // Payments section
    if (paymentsResult.rows.length > 0) {
      currentRow += 3;
      sheet.getCell(`A${currentRow}`).value = 'Payment History';
      sheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };

      currentRow++;
      sheet.getCell(`A${currentRow}`).value = 'Date';
      sheet.getCell(`B${currentRow}`).value = 'Method';
      sheet.getCell(`C${currentRow}`).value = 'Reference';
      sheet.getCell(`D${currentRow}`).value = 'Amount (GHS)';
      sheet.getRow(currentRow).font = { bold: true };

      paymentsResult.rows.forEach((payment) => {
        currentRow++;
        sheet.getCell(`A${currentRow}`).value = payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : '';
        sheet.getCell(`B${currentRow}`).value = payment.payment_method || '';
        sheet.getCell(`C${currentRow}`).value = payment.reference_number || '';
        sheet.getCell(`D${currentRow}`).value = parseFloat(payment.amount) || 0;
      });
    }

    // Set column widths
    sheet.columns = [
      { width: 40 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Set response headers
    const filename = `invoice_${invoice.invoice_number}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Export invoice detail error:', error);
    res.status(500).json({ error: 'Failed to export invoice' });
  }
};

// Get aging report
export const getAgingReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = `
      SELECT
        i.id,
        i.invoice_number,
        i.invoice_date,
        p.patient_number,
        u.first_name || ' ' || u.last_name as patient_name,
        i.total_amount,
        COALESCE(i.amount_paid, 0) as amount_paid,
        (i.total_amount - COALESCE(i.amount_paid, 0)) as balance,
        CURRENT_DATE - DATE(i.invoice_date) as days_outstanding,
        CASE
          WHEN CURRENT_DATE - DATE(i.invoice_date) <= 30 THEN '0-30 days'
          WHEN CURRENT_DATE - DATE(i.invoice_date) <= 60 THEN '31-60 days'
          WHEN CURRENT_DATE - DATE(i.invoice_date) <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END as aging_bucket
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE i.status IN ('pending', 'partial')
        AND (i.total_amount - COALESCE(i.amount_paid, 0)) > 0
      ORDER BY days_outstanding DESC
    `;

    const result = await pool.query(query);

    // Calculate summary by bucket
    const summaryQuery = `
      SELECT
        CASE
          WHEN CURRENT_DATE - DATE(invoice_date) <= 30 THEN '0-30 days'
          WHEN CURRENT_DATE - DATE(invoice_date) <= 60 THEN '31-60 days'
          WHEN CURRENT_DATE - DATE(invoice_date) <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END as aging_bucket,
        COUNT(*) as invoice_count,
        COALESCE(SUM(total_amount - COALESCE(amount_paid, 0)), 0) as total_balance
      FROM invoices
      WHERE status IN ('pending', 'partial')
        AND (total_amount - COALESCE(amount_paid, 0)) > 0
      GROUP BY aging_bucket
      ORDER BY
        CASE aging_bucket
          WHEN '0-30 days' THEN 1
          WHEN '31-60 days' THEN 2
          WHEN '61-90 days' THEN 3
          ELSE 4
        END
    `;

    const summaryResult = await pool.query(summaryQuery);

    res.json({
      invoices: result.rows,
      summary: summaryResult.rows,
    });
  } catch (error) {
    console.error('Get aging report error:', error);
    res.status(500).json({ error: 'Failed to fetch aging report' });
  }
};

// Get revenue by payer type
export const getRevenueByPayer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    const dateFilter = start_date && end_date
      ? `AND pay.payment_date BETWEEN $1 AND $2`
      : `AND pay.payment_date >= CURRENT_DATE - INTERVAL '30 days'`;

    const params = start_date && end_date ? [start_date, end_date] : [];

    const query = `
      SELECT
        COALESCE(pps.payer_type, 'self_pay') as payer_type,
        COALESCE(cc.name, ip.name, 'Self Pay') as payer_name,
        COUNT(DISTINCT pay.invoice_id) as invoice_count,
        COALESCE(SUM(pay.amount), 0) as total_collected
      FROM payments pay
      JOIN invoices i ON pay.invoice_id = i.id
      LEFT JOIN patient_payer_sources pps ON i.patient_id = pps.patient_id AND pps.is_primary = true
      LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
      LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
      WHERE 1=1 ${dateFilter}
      GROUP BY pps.payer_type, cc.name, ip.name
      ORDER BY total_collected DESC
    `;

    const result = await pool.query(query, params);

    res.json({
      revenue_by_payer: result.rows,
    });
  } catch (error) {
    console.error('Get revenue by payer error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue by payer' });
  }
};

// Get department-specific revenue
export const getDepartmentRevenue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department } = req.params;
    const { period = 'month' } = req.query;

    // Map department to invoice_items category
    const categoryMap: Record<string, string> = {
      lab: 'lab',
      pharmacy: 'medication',
      imaging: 'imaging',
      nursing: 'procedure',
    };

    const category = categoryMap[department] || department;

    // Calculate date range based on period
    let dateFilter = '';
    switch (period) {
      case 'today':
        dateFilter = "AND i.invoice_date = CURRENT_DATE";
        break;
      case 'week':
        dateFilter = "AND i.invoice_date >= date_trunc('week', CURRENT_DATE)";
        break;
      case 'month':
        dateFilter = "AND i.invoice_date >= date_trunc('month', CURRENT_DATE)";
        break;
      case 'year':
        dateFilter = "AND i.invoice_date >= date_trunc('year', CURRENT_DATE)";
        break;
      default:
        dateFilter = "AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'";
    }

    // Get summary stats
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT i.id) as total_orders,
        COALESCE(SUM(ii.total_price), 0) as total_revenue,
        COUNT(DISTINCT DATE(i.invoice_date)) as active_days,
        COALESCE(AVG(ii.total_price), 0) as avg_order_value
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE ii.category = $1 ${dateFilter}
    `;
    const summaryResult = await pool.query(summaryQuery, [category]);

    // Get daily revenue for the period
    const dailyQuery = `
      SELECT
        DATE(i.invoice_date) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(ii.total_price), 0) as revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE ii.category = $1 ${dateFilter}
      GROUP BY DATE(i.invoice_date)
      ORDER BY date
    `;
    const dailyResult = await pool.query(dailyQuery, [category]);

    // Get top items/services
    const topItemsQuery = `
      SELECT
        ii.description,
        COUNT(*) as times_billed,
        COALESCE(SUM(ii.total_price), 0) as total_revenue,
        COALESCE(AVG(ii.unit_price), 0) as avg_price
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE ii.category = $1 ${dateFilter}
      GROUP BY ii.description
      ORDER BY total_revenue DESC
      LIMIT 10
    `;
    const topItemsResult = await pool.query(topItemsQuery, [category]);

    // Get comparison with previous period
    let prevDateFilter = '';
    switch (period) {
      case 'today':
        prevDateFilter = "AND i.invoice_date = CURRENT_DATE - INTERVAL '1 day'";
        break;
      case 'week':
        prevDateFilter = "AND i.invoice_date >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week' AND i.invoice_date < date_trunc('week', CURRENT_DATE)";
        break;
      case 'month':
        prevDateFilter = "AND i.invoice_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' AND i.invoice_date < date_trunc('month', CURRENT_DATE)";
        break;
      case 'year':
        prevDateFilter = "AND i.invoice_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year' AND i.invoice_date < date_trunc('year', CURRENT_DATE)";
        break;
      default:
        prevDateFilter = "AND i.invoice_date >= CURRENT_DATE - INTERVAL '60 days' AND i.invoice_date < CURRENT_DATE - INTERVAL '30 days'";
    }

    const prevQuery = `
      SELECT COALESCE(SUM(ii.total_price), 0) as prev_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE ii.category = $1 ${prevDateFilter}
    `;
    const prevResult = await pool.query(prevQuery, [category]);

    const currentRevenue = parseFloat(summaryResult.rows[0]?.total_revenue || 0);
    const prevRevenue = parseFloat(prevResult.rows[0]?.prev_revenue || 0);
    const percentChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    res.json({
      department,
      period,
      summary: {
        ...summaryResult.rows[0],
        percent_change: percentChange.toFixed(1),
        trend: percentChange >= 0 ? 'up' : 'down',
      },
      daily_revenue: dailyResult.rows,
      top_items: topItemsResult.rows,
    });
  } catch (error) {
    console.error('Get department revenue error:', error);
    res.status(500).json({ error: 'Failed to fetch department revenue' });
  }
};

// Get line items for drill-down
export const getDepartmentLineItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department } = req.params;
    const { period = 'month', description } = req.query;

    if (!description) {
      res.status(400).json({ error: 'Description is required' });
      return;
    }

    // Map department to invoice_items category
    const categoryMap: Record<string, string> = {
      lab: 'lab',
      pharmacy: 'medication',
      imaging: 'imaging',
      nursing: 'procedure',
    };

    const category = categoryMap[department] || department;

    // Calculate date range based on period
    let dateFilter = '';
    switch (period) {
      case 'today':
        dateFilter = "AND i.invoice_date = CURRENT_DATE";
        break;
      case 'week':
        dateFilter = "AND i.invoice_date >= date_trunc('week', CURRENT_DATE)";
        break;
      case 'month':
        dateFilter = "AND i.invoice_date >= date_trunc('month', CURRENT_DATE)";
        break;
      case 'year':
        dateFilter = "AND i.invoice_date >= date_trunc('year', CURRENT_DATE)";
        break;
      default:
        dateFilter = "AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'";
    }

    const query = `
      SELECT
        ii.id,
        i.invoice_number,
        i.invoice_date,
        u.first_name || ' ' || u.last_name as patient_name,
        p.patient_number,
        ii.description,
        ii.quantity,
        ii.unit_price,
        ii.total_price
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE ii.category = $1
        AND ii.description = $2
        ${dateFilter}
      ORDER BY i.invoice_date DESC, i.id DESC
      LIMIT 100
    `;

    const result = await pool.query(query, [category, description]);

    res.json({
      department,
      period,
      description,
      items: result.rows,
    });
  } catch (error) {
    console.error('Get department line items error:', error);
    res.status(500).json({ error: 'Failed to fetch line items' });
  }
};

// Generate patient statement PDF
export const generatePatientStatement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { start_date, end_date } = req.query;

    // Get patient info
    const patientResult = await pool.query(`
      SELECT p.*, u.first_name, u.last_name, u.email, u.phone
      FROM patients p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `, [patient_id]);

    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const patient = patientResult.rows[0];

    // Build date filter
    let dateFilter = '';
    const params: any[] = [patient_id];
    if (start_date) {
      params.push(start_date);
      dateFilter += ` AND i.invoice_date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      dateFilter += ` AND i.invoice_date <= $${params.length}`;
    }

    // Get unpaid invoices
    const invoicesResult = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.total_amount,
        COALESCE(i.amount_paid, 0) as amount_paid,
        (i.total_amount - COALESCE(i.amount_paid, 0)) as balance,
        i.status,
        e.encounter_number,
        CURRENT_DATE - DATE(i.invoice_date) as days_outstanding
      FROM invoices i
      LEFT JOIN encounters e ON i.encounter_id = e.id
      WHERE i.patient_id = $1
        AND (i.total_amount - COALESCE(i.amount_paid, 0)) > 0
        ${dateFilter}
      ORDER BY i.invoice_date DESC
    `, params);

    // Get line items for each invoice
    const invoiceIds = invoicesResult.rows.map((inv: any) => inv.id);
    let lineItems: any[] = [];
    if (invoiceIds.length > 0) {
      const itemsResult = await pool.query(`
        SELECT
          ii.invoice_id,
          ii.description,
          ii.quantity,
          ii.unit_price,
          ii.total_price
        FROM invoice_items ii
        WHERE ii.invoice_id = ANY($1)
        ORDER BY ii.invoice_id, ii.id
      `, [invoiceIds]);
      lineItems = itemsResult.rows;
    }

    // Get payment history
    const paymentsResult = await pool.query(`
      SELECT
        pay.payment_date,
        pay.amount,
        pay.payment_method,
        pay.reference_number,
        i.invoice_number
      FROM payments pay
      JOIN invoices i ON pay.invoice_id = i.id
      WHERE i.patient_id = $1
      ORDER BY pay.payment_date DESC
      LIMIT 10
    `, [patient_id]);

    // Calculate totals
    const totalBilled = invoicesResult.rows.reduce((sum: number, inv: any) => sum + parseFloat(inv.total_amount), 0);
    const totalPaid = invoicesResult.rows.reduce((sum: number, inv: any) => sum + parseFloat(inv.amount_paid), 0);
    const totalBalance = invoicesResult.rows.reduce((sum: number, inv: any) => sum + parseFloat(inv.balance), 0);

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Set response headers
    const filename = `statement_${patient.patient_number}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe to response
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('PATIENT STATEMENT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text('MedSys Healthcare', { align: 'center' });
    doc.fontSize(10).text('Statement Date: ' + new Date().toLocaleDateString(), { align: 'center' });
    doc.moveDown(1);

    // Patient Info Box
    doc.rect(50, doc.y, 495, 70).stroke();
    const boxY = doc.y + 10;
    doc.fontSize(10).font('Helvetica-Bold').text('Patient Information', 60, boxY);
    doc.font('Helvetica').text(`Name: ${patient.first_name} ${patient.last_name}`, 60, boxY + 15);
    doc.text(`Patient #: ${patient.patient_number}`, 60, boxY + 30);
    doc.text(`Phone: ${patient.phone || 'N/A'}`, 60, boxY + 45);
    doc.text(`Email: ${patient.email || 'N/A'}`, 300, boxY + 15);
    doc.text(`Address: ${patient.address || 'N/A'}`, 300, boxY + 30);
    doc.moveDown(4);

    // Account Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Account Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Billed: GHS ${totalBilled.toFixed(2)}`, { continued: true });
    doc.text(`     Total Paid: GHS ${totalPaid.toFixed(2)}`, { continued: true });
    doc.font('Helvetica-Bold').text(`     Balance Due: GHS ${totalBalance.toFixed(2)}`);
    doc.moveDown(1);

    // Invoices Table
    if (invoicesResult.rows.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Outstanding Invoices');
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Invoice #', 50, tableTop, { width: 80 });
      doc.text('Date', 130, tableTop, { width: 70 });
      doc.text('Description', 200, tableTop, { width: 150 });
      doc.text('Amount', 350, tableTop, { width: 60, align: 'right' });
      doc.text('Paid', 410, tableTop, { width: 60, align: 'right' });
      doc.text('Balance', 470, tableTop, { width: 75, align: 'right' });

      doc.moveTo(50, tableTop + 12).lineTo(545, tableTop + 12).stroke();

      // Table rows
      let rowY = tableTop + 18;
      doc.font('Helvetica').fontSize(9);

      for (const inv of invoicesResult.rows) {
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
        }

        doc.text(inv.invoice_number || `INV-${inv.id}`, 50, rowY, { width: 80 });
        doc.text(new Date(inv.invoice_date).toLocaleDateString(), 130, rowY, { width: 70 });
        doc.text(inv.encounter_number ? `Visit: ${inv.encounter_number}` : 'Medical Services', 200, rowY, { width: 150 });
        doc.text(`GHS ${parseFloat(inv.total_amount).toFixed(2)}`, 350, rowY, { width: 60, align: 'right' });
        doc.text(`GHS ${parseFloat(inv.amount_paid).toFixed(2)}`, 410, rowY, { width: 60, align: 'right' });
        doc.text(`GHS ${parseFloat(inv.balance).toFixed(2)}`, 470, rowY, { width: 75, align: 'right' });
        rowY += 15;
      }

      // Total line
      doc.moveTo(50, rowY).lineTo(545, rowY).stroke();
      rowY += 5;
      doc.font('Helvetica-Bold');
      doc.text('TOTAL DUE:', 350, rowY, { width: 60 });
      doc.text(`GHS ${totalBalance.toFixed(2)}`, 470, rowY, { width: 75, align: 'right' });
      doc.moveDown(2);
    }

    // Payment History
    if (paymentsResult.rows.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Recent Payments');
      doc.moveDown(0.5);

      doc.fontSize(9).font('Helvetica');
      for (const pay of paymentsResult.rows) {
        doc.text(
          `${new Date(pay.payment_date).toLocaleDateString()} - GHS ${parseFloat(pay.amount).toFixed(2)} (${pay.payment_method || 'N/A'}) - Invoice: ${pay.invoice_number}`,
          { indent: 10 }
        );
      }
      doc.moveDown(1);
    }

    // Footer
    doc.fontSize(10).font('Helvetica');
    doc.text('Thank you for choosing MedSys Healthcare.', { align: 'center' });
    doc.text('For questions about this statement, please contact our billing department.', { align: 'center' });

    // Finalize
    doc.end();

  } catch (error) {
    console.error('Generate patient statement error:', error);
    res.status(500).json({ error: 'Failed to generate statement' });
  }
};

// Generate receipt PDF for a payment
export const generateReceipt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { payment_id } = req.params;

    // Get payment with invoice and patient details
    const result = await pool.query(`
      SELECT
        pay.*,
        i.invoice_number,
        i.total_amount as invoice_total,
        i.amount_paid as invoice_paid,
        (i.total_amount - COALESCE(i.amount_paid, 0)) as invoice_balance,
        p.patient_number,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        p.address,
        creator.first_name as created_by_first,
        creator.last_name as created_by_last
      FROM payments pay
      JOIN invoices i ON pay.invoice_id = i.id
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN users creator ON pay.created_by = creator.id
      WHERE pay.id = $1
    `, [payment_id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }

    const payment = result.rows[0];

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A5' });

    // Set response headers
    const filename = `receipt_${payment.reference_number || payment.id}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica').text('MedSys Healthcare', { align: 'center' });
    doc.moveDown(1);

    // Receipt Details
    doc.fontSize(10).font('Helvetica-Bold').text('Receipt #: ', { continued: true });
    doc.font('Helvetica').text(payment.reference_number || `RCP-${payment.id}`);

    doc.font('Helvetica-Bold').text('Date: ', { continued: true });
    doc.font('Helvetica').text(new Date(payment.payment_date).toLocaleDateString());
    doc.moveDown(1);

    // Patient Info
    doc.font('Helvetica-Bold').text('Received From:');
    doc.font('Helvetica').text(`${payment.first_name} ${payment.last_name}`);
    doc.text(`Patient #: ${payment.patient_number}`);
    doc.moveDown(1);

    // Payment Details Box
    doc.rect(40, doc.y, doc.page.width - 80, 80).stroke();
    const boxTop = doc.y + 10;

    doc.fontSize(10).font('Helvetica');
    doc.text(`Invoice: ${payment.invoice_number}`, 50, boxTop);
    doc.text(`Payment Method: ${payment.payment_method || 'N/A'}`, 50, boxTop + 15);
    doc.text(`Reference: ${payment.reference_number || 'N/A'}`, 50, boxTop + 30);

    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`Amount Paid: GHS ${parseFloat(payment.amount).toFixed(2)}`, 50, boxTop + 50);

    doc.moveDown(5);

    // Balance Info
    doc.fontSize(10).font('Helvetica');
    const balanceAfter = parseFloat(payment.invoice_total) - parseFloat(payment.invoice_paid);
    doc.text(`Invoice Total: GHS ${parseFloat(payment.invoice_total).toFixed(2)}`);
    doc.text(`Total Paid: GHS ${parseFloat(payment.invoice_paid).toFixed(2)}`);
    doc.font('Helvetica-Bold').text(`Balance Remaining: GHS ${balanceAfter.toFixed(2)}`);
    doc.moveDown(1);

    // Footer
    if (payment.created_by_first) {
      doc.fontSize(9).font('Helvetica').text(`Processed by: ${payment.created_by_first} ${payment.created_by_last}`);
    }
    doc.moveDown(2);
    doc.fontSize(10).text('Thank you for your payment!', { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('Generate receipt error:', error);
    res.status(500).json({ error: 'Failed to generate receipt' });
  }
};
