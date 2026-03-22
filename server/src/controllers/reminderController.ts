import { Request, Response } from 'express';
import { Pool } from 'pg';
import { sendSMS, isSMSConfigured, validatePhoneNumber } from '../services/smsService';
import { sendEmail, isEmailConfigured, validateEmail, textToHtml } from '../services/emailService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Get all outstanding invoices eligible for reminders
 */
export const getOutstandingInvoices = async (req: Request, res: Response) => {
  try {
    const { aging_bucket, search } = req.query;

    let whereClause = `WHERE i.status IN ('pending', 'partial') AND (i.total_amount - COALESCE(i.amount_paid, 0)) > 0`;

    if (aging_bucket && aging_bucket !== 'all') {
      switch (aging_bucket) {
        case '0-30':
          whereClause += ` AND CURRENT_DATE - DATE(i.invoice_date) <= 30`;
          break;
        case '31-60':
          whereClause += ` AND CURRENT_DATE - DATE(i.invoice_date) BETWEEN 31 AND 60`;
          break;
        case '61-90':
          whereClause += ` AND CURRENT_DATE - DATE(i.invoice_date) BETWEEN 61 AND 90`;
          break;
        case '90+':
          whereClause += ` AND CURRENT_DATE - DATE(i.invoice_date) > 90`;
          break;
      }
    }

    if (search) {
      whereClause += ` AND (
        u.first_name ILIKE $1 OR
        u.last_name ILIKE $1 OR
        i.invoice_number ILIKE $1 OR
        p.patient_number ILIKE $1
      )`;
    }

    const query = `
      SELECT
        i.id,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.total_amount,
        COALESCE(i.amount_paid, 0) as amount_paid,
        (i.total_amount - COALESCE(i.amount_paid, 0)) as balance,
        i.status,
        i.last_reminder_sent,
        i.reminder_count,
        i.next_reminder_date,
        CURRENT_DATE - DATE(i.invoice_date) as days_outstanding,
        CASE
          WHEN CURRENT_DATE - DATE(i.invoice_date) <= 30 THEN '0-30 days'
          WHEN CURRENT_DATE - DATE(i.invoice_date) <= 60 THEN '31-60 days'
          WHEN CURRENT_DATE - DATE(i.invoice_date) <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END as aging_bucket,
        p.id as patient_id,
        p.patient_number,
        u.first_name || ' ' || u.last_name as patient_name,
        u.email as patient_email,
        u.phone as patient_phone
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      ${whereClause}
      ORDER BY days_outstanding DESC, i.invoice_date ASC
    `;

    const result = await pool.query(query, search ? [`%${search}%`] : []);

    // Get summary stats
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE CURRENT_DATE - DATE(invoice_date) <= 30) as bucket_0_30,
        COUNT(*) FILTER (WHERE CURRENT_DATE - DATE(invoice_date) BETWEEN 31 AND 60) as bucket_31_60,
        COUNT(*) FILTER (WHERE CURRENT_DATE - DATE(invoice_date) BETWEEN 61 AND 90) as bucket_61_90,
        COUNT(*) FILTER (WHERE CURRENT_DATE - DATE(invoice_date) > 90) as bucket_90_plus,
        COALESCE(SUM(total_amount - COALESCE(amount_paid, 0)), 0) as total_outstanding,
        COUNT(*) as total_invoices
      FROM invoices
      WHERE status IN ('pending', 'partial')
        AND (total_amount - COALESCE(amount_paid, 0)) > 0
    `;
    const summaryResult = await pool.query(summaryQuery);

    res.json({
      invoices: result.rows,
      summary: summaryResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching outstanding invoices:', error);
    res.status(500).json({ error: 'Failed to fetch outstanding invoices' });
  }
};

/**
 * Get reminder settings
 */
export const getReminderSettings = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT setting_key, setting_value, description
      FROM reminder_settings
      ORDER BY setting_key
    `);

    // Convert to object for easier frontend use
    const settings: Record<string, string> = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    // Add integration status
    settings['sms_configured'] = isSMSConfigured() ? 'true' : 'false';
    settings['email_configured'] = isEmailConfigured() ? 'true' : 'false';

    res.json(settings);
  } catch (error) {
    console.error('Error fetching reminder settings:', error);
    res.status(500).json({ error: 'Failed to fetch reminder settings' });
  }
};

/**
 * Update reminder settings
 */
