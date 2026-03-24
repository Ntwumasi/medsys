// QuickBooks Web Connector (QBWC) Service
// Implements the SOAP interface for QB Desktop integration

import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as qbxmlBuilder from './qbxmlBuilder';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const APP_VERSION = '1.0.0';

// ===== QBWC SOAP Method Implementations =====

export async function serverVersion(): Promise<string> {
  return APP_VERSION;
}

export async function clientVersion(strVersion: string): Promise<string> {
  // Return empty string to accept any version, or version requirement message
  console.log(`[QBWC] Client version: ${strVersion}`);
  return '';
}

export async function authenticate(
  strUserName: string,
  strPassword: string
): Promise<[string, string]> {
  try {
    // Get config
    const config = await pool.query('SELECT * FROM quickbooks_config WHERE id = 1');
    if (config.rows.length === 0) {
      return ['', 'nvu']; // Not valid user
    }

    const qbConfig = config.rows[0];

    // Verify username
    if (strUserName !== qbConfig.qbwc_username) {
      console.log(`[QBWC] Invalid username: ${strUserName}`);
      return ['', 'nvu'];
    }

    // Verify password
    const validPassword = await bcrypt.compare(strPassword, qbConfig.qbwc_password_hash);
    if (!validPassword) {
      console.log(`[QBWC] Invalid password for user: ${strUserName}`);
      return ['', 'nvu'];
    }

    // Create session ticket
    const ticket = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await pool.query(`
      INSERT INTO quickbooks_sessions (ticket, authenticated, expires_at)
      VALUES ($1, true, $2)
    `, [ticket, expiresAt]);

    // Update last poll time
    await pool.query(`
      UPDATE quickbooks_config SET
        last_poll_at = CURRENT_TIMESTAMP,
        is_connected = true
      WHERE id = 1
    `);

    console.log(`[QBWC] Authenticated user: ${strUserName}, ticket: ${ticket.substring(0, 8)}...`);

    // Return ticket and company file path (empty string means use current company)
    const companyFile = qbConfig.company_file_path || '';
    return [ticket, companyFile];

  } catch (error) {
    console.error('[QBWC] Authentication error:', error);
    return ['', 'nvu'];
  }
}

export async function sendRequestXML(
  ticket: string,
  strHCPResponse: string,
  strCompanyFileName: string,
  qbXMLCountry: string,
  qbXMLMajorVers: number,
  qbXMLMinorVers: number
): Promise<string> {
  try {
    // Validate session
    const session = await validateSession(ticket);
    if (!session) {
      console.log(`[QBWC] Invalid session for sendRequestXML: ${ticket.substring(0, 8)}...`);
      return '';
    }

    // Get next pending request from queue
    const result = await pool.query(`
      SELECT * FROM quickbooks_request_queue
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('[QBWC] No pending requests');
      return ''; // Empty string signals no more requests
    }

    const request = result.rows[0];

    // Mark as sent
    await pool.query(`
      UPDATE quickbooks_request_queue SET
        status = 'sent',
        sent_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [request.id]);

    // Update session
    await pool.query(`
      UPDATE quickbooks_sessions SET
        last_request_at = CURRENT_TIMESTAMP,
        request_count = request_count + 1
      WHERE ticket = $1
    `, [ticket]);

    console.log(`[QBWC] Sending request ${request.id}: ${request.entity_type} ${request.operation}`);

    return request.qbxml_request;

  } catch (error) {
    console.error('[QBWC] sendRequestXML error:', error);
    return '';
  }
}

