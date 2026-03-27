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
      console.log('[QBWC] No config found');
      return ['', 'nvu']; // Not valid user
    }

    const qbConfig = config.rows[0];
    console.log(`[QBWC] Config found - username in DB: "${qbConfig.qbwc_username}", hash exists: ${!!qbConfig.qbwc_password_hash}`);

    // Verify username
    if (strUserName !== qbConfig.qbwc_username) {
      console.log(`[QBWC] Username mismatch: received "${strUserName}", expected "${qbConfig.qbwc_username}"`);
      return ['', 'nvu'];
    }

    // Verify password
    console.log(`[QBWC] Comparing password (length ${strPassword.length}) with hash`);
    const validPassword = await bcrypt.compare(strPassword, qbConfig.qbwc_password_hash || '');
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

    // Generate QBXML based on entity type and operation
    let qbxml = request.qbxml_request;

    if (!qbxml) {
      qbxml = await generateQBXML(request);
      if (!qbxml) {
        console.error(`[QBWC] Failed to generate QBXML for ${request.entity_type} ${request.operation} #${request.medsys_id}`);
        // Mark as error and move on
        await pool.query(`
          UPDATE quickbooks_request_queue SET
            status = 'error',
            error_message = 'Failed to generate QBXML'
          WHERE id = $1
        `, [request.id]);
        // Try next request
        return sendRequestXML(ticket, strHCPResponse, strCompanyFileName, qbXMLCountry, qbXMLMajorVers, qbXMLMinorVers);
      }
    }

    // Mark as sent
    await pool.query(`
      UPDATE quickbooks_request_queue SET
        status = 'sent',
        sent_at = CURRENT_TIMESTAMP,
        qbxml_request = $2
      WHERE id = $1
    `, [request.id, qbxml]);

    // Update session
    await pool.query(`
      UPDATE quickbooks_sessions SET
        last_request_at = CURRENT_TIMESTAMP,
        request_count = request_count + 1
      WHERE ticket = $1
    `, [ticket]);

    console.log(`[QBWC] Sending request ${request.id}: ${request.entity_type} ${request.operation} #${request.medsys_id}`);

    return qbxml;

  } catch (error) {
    console.error('[QBWC] sendRequestXML error:', error);
    return '';
  }
}