export const updateReminderSettings = async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      // Skip read-only settings
      if (key === 'sms_configured' || key === 'email_configured') continue;

      await pool.query(`
        INSERT INTO reminder_settings (setting_key, setting_value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    }

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating reminder settings:', error);
    res.status(500).json({ error: 'Failed to update reminder settings' });
  }
};

/**
 * Send a reminder for a specific invoice
 */
export const sendReminder = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { invoiceId, reminderType, customMessage } = req.body;
    const userId = (req as any).user?.id;

    // Get invoice and patient details
    const invoiceResult = await client.query(`
      SELECT
        i.*,
        p.id as patient_id,
        p.patient_number,
        u.first_name,
        u.last_name,
        u.email,
        u.phone
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const balance = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid || 0);

    // Get message template
    const settingsResult = await client.query(`
      SELECT setting_key, setting_value FROM reminder_settings
      WHERE setting_key IN ('reminder_template_sms', 'reminder_template_email_subject', 'reminder_template_email_body')
    `);

    const templates: Record<string, string> = {};
    settingsResult.rows.forEach(row => {
      templates[row.setting_key] = row.setting_value;
    });

    // Replace template variables
    const replaceVars = (text: string) => {
      return text
        .replace(/{patient_name}/g, `${invoice.first_name} ${invoice.last_name}`)
        .replace(/{invoice_number}/g, invoice.invoice_number)
        .replace(/{invoice_date}/g, new Date(invoice.invoice_date).toLocaleDateString())
        .replace(/{amount}/g, balance.toFixed(2))
        .replace(/{due_date}/g, invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A');
    };

    const results: any[] = [];
    const reminderNumber = (invoice.reminder_count || 0) + 1;

    // Send SMS if requested
    if (reminderType === 'sms' || reminderType === 'both') {
      const phone = invoice.phone;
      const phoneValidation = validatePhoneNumber(phone || '');

      if (!phone || !phoneValidation.valid) {
        results.push({
          type: 'sms',
          success: false,
          error: 'Invalid or missing phone number'
        });
      } else {
        const message = customMessage || replaceVars(templates['reminder_template_sms'] || '');

        // Send SMS (stub)
        const smsResult = await sendSMS(phoneValidation.formatted, message);

        // Record the reminder
        await client.query(`
          INSERT INTO payment_reminders
            (invoice_id, patient_id, reminder_type, reminder_number, contact_method, message, status, sent_at, created_by)
          VALUES ($1, $2, 'sms', $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
        `, [
          invoiceId,
          invoice.patient_id,
          reminderNumber,
          phoneValidation.formatted,
          message,
          smsResult.success ? 'sent' : 'failed',
          userId
        ]);

        results.push({
          type: 'sms',
          success: smsResult.success,
          messageId: smsResult.messageId,
          phone: phoneValidation.formatted
        });
      }
    }

    // Send Email if requested
    if (reminderType === 'email' || reminderType === 'both') {
      const email = invoice.email;

      if (!email || !validateEmail(email)) {
        results.push({
          type: 'email',
          success: false,
          error: 'Invalid or missing email address'
        });
      } else {
        const subject = replaceVars(templates['reminder_template_email_subject'] || 'Payment Reminder');
        const body = customMessage || replaceVars(templates['reminder_template_email_body'] || '');

        // Send Email (stub)
        const emailResult = await sendEmail(email, subject, body, textToHtml(body));

        // Record the reminder
        await client.query(`
          INSERT INTO payment_reminders
            (invoice_id, patient_id, reminder_type, reminder_number, contact_method, message, status, sent_at, created_by)
          VALUES ($1, $2, 'email', $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
        `, [
          invoiceId,
          invoice.patient_id,
          reminderNumber,
          email,
          body,
          emailResult.success ? 'sent' : 'failed',
          userId
        ]);

        results.push({
          type: 'email',
          success: emailResult.success,
          messageId: emailResult.messageId,
          email: email
        });
      }
    }

    // Update invoice reminder tracking
    const anySuccess = results.some(r => r.success);
    if (anySuccess) {
      // Get settings for next reminder calculation
      const daysSettings = await client.query(`
        SELECT setting_key, setting_value FROM reminder_settings
        WHERE setting_key IN ('first_reminder_days', 'second_reminder_days', 'third_reminder_days')
      `);

      const days: Record<string, number> = {};
      daysSettings.rows.forEach(row => {
        days[row.setting_key] = parseInt(row.setting_value) || 7;
      });

      // Calculate next reminder date based on reminder count
      let nextReminderDays = 0;
      if (reminderNumber === 1) {
        nextReminderDays = days['second_reminder_days'] || 14;
      } else if (reminderNumber === 2) {
        nextReminderDays = days['third_reminder_days'] || 30;
      } else {
        nextReminderDays = 30; // After 3rd, repeat every 30 days
      }

      await client.query(`
        UPDATE invoices
        SET
          last_reminder_sent = CURRENT_TIMESTAMP,
          reminder_count = $2,
          next_reminder_date = CURRENT_DATE + $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [invoiceId, reminderNumber, nextReminderDays]);
    }

    res.json({
      success: anySuccess,
      results,
      reminderNumber
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  } finally {
    client.release();
  }
};

/**
 * Send reminders in bulk
 */
export const sendBulkReminders = async (req: Request, res: Response) => {
  try {
    const { invoiceIds, reminderType } = req.body;
    const userId = (req as any).user?.id;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'No invoices selected' });
    }

    const results: any[] = [];

    for (const invoiceId of invoiceIds) {
      try {
        // Simulate the request/response for each invoice
        const mockReq = {
          body: { invoiceId, reminderType },
          user: { id: userId }
        };

        const mockRes = {
          json: (data: any) => results.push({ invoiceId, ...data }),
          status: (code: number) => ({
            json: (data: any) => results.push({ invoiceId, error: data.error, statusCode: code })
          })
        };

        await sendReminder(mockReq as any, mockRes as any);
      } catch (error: any) {
        results.push({ invoiceId, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: successCount > 0,
      total: invoiceIds.length,
      sent: successCount,
      failed: invoiceIds.length - successCount,
      results
    });
  } catch (error) {
    console.error('Error sending bulk reminders:', error);
    res.status(500).json({ error: 'Failed to send bulk reminders' });
  }
};

/**
 * Get reminder history for an invoice
 */
export const getReminderHistory = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    const result = await pool.query(`
      SELECT
        pr.*,
        u.first_name || ' ' || u.last_name as sent_by_name
      FROM payment_reminders pr
      LEFT JOIN users u ON pr.created_by = u.id
      WHERE pr.invoice_id = $1
      ORDER BY pr.created_at DESC
    `, [invoiceId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching reminder history:', error);
    res.status(500).json({ error: 'Failed to fetch reminder history' });
  }
};

/**
 * Get reminder statistics
 */
export const getReminderStats = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_reminders,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        COUNT(*) FILTER (WHERE reminder_type = 'sms') as sms_count,
        COUNT(*) FILTER (WHERE reminder_type = 'email') as email_count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as month_count
      FROM payment_reminders
    `);

    // Get recent activity
    const recentResult = await pool.query(`
      SELECT
        pr.id,
        pr.reminder_type,
        pr.status,
        pr.contact_method,
        pr.created_at,
        i.invoice_number,
        u.first_name || ' ' || u.last_name as patient_name
      FROM payment_reminders pr
      JOIN invoices i ON pr.invoice_id = i.id
      JOIN patients p ON pr.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      ORDER BY pr.created_at DESC
      LIMIT 10
    `);

    res.json({
      stats: result.rows[0],
      recent: recentResult.rows
    });
  } catch (error) {
    console.error('Error fetching reminder stats:', error);
    res.status(500).json({ error: 'Failed to fetch reminder stats' });
  }
};