export async function receiveResponseXML(
  ticket: string,
  response: string,
  hresult: string,
  message: string
): Promise<number> {
  try {
    // Validate session
    const session = await validateSession(ticket);
    if (!session) {
      return -1;
    }

    // Find the most recently sent request
    const result = await pool.query(`
      SELECT * FROM quickbooks_request_queue
      WHERE status = 'sent'
      ORDER BY sent_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('[QBWC] No sent request found for response');
      return 100; // Complete percentage
    }

    const request = result.rows[0];

    // Parse response based on entity type
    let qbListId: string | null = null;
    let qbTxnId: string | null = null;
    let qbEditSequence: string | null = null;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let status = 'completed';

    if (request.entity_type === 'patient' || request.entity_type === 'customer') {
      const parsed = qbxmlBuilder.parseCustomerResponse(response);
      if (!qbxmlBuilder.isSuccessResponse(parsed.statusCode)) {
        status = 'error';
        errorCode = parsed.statusCode;
        errorMessage = parsed.statusMessage;
      } else {
        qbListId = parsed.listId || null;
        qbEditSequence = parsed.editSequence || null;
      }
    } else if (request.entity_type === 'invoice') {
      const parsed = qbxmlBuilder.parseInvoiceResponse(response);
      if (!qbxmlBuilder.isSuccessResponse(parsed.statusCode)) {
        status = 'error';
        errorCode = parsed.statusCode;
        errorMessage = parsed.statusMessage;
      } else {
        qbTxnId = parsed.txnId || null;
        qbEditSequence = parsed.editSequence || null;
      }
    } else if (request.entity_type === 'payment') {
      const parsed = qbxmlBuilder.parsePaymentResponse(response);
      if (!qbxmlBuilder.isSuccessResponse(parsed.statusCode)) {
        status = 'error';
        errorCode = parsed.statusCode;
        errorMessage = parsed.statusMessage;
      } else {
        qbTxnId = parsed.txnId || null;
      }
    }

    // Update request queue
    await pool.query(`
      UPDATE quickbooks_request_queue SET
        status = $2,
        response_xml = $3,
        qb_list_id = $4,
        qb_txn_id = $5,
        qb_edit_sequence = $6,
        error_code = $7,
        error_message = $8,
        completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [request.id, status, response, qbListId, qbTxnId, qbEditSequence, errorCode, errorMessage]);

    // If successful, update sync mapping
    if (status === 'completed' && (qbListId || qbTxnId)) {
      await pool.query(`
        INSERT INTO quickbooks_sync_map (entity_type, medsys_id, quickbooks_id, quickbooks_sync_token, last_synced_at, sync_status)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'synced')
        ON CONFLICT (entity_type, medsys_id)
        DO UPDATE SET
          quickbooks_id = $3,
          quickbooks_sync_token = $4,
          last_synced_at = CURRENT_TIMESTAMP,
          sync_status = 'synced',
          error_message = NULL
      `, [request.entity_type, request.medsys_id, qbListId || qbTxnId, qbEditSequence]);
    }

    console.log(`[QBWC] Processed response for request ${request.id}: ${status}`);

    // Check for more pending requests
    const pendingCount = await pool.query(`
      SELECT COUNT(*) FROM quickbooks_request_queue WHERE status = 'pending'
    `);

    const remaining = parseInt(pendingCount.rows[0].count);
    if (remaining === 0) {
      return 100; // Complete
    }

    // Return percentage (just estimate)
    return Math.min(99, 100 - remaining);

  } catch (error) {
    console.error('[QBWC] receiveResponseXML error:', error);
    return -1;
  }
}

export async function getLastError(ticket: string): Promise<string> {
  // Return any error from the last request
  const result = await pool.query(`
    SELECT error_message FROM quickbooks_request_queue
    WHERE status = 'error'
    ORDER BY completed_at DESC
    LIMIT 1
  `);

  if (result.rows.length > 0 && result.rows[0].error_message) {
    return result.rows[0].error_message;
  }

  return '';
}

export async function connectionError(
  ticket: string,
  hresult: string,
  message: string
): Promise<string> {
  console.error(`[QBWC] Connection error: ${hresult} - ${message}`);

  // Log the error
  await pool.query(`
    INSERT INTO quickbooks_sync_log (sync_type, entity_type, direction, status, error_details, started_at, completed_at)
    VALUES ('connection', 'all', 'push', 'failed', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [JSON.stringify({ hresult, message })]);

  return 'done'; // Tell Web Connector we're done
}

export async function closeConnection(ticket: string): Promise<string> {
  // Clean up session
  await pool.query('DELETE FROM quickbooks_sessions WHERE ticket = $1', [ticket]);

  console.log(`[QBWC] Connection closed for ticket: ${ticket.substring(0, 8)}...`);

  return 'OK';
}

// ===== Helper Functions =====

async function validateSession(ticket: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT * FROM quickbooks_sessions
    WHERE ticket = $1 AND authenticated = true AND expires_at > CURRENT_TIMESTAMP
  `, [ticket]);

  return result.rows.length > 0;
}