// Generate QBXML based on request type
async function generateQBXML(request: any): Promise<string | null> {
  const { entity_type, operation, medsys_id } = request;

  try {
    if (entity_type === 'patient' && (operation === 'add' || operation === 'push')) {
      // Get patient data
      const result = await pool.query(`
        SELECT p.id, p.patient_number, u.first_name, u.last_name, u.email, u.phone,
               p.address, p.city, p.state
        FROM patients p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = $1
      `, [medsys_id]);

      if (result.rows.length === 0) return null;
      return qbxmlBuilder.buildCustomerAddRq(result.rows[0], request.id.toString());
    }

    if (entity_type === 'invoice' && (operation === 'push' || operation === 'add')) {
      console.log(`[QBWC] Generating invoice QBXML for medsys_id=${medsys_id}`);
      // Get invoice data with items
      const invoiceResult = await pool.query(`
        SELECT i.*, p.patient_number, u.first_name, u.last_name
        FROM invoices i
        JOIN patients p ON i.patient_id = p.id
        JOIN users u ON p.user_id = u.id
        WHERE i.id = $1
      `, [medsys_id]);

      console.log(`[QBWC] Invoice query returned ${invoiceResult.rows.length} rows`);
      if (invoiceResult.rows.length === 0) return null;

      const itemsResult = await pool.query(`
        SELECT ii.*, cm.service_name as quickbooks_item_name
        FROM invoice_items ii
        LEFT JOIN charge_master cm ON ii.charge_master_id = cm.id
        WHERE ii.invoice_id = $1
      `, [medsys_id]);
      console.log(`[QBWC] Invoice items: ${itemsResult.rows.length}`);

      // Get QB customer ID
      const syncMap = await pool.query(`
        SELECT quickbooks_id FROM quickbooks_sync_map
        WHERE entity_type = 'patient' AND medsys_id = $1
      `, [invoiceResult.rows[0].patient_id]);
      console.log(`[QBWC] Patient ${invoiceResult.rows[0].patient_id} sync check: ${syncMap.rows.length > 0 ? syncMap.rows[0].quickbooks_id : 'NOT FOUND'}`);

      if (syncMap.rows.length === 0) {
        console.log(`[QBWC] Patient ${invoiceResult.rows[0].patient_id} not synced to QB yet`);
        // Queue patient first, mark invoice as waiting
        await pool.query(`
          UPDATE quickbooks_request_queue SET status = 'waiting' WHERE id = $1
        `, [request.id]);
        return null;
      }

      // Get item ListIDs from sync_map for charge_master items
      const itemListIds = new Map<number, string>();
      const chargeIds = itemsResult.rows
        .filter((i: any) => i.charge_master_id)
        .map((i: any) => i.charge_master_id);

      if (chargeIds.length > 0) {
        const itemSync = await pool.query(`
          SELECT medsys_id, quickbooks_id FROM quickbooks_sync_map
          WHERE entity_type = 'service' AND medsys_id = ANY($1)
        `, [chargeIds]);
        for (const row of itemSync.rows) {
          itemListIds.set(parseInt(row.medsys_id), row.quickbooks_id);
        }
      }

      const qbxml = qbxmlBuilder.buildInvoiceAddRq(
        invoiceResult.rows[0],
        itemsResult.rows,
        syncMap.rows[0].quickbooks_id,
        itemListIds,
        request.id.toString()
      );
      console.log(`[QBWC] Invoice QBXML generated: ${qbxml ? qbxml.length : 0} chars`);
      return qbxml;
    }

    if (entity_type === 'payment' && (operation === 'push' || operation === 'add')) {
      // Get payment data
      const paymentResult = await pool.query(`
        SELECT pay.*, i.invoice_number, i.patient_id, i.total_amount
        FROM payments pay
        JOIN invoices i ON pay.invoice_id = i.id
        WHERE pay.id = $1
      `, [medsys_id]);

      if (paymentResult.rows.length === 0) return null;

      const payment = paymentResult.rows[0];

      // Get QB customer ID
      const customerSync = await pool.query(`
        SELECT quickbooks_id FROM quickbooks_sync_map
        WHERE entity_type = 'patient' AND medsys_id = $1
      `, [payment.patient_id]);

      if (customerSync.rows.length === 0) {
        console.log(`[QBWC] Customer for payment ${medsys_id} not synced to QB yet`);
        await pool.query(`UPDATE quickbooks_request_queue SET status = 'waiting' WHERE id = $1`, [request.id]);
        return null;
      }

      // Get QB invoice ID
      const invoiceSync = await pool.query(`
        SELECT quickbooks_id FROM quickbooks_sync_map
        WHERE entity_type = 'invoice' AND medsys_id = $1
      `, [payment.invoice_id]);

      if (invoiceSync.rows.length === 0) {
        console.log(`[QBWC] Invoice for payment ${medsys_id} not synced to QB yet`);
        await pool.query(`UPDATE quickbooks_request_queue SET status = 'waiting' WHERE id = $1`, [request.id]);
        return null;
      }

      return qbxmlBuilder.buildReceivePaymentAddRq(
        payment,
        customerSync.rows[0].quickbooks_id,
        invoiceSync.rows[0].quickbooks_id,
        request.id.toString()
      );
    }

    console.log(`[QBWC] Unknown request type: ${entity_type} ${operation}`);
    return null;

  } catch (error) {
    console.error(`[QBWC] Error generating QBXML for ${entity_type} ${operation}:`, error);
    return null;
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

    // Handle import queries
    if (request.entity_type.startsWith('import_')) {
      console.log(`[QBWC] Processing import response for ${request.entity_type}, response length: ${response?.length || 0}`);
      const importResult = await processImportResponse(request.entity_type, response);
      console.log(`[QBWC] Import result for ${request.entity_type}:`, importResult);

      if (importResult.errors.length > 0) {
        status = 'completed'; // Still mark as completed, errors are logged separately
        errorMessage = `Imported: ${importResult.imported}, Skipped: ${importResult.skipped}, Errors: ${importResult.errors.join('; ').substring(0, 500)}`;
      } else {
        errorMessage = `Imported: ${importResult.imported}, Skipped: ${importResult.skipped}`;
      }
    } else if (request.entity_type === 'patient' || request.entity_type === 'customer') {
      // Check for empty/invalid response
      if (!response || response.length < 50 || !response.includes('CustomerAddRs')) {
        status = 'error';
        errorMessage = 'Empty or invalid response from QuickBooks';
        console.log(`[QBWC] Invalid customer response for ${request.id}, length: ${response?.length || 0}`);
      } else {
        const parsed = qbxmlBuilder.parseCustomerResponse(response);
        if (!qbxmlBuilder.isSuccessResponse(parsed.statusCode)) {
          status = 'error';
          errorCode = parsed.statusCode;
          errorMessage = parsed.statusMessage;
        } else if (!parsed.listId) {
          status = 'error';
          errorMessage = 'No ListID returned from QuickBooks';
        } else {
          qbListId = parsed.listId;
          qbEditSequence = parsed.editSequence || null;
        }
      }
    } else if (request.entity_type === 'invoice') {
      if (!response || response.length < 50 || !response.includes('InvoiceAddRs')) {
        status = 'error';
        errorMessage = 'Empty or invalid response from QuickBooks';
      } else {
        const parsed = qbxmlBuilder.parseInvoiceResponse(response);
        if (!qbxmlBuilder.isSuccessResponse(parsed.statusCode)) {
          status = 'error';
          errorCode = parsed.statusCode;
          errorMessage = parsed.statusMessage;
        } else if (!parsed.txnId) {
          status = 'error';
          errorMessage = 'No TxnID returned from QuickBooks';
        } else {
          qbTxnId = parsed.txnId;
          qbEditSequence = parsed.editSequence || null;
        }
      }
    } else if (request.entity_type === 'payment') {
      if (!response || response.length < 50 || !response.includes('ReceivePaymentAddRs')) {
        status = 'error';
        errorMessage = 'Empty or invalid response from QuickBooks';
      } else {
        const parsed = qbxmlBuilder.parsePaymentResponse(response);
        if (!qbxmlBuilder.isSuccessResponse(parsed.statusCode)) {
          status = 'error';
          errorCode = parsed.statusCode;
          errorMessage = parsed.statusMessage;
        } else if (!parsed.txnId) {
          status = 'error';
          errorMessage = 'No TxnID returned from QuickBooks';
        } else {
          qbTxnId = parsed.txnId;
        }
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

  // Check if using Cash Sales customer mode
  const configResult = await pool.query(`
    SELECT use_cash_sales_customer, cash_sales_customer_name, cash_sales_customer_listid
    FROM quickbooks_config WHERE id = 1
  `);
  const config = configResult.rows[0];

  let customerListId: string | null = null;

  if (config?.use_cash_sales_customer) {
    // Use Cash Sales customer instead of individual patient
    if (config.cash_sales_customer_listid) {
      customerListId = config.cash_sales_customer_listid;
    } else {
      // Try to find Cash Sales customer in imported customers
      const cashSalesMapping = await pool.query(`
        SELECT quickbooks_id FROM quickbooks_sync_map
        WHERE entity_type = 'customer' AND entity_name ILIKE $1
      `, [config.cash_sales_customer_name || 'Cash Sales']);

      if (cashSalesMapping.rows.length > 0 && cashSalesMapping.rows[0].quickbooks_id) {
        customerListId = cashSalesMapping.rows[0].quickbooks_id;
        // Save it for future use
        await pool.query(`
          UPDATE quickbooks_config SET cash_sales_customer_listid = $1 WHERE id = 1
        `, [customerListId]);
      } else {
        console.log(`[QBWC] Cash Sales customer "${config.cash_sales_customer_name}" not found in QB. Please import customers first.`);
        return;
      }
    }
  } else {
    // Use individual patient as customer (original behavior)
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
    customerListId = customerMapping.rows[0].quickbooks_id;
  }

  if (!customerListId) {
    console.log(`[QBWC] No customer ListID available for invoice ${invoiceId}`);
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
    customerListId,
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

  // Check if using Cash Sales customer mode
  const configResult = await pool.query(`
    SELECT use_cash_sales_customer, cash_sales_customer_listid
    FROM quickbooks_config WHERE id = 1
  `);
  const config = configResult.rows[0];

  let customerListId: string | null = null;

  if (config?.use_cash_sales_customer && config.cash_sales_customer_listid) {
    // Use Cash Sales customer
    customerListId = config.cash_sales_customer_listid;
  } else {
    // Use individual patient as customer
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
    customerListId = customerMapping.rows[0].quickbooks_id;
  }

  if (!customerListId) {
    console.log(`[QBWC] No customer ListID available for payment on invoice ${invoiceId}`);
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
    customerListId,
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

// ===== IMPORT Functions (Pull from QuickBooks) =====

export async function queueImportCustomers(): Promise<void> {
  const qbxml = qbxmlBuilder.buildCustomerQueryAllRq('import-customers');

  await pool.query(`
    INSERT INTO quickbooks_request_queue (entity_type, medsys_id, operation, qbxml_request, priority)
    VALUES ('import_customers', 0, 'query', $1, 20)
  `, [qbxml]);

  console.log('[QBWC] Queued import customers query');
}

export async function queueImportServiceItems(): Promise<void> {
  const qbxml = qbxmlBuilder.buildItemServiceQueryAllRq('import-items');

  await pool.query(`
    INSERT INTO quickbooks_request_queue (entity_type, medsys_id, operation, qbxml_request, priority)
    VALUES ('import_items', 0, 'query', $1, 19)
  `, [qbxml]);

  console.log('[QBWC] Queued import service items query');
}

export async function queueImportInvoices(fromDate?: string, toDate?: string): Promise<void> {
  const qbxml = qbxmlBuilder.buildInvoiceQueryAllRq(fromDate, toDate, 'import-invoices');

  await pool.query(`
    INSERT INTO quickbooks_request_queue (entity_type, medsys_id, operation, qbxml_request, priority)
    VALUES ('import_invoices', 0, 'query', $1, 18)
  `, [qbxml]);

  console.log('[QBWC] Queued import invoices query');
}

// Process import responses
export async function processImportResponse(entityType: string, responseXml: string): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  if (!responseXml || responseXml.length < 50) {
    result.errors.push(`Empty or invalid response (length: ${responseXml?.length || 0})`);
    return result;
  }

  console.log(`[QBWC] Processing ${entityType}, XML preview: ${responseXml.substring(0, 200)}`);

  try {
    if (entityType === 'import_customers') {
      const customers = qbxmlBuilder.parseCustomersFromResponse(responseXml);
      console.log(`[QBWC] Parsed ${customers.length} customers from response`);

      for (const customer of customers) {
        try {
          // Check if customer already imported (by QB ListID)
          const existing = await pool.query(
            `SELECT id FROM quickbooks_sync_map WHERE entity_type = 'patient' AND quickbooks_id = $1`,
            [customer.listId]
          );

          if (existing.rows.length > 0) {
            result.skipped++;
            continue;
          }

          // Parse name to get first/last name
          let firstName = customer.firstName || '';
          let lastName = customer.lastName || '';

          if (!firstName && !lastName && customer.name) {
            const nameParts = customer.name.split(' ');
            firstName = nameParts[0] || 'Unknown';
            lastName = nameParts.slice(1).join(' ') || 'Customer';
          }

          // Create user first
          const userResult = await pool.query(`
            INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_active)
            VALUES ($1, $2, $3, $4, $5, 'patient', true)
            RETURNING id
          `, [
            customer.email || `qb-${customer.listId}@imported.local`,
            '$2b$10$placeholder', // Placeholder hash - user can't login
            firstName,
            lastName,
            customer.phone || null
          ]);

          const userId = userResult.rows[0].id;

          // Generate patient number
          const patientCountResult = await pool.query('SELECT COUNT(*) FROM patients');
          const patientNumber = `P${String(parseInt(patientCountResult.rows[0].count) + 1).padStart(5, '0')}`;

          // Create patient
          const patientResult = await pool.query(`
            INSERT INTO patients (user_id, patient_number, address, city, state, date_of_birth, gender)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
          `, [
            userId,
            patientNumber,
            customer.address || null,
            customer.city || null,
            customer.state || null,
            '1900-01-01', // Placeholder DOB - QB doesn't have this
            'other' // Default gender - QB doesn't have this
          ]);

          // Create sync mapping
          await pool.query(`
            INSERT INTO quickbooks_sync_map (entity_type, medsys_id, quickbooks_id, quickbooks_sync_token, last_synced_at, sync_status)
            VALUES ('patient', $1, $2, $3, CURRENT_TIMESTAMP, 'imported')
          `, [patientResult.rows[0].id, customer.listId, customer.editSequence]);

          result.imported++;
        } catch (err: any) {
          result.errors.push(`Customer ${customer.name}: ${err.message}`);
        }
      }
    } else if (entityType === 'import_items') {
      const items = qbxmlBuilder.parseServiceItemsFromResponse(responseXml);
      console.log(`[QBWC] Parsed ${items.length} service items from response`);

      for (const item of items) {
        try {
          // Check if already imported
          const existing = await pool.query(
            `SELECT id FROM quickbooks_sync_map WHERE entity_type = 'service' AND quickbooks_id = $1`,
            [item.listId]
          );

          if (existing.rows.length > 0) {
            result.skipped++;
            continue;
          }

          // Generate service code
          const codeBase = item.name.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
          const serviceCode = `QB-${codeBase}`;

          // Create charge master entry
          const chargeResult = await pool.query(`
            INSERT INTO charge_master (service_code, service_name, category, price, is_active)
            VALUES ($1, $2, 'service', $3, true)
            ON CONFLICT (service_code) DO UPDATE SET
              service_name = EXCLUDED.service_name,
              price = EXCLUDED.price
            RETURNING id
          `, [serviceCode, item.name, item.price || 0]);

          // Create sync mapping
          await pool.query(`
            INSERT INTO quickbooks_sync_map (entity_type, medsys_id, quickbooks_id, quickbooks_sync_token, last_synced_at, sync_status)
            VALUES ('service', $1, $2, $3, CURRENT_TIMESTAMP, 'imported')
          `, [chargeResult.rows[0].id, item.listId, item.editSequence]);

          result.imported++;
        } catch (err: any) {
          result.errors.push(`Item ${item.name}: ${err.message}`);
        }
      }
    } else if (entityType === 'import_invoices') {
      const invoices = qbxmlBuilder.parseInvoicesFromResponse(responseXml);
      console.log(`[QBWC] Parsed ${invoices.length} invoices from response`);

      for (const invoice of invoices) {
        try {
          // Check if already imported
          const existing = await pool.query(
            `SELECT id FROM quickbooks_sync_map WHERE entity_type = 'invoice' AND quickbooks_id = $1`,
            [invoice.txnId]
          );

          if (existing.rows.length > 0) {
            result.skipped++;
            continue;
          }

          // Find matching patient by QB customer ID
          const patientMapping = await pool.query(
            `SELECT medsys_id FROM quickbooks_sync_map WHERE entity_type = 'patient' AND quickbooks_id = $1`,
            [invoice.customerListId]
          );

          if (patientMapping.rows.length === 0) {
            result.errors.push(`Invoice ${invoice.refNumber}: Customer not found in MedSys`);
            continue;
          }

          const patientId = patientMapping.rows[0].medsys_id;

          // Create invoice
          const invoiceResult = await pool.query(`
            INSERT INTO invoices (patient_id, invoice_number, invoice_date, subtotal, total_amount, status)
            VALUES ($1, $2, $3, $4, $4, $5)
            RETURNING id
          `, [
            patientId,
            invoice.refNumber || `QB-${invoice.txnId}`,
            invoice.txnDate || new Date().toISOString().split('T')[0],
            invoice.totalAmount,
            invoice.isPaid ? 'paid' : 'pending'
          ]);

          const invoiceId = invoiceResult.rows[0].id;

          // Create invoice line items
          for (const line of invoice.lineItems) {
            await pool.query(`
              INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category)
              VALUES ($1, $2, $3, $4, $5, 'service')
            `, [invoiceId, line.description || line.itemName || 'Service', line.quantity, line.rate, line.amount]);
          }

          // Create sync mapping
          await pool.query(`
            INSERT INTO quickbooks_sync_map (entity_type, medsys_id, quickbooks_id, quickbooks_sync_token, last_synced_at, sync_status)
            VALUES ('invoice', $1, $2, $3, CURRENT_TIMESTAMP, 'imported')
          `, [invoiceId, invoice.txnId, invoice.editSequence]);

          result.imported++;
        } catch (err: any) {
          result.errors.push(`Invoice ${invoice.refNumber}: ${err.message}`);
        }
      }
    }

    // Log import results
    await pool.query(`
      INSERT INTO quickbooks_sync_log (sync_type, entity_type, direction, status, records_processed, error_details, started_at, completed_at)
      VALUES ('import', $1, 'pull', $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      entityType,
      result.errors.length > 0 ? 'partial' : 'success',
      result.imported,
      result.errors.length > 0 ? JSON.stringify(result.errors) : null
    ]);

  } catch (error: any) {
    console.error(`[QBWC] Import processing error for ${entityType}:`, error);
    result.errors.push(error.message);
  }

  return result;
}