/**
 * Preview a reminder message
 */
export const previewReminder = async (req: Request, res: Response) => {
  try {
    const { invoiceId, reminderType } = req.query;

    // Get invoice and patient details
    const invoiceResult = await pool.query(`
      SELECT
        i.*,
        p.id as patient_id,
        p.patient_number,
        u.first_name,
        u.last_name,
        u.email,
        u.phone
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const balance = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid || 0);

    // Get message templates
    const settingsResult = await pool.query(`
      SELECT setting_key, setting_value FROM reminder_settings
      WHERE setting_key IN ('reminder_template_sms', 'reminder_template_email_subject', 'reminder_template_email_body')
    `);

    const templates: Record<string, string> = {};
    settingsResult.rows.forEach(row => {
      templates[row.setting_key] = row.setting_value;
    });

    // Replace template variables
    const replaceVars = (text: string) => {
      return text
        .replace(/{patient_name}/g, `${invoice.first_name} ${invoice.last_name}`)
        .replace(/{invoice_number}/g, invoice.invoice_number)
        .replace(/{invoice_date}/g, new Date(invoice.invoice_date).toLocaleDateString())
        .replace(/{amount}/g, balance.toFixed(2))
        .replace(/{due_date}/g, invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A');
    };

    const preview: any = {
      patient: {
        name: `${invoice.first_name} ${invoice.last_name}`,
        phone: invoice.phone,
        email: invoice.email,
        phoneValid: invoice.phone ? validatePhoneNumber(invoice.phone).valid : false,
        emailValid: invoice.email ? validateEmail(invoice.email) : false
      },
      invoice: {
        number: invoice.invoice_number,
        date: invoice.invoice_date,
        dueDate: invoice.due_date,
        total: parseFloat(invoice.total_amount),
        paid: parseFloat(invoice.amount_paid || 0),
        balance: balance,
        reminderCount: invoice.reminder_count || 0,
        lastReminder: invoice.last_reminder_sent
      }
    };

    if (reminderType === 'sms' || reminderType === 'both' || !reminderType) {
      preview.sms = {
        message: replaceVars(templates['reminder_template_sms'] || ''),
        characterCount: replaceVars(templates['reminder_template_sms'] || '').length
      };
    }

    if (reminderType === 'email' || reminderType === 'both' || !reminderType) {
      preview.email = {
        subject: replaceVars(templates['reminder_template_email_subject'] || ''),
        body: replaceVars(templates['reminder_template_email_body'] || ''),
        html: textToHtml(replaceVars(templates['reminder_template_email_body'] || ''))
      };
    }

    res.json(preview);
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
};