// ===== Queue Management Functions =====

export async function queueCustomerSync(patientId: number): Promise<void> {
  // Get patient data
  const result = await pool.query(`
    SELECT p.id, p.patient_number, u.first_name, u.last_name, u.email, u.phone,
           p.address, p.city, p.state
    FROM patients p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = $1
  `, [patientId]);

  if (result.rows.length === 0) {
    throw new Error('Patient not found');
  }

  const patient = result.rows[0];

  // Check if already synced
  const existing = await pool.query(`
    SELECT quickbooks_id, quickbooks_sync_token FROM quickbooks_sync_map
    WHERE entity_type = 'patient' AND medsys_id = $1
  `, [patientId]);

  let qbxml: string;
  let operation: string;

  if (existing.rows.length > 0 && existing.rows[0].quickbooks_id) {
    // Update existing
    qbxml = qbxmlBuilder.buildCustomerModRq(
      patient,
      existing.rows[0].quickbooks_id,
      existing.rows[0].quickbooks_sync_token || '0'
    );
    operation = 'mod';
  } else {
    // Add new
    qbxml = qbxmlBuilder.buildCustomerAddRq(patient);
    operation = 'add';
  }

  // Add to queue
  await pool.query(`
    INSERT INTO quickbooks_request_queue (entity_type, medsys_id, operation, qbxml_request, priority)
    VALUES ('patient', $1, $2, $3, 10)
  `, [patientId, operation, qbxml]);

  console.log(`[QBWC] Queued customer sync: patient ${patientId} (${operation})`);
}

export async function queueInvoiceSync(invoiceId: number): Promise<void> {
  // Get invoice data
  const invoiceResult = await pool.query(`
    SELECT i.*, p.id as patient_db_id
    FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    WHERE i.id = $1
  `, [invoiceId]);

  if (invoiceResult.rows.length === 0) {
    throw new Error('Invoice not found');
  }

  const invoice = invoiceResult.rows[0];

  // Get customer ListID
  const customerMapping = await pool.query(`
    SELECT quickbooks_id FROM quickbooks_sync_map
    WHERE entity_type = 'patient' AND medsys_id = $1
  `, [invoice.patient_db_id]);

  if (customerMapping.rows.length === 0 || !customerMapping.rows[0].quickbooks_id) {
    // Queue customer first
    await queueCustomerSync(invoice.patient_db_id);
    // Re-queue invoice with lower priority to run after customer
    await pool.query(`
      INSERT INTO quickbooks_request_queue (entity_type, medsys_id, operation, qbxml_request, priority, status)
      VALUES ('invoice', $1, 'pending_customer', '', 5, 'waiting')
    `, [invoiceId]);
    return;
  }

  // Get invoice items
  const itemsResult = await pool.query(`
    SELECT ii.*, cm.id as charge_id
    FROM invoice_items ii
    LEFT JOIN charge_master cm ON ii.charge_master_id = cm.id
    WHERE ii.invoice_id = $1
  `, [invoiceId]);

  // Get item ListIDs
  const itemListIds = new Map<number, string>();
  for (const item of itemsResult.rows) {
    if (item.charge_id) {
      const itemMapping = await pool.query(`
        SELECT quickbooks_id FROM quickbooks_sync_map
        WHERE entity_type = 'service' AND medsys_id = $1
      `, [item.charge_id]);
      if (itemMapping.rows.length > 0 && itemMapping.rows[0].quickbooks_id) {
        itemListIds.set(item.charge_id, itemMapping.rows[0].quickbooks_id);
      }
    }
  }

  const qbxml = qbxmlBuilder.buildInvoiceAddRq(
    invoice,
    itemsResult.rows,
    customerMapping.rows[0].quickbooks_id,
    itemListIds
  );

  await pool.query(`
    INSERT INTO quickbooks_request_queue (entity_type, medsys_id, operation, qbxml_request, priority)
    VALUES ('invoice', $1, 'add', $2, 5)
  `, [invoiceId, qbxml]);

  console.log(`[QBWC] Queued invoice sync: invoice ${invoiceId}`);
}

export async function queuePaymentSync(invoiceId: number, paymentAmount: number): Promise<void> {
  // Get invoice mapping
  const invoiceMapping = await pool.query(`
    SELECT quickbooks_id FROM quickbooks_sync_map
    WHERE entity_type = 'invoice' AND medsys_id = $1
  `, [invoiceId]);

  if (invoiceMapping.rows.length === 0 || !invoiceMapping.rows[0].quickbooks_id) {
    // Queue invoice first
    await queueInvoiceSync(invoiceId);
    return;
  }

  // Get customer ListID
  const invoiceResult = await pool.query(`
    SELECT p.id as patient_db_id FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    WHERE i.id = $1
  `, [invoiceId]);

  const customerMapping = await pool.query(`
    SELECT quickbooks_id FROM quickbooks_sync_map
    WHERE entity_type = 'patient' AND medsys_id = $1
  `, [invoiceResult.rows[0].patient_db_id]);

  if (!customerMapping.rows[0]?.quickbooks_id) {
    return;
  }

  const payment = {
    id: invoiceId,
    invoice_id: invoiceId,
    amount: paymentAmount,
    payment_date: new Date(),
  };

  const qbxml = qbxmlBuilder.buildReceivePaymentAddRq(
    payment,
    customerMapping.rows[0].quickbooks_id,
    invoiceMapping.rows[0].quickbooks_id
  );

  await pool.query(`
    INSERT INTO quickbooks_request_queue (entity_type, medsys_id, operation, qbxml_request, priority)
    VALUES ('payment', $1, 'add', $2, 3)
  `, [invoiceId, qbxml]);

  console.log(`[QBWC] Queued payment sync for invoice ${invoiceId}`);
}

// ===== Admin Functions =====

export async function getQueueStatus(): Promise<{
  pending: number;
  sent: number;
  completed: number;
  error: number;
  waiting: number;
}> {
  const result = await pool.query(`
    SELECT status, COUNT(*) as count
    FROM quickbooks_request_queue
    GROUP BY status
  `);

  const counts: Record<string, number> = {
    pending: 0,
    sent: 0,
    completed: 0,
    error: 0,
    waiting: 0,
  };

  for (const row of result.rows) {
    counts[row.status] = parseInt(row.count);
  }

  return counts as any;
}

export async function getQueueItems(status?: string, limit: number = 50) {
  let query = 'SELECT * FROM quickbooks_request_queue';
  const params: any[] = [];

  if (status) {
    query += ' WHERE status = $1';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}

export async function retryFailedRequests(): Promise<number> {
  const result = await pool.query(`
    UPDATE quickbooks_request_queue SET
      status = 'pending',
      retry_count = retry_count + 1,
      error_code = NULL,
      error_message = NULL
    WHERE status = 'error' AND retry_count < 3
    RETURNING id
  `);

  return result.rowCount || 0;
}

export async function clearQueue(status?: string): Promise<number> {
  let query = 'DELETE FROM quickbooks_request_queue';
  const params: any[] = [];

  if (status) {
    query += ' WHERE status = $1';
    params.push(status);
  }

  const result = await pool.query(query, params);
  return result.rowCount || 0;
}

export async function queueAllCustomers(): Promise<number> {
  const patients = await pool.query('SELECT id FROM patients');
  let queued = 0;

  for (const patient of patients.rows) {
    try {
      await queueCustomerSync(patient.id);
      queued++;
    } catch (error) {
      console.error(`Failed to queue customer ${patient.id}:`, error);
    }
  }

  return queued;
}

export async function queueAllInvoices(): Promise<number> {
  const invoices = await pool.query(`
    SELECT i.id FROM invoices i
    LEFT JOIN quickbooks_sync_map qsm ON qsm.entity_type = 'invoice' AND qsm.medsys_id = i.id
    WHERE qsm.id IS NULL
    LIMIT 100
  `);

  let queued = 0;

  for (const invoice of invoices.rows) {
    try {
      await queueInvoiceSync(invoice.id);
      queued++;
    } catch (error) {
      console.error(`Failed to queue invoice ${invoice.id}:`, error);
    }
  }

  return queued;
}
