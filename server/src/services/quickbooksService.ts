import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Type definitions for QuickBooks API responses
interface QBTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface QBCompanyInfo {
  CompanyName?: string;
  [key: string]: unknown;
}

// QuickBooks API configuration
const QB_CONFIG = {
  clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
  redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || '',
  environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
  encryptionKey: process.env.QUICKBOOKS_ENCRYPTION_KEY || 'default_key_change_in_production!',
};

// API base URLs
const QB_API_BASE = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com/v3/company',
  production: 'https://quickbooks.api.intuit.com/v3/company',
};

const QB_AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

// Simple encryption for tokens (use proper encryption in production)
function encrypt(text: string): string {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(QB_CONFIG.encryptionKey, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(QB_CONFIG.encryptionKey, 'salt', 32);
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

// ===== OAuth Functions =====

export async function getAuthUrl(): Promise<string> {
  const scope = 'com.intuit.quickbooks.accounting';
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: QB_CONFIG.clientId,
    response_type: 'code',
    scope,
    redirect_uri: QB_CONFIG.redirectUri,
    state,
  });

  return `${QB_AUTH_BASE}?${params.toString()}`;
}

export async function handleOAuthCallback(code: string, realmId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: QB_CONFIG.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return { success: false, error: 'Failed to exchange authorization code' };
    }

    const tokens = await tokenResponse.json() as QBTokenResponse;

    // Get company info
    const companyInfo = await getCompanyInfo(realmId, tokens.access_token);

    // Store tokens in database
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await pool.query(`
      UPDATE quickbooks_config SET
        realm_id = $1,
        access_token = $2,
        refresh_token = $3,
        token_expires_at = $4,
        company_name = $5,
        is_connected = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      realmId,
      encrypt(tokens.access_token),
      encrypt(tokens.refresh_token),
      expiresAt,
      companyInfo?.CompanyName || 'QuickBooks Company',
    ]);

    return { success: true };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return { success: false, error: 'Failed to complete OAuth flow' };
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const config = await getConfig();
    if (!config || !config.refresh_token) {
      return false;
    }

    const refreshToken = decrypt(config.refresh_token);

    const tokenResponse = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Token refresh failed');
      return false;
    }

    const tokens = await tokenResponse.json() as QBTokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await pool.query(`
      UPDATE quickbooks_config SET
        access_token = $1,
        refresh_token = $2,
        token_expires_at = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      encrypt(tokens.access_token),
      encrypt(tokens.refresh_token),
      expiresAt,
    ]);

    return true;
  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}

export async function disconnectQuickBooks(): Promise<boolean> {
  try {
    await pool.query(`
      UPDATE quickbooks_config SET
        realm_id = NULL,
        access_token = NULL,
        refresh_token = NULL,
        token_expires_at = NULL,
        company_name = NULL,
        is_connected = false,
        last_sync_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    // Clear all sync mappings
    await pool.query('DELETE FROM quickbooks_sync_map');

    return true;
  } catch (error) {
    console.error('Disconnect error:', error);
    return false;
  }
}

// ===== Configuration Functions =====

export async function getConfig() {
  const result = await pool.query('SELECT * FROM quickbooks_config WHERE id = 1');
  return result.rows[0] || null;
}

export async function getConnectionStatus() {
  const config = await getConfig();

  if (!config) {
    return { connected: false, configured: false };
  }

  return {
    connected: config.is_connected,
    configured: !!QB_CONFIG.clientId,
    companyName: config.company_name,
    lastSyncAt: config.last_sync_at,
    syncEnabled: config.sync_enabled,
    autoSyncInvoices: config.auto_sync_invoices,
    autoSyncPayments: config.auto_sync_payments,
    tokenExpired: config.token_expires_at ? new Date(config.token_expires_at) < new Date() : true,
  };
}

export async function updateSyncSettings(settings: {
  syncEnabled?: boolean;
  autoSyncInvoices?: boolean;
  autoSyncPayments?: boolean;
}) {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (settings.syncEnabled !== undefined) {
    updates.push(`sync_enabled = $${paramIndex++}`);
    values.push(settings.syncEnabled);
  }
  if (settings.autoSyncInvoices !== undefined) {
    updates.push(`auto_sync_invoices = $${paramIndex++}`);
    values.push(settings.autoSyncInvoices);
  }
  if (settings.autoSyncPayments !== undefined) {
    updates.push(`auto_sync_payments = $${paramIndex++}`);
    values.push(settings.autoSyncPayments);
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    await pool.query(`UPDATE quickbooks_config SET ${updates.join(', ')} WHERE id = 1`, values);
  }
}

// ===== API Helper Functions =====

async function getAccessToken(): Promise<string | null> {
  const config = await getConfig();
  if (!config || !config.access_token) {
    return null;
  }

  // Check if token is expired and refresh if needed
  if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      return null;
    }
    const newConfig = await getConfig();
    return newConfig ? decrypt(newConfig.access_token) : null;
  }

  return decrypt(config.access_token);
}

async function qbApiCall(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  body?: object
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const config = await getConfig();
    if (!config || !config.is_connected) {
      return { success: false, error: 'QuickBooks not connected' };
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Failed to get access token' };
    }

    const baseUrl = QB_API_BASE[QB_CONFIG.environment as 'sandbox' | 'production'];
    const url = `${baseUrl}/${config.realm_id}/${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`QB API error (${response.status}):`, errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('QB API call error:', error);
    return { success: false, error: 'API request failed' };
  }
}

async function getCompanyInfo(realmId: string, accessToken: string): Promise<QBCompanyInfo | null> {
  try {
    const baseUrl = QB_API_BASE[QB_CONFIG.environment as 'sandbox' | 'production'];
    const response = await fetch(`${baseUrl}/${realmId}/companyinfo/${realmId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json() as { CompanyInfo: QBCompanyInfo };
      return data.CompanyInfo;
    }
    return null;
  } catch {
    return null;
  }
}

// ===== Sync Mapping Functions =====

async function getMapping(entityType: string, medsysId: number) {
  const result = await pool.query(
    'SELECT * FROM quickbooks_sync_map WHERE entity_type = $1 AND medsys_id = $2',
    [entityType, medsysId]
  );
  return result.rows[0] || null;
}

async function saveMapping(
  entityType: string,
  medsysId: number,
  quickbooksId: string,
  syncToken?: string
) {
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
  `, [entityType, medsysId, quickbooksId, syncToken]);
}

async function setMappingError(entityType: string, medsysId: number, error: string) {
  await pool.query(`
    UPDATE quickbooks_sync_map
    SET sync_status = 'error', error_message = $3
    WHERE entity_type = $1 AND medsys_id = $2
  `, [entityType, medsysId, error]);
}

// ===== Entity Sync Functions =====

export async function syncCustomer(patientId: number): Promise<{ success: boolean; qbId?: string; error?: string }> {
  try {
    // Get patient data
    const patientResult = await pool.query(`
      SELECT p.id, p.patient_number, u.first_name, u.last_name, u.email, u.phone,
             p.address, p.city, p.state
      FROM patients p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `, [patientId]);

    if (patientResult.rows.length === 0) {
      return { success: false, error: 'Patient not found' };
    }

    const patient = patientResult.rows[0];
    const displayName = `${patient.first_name} ${patient.last_name} (${patient.patient_number})`;

    // Check for existing mapping
    const existing = await getMapping('patient', patientId);

    const customerData = {
      DisplayName: displayName.substring(0, 100), // QB limit
      GivenName: patient.first_name,
      FamilyName: patient.last_name,
      PrimaryEmailAddr: patient.email ? { Address: patient.email } : undefined,
      PrimaryPhone: patient.phone ? { FreeFormNumber: patient.phone } : undefined,
      BillAddr: patient.address ? {
        Line1: patient.address,
        City: patient.city,
        CountrySubDivisionCode: patient.state,
      } : undefined,
    };

    let result;
    if (existing) {
      // Update existing customer
      result = await qbApiCall('POST', 'customer', {
        ...customerData,
        Id: existing.quickbooks_id,
        SyncToken: existing.quickbooks_sync_token,
        sparse: true,
      });
    } else {
      // Create new customer
      result = await qbApiCall('POST', 'customer', customerData);
    }

    if (result.success && result.data?.Customer) {
      const customer = result.data.Customer;
      await saveMapping('patient', patientId, customer.Id, customer.SyncToken);
      return { success: true, qbId: customer.Id };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('Sync customer error:', error);
    return { success: false, error: 'Failed to sync customer' };
  }
}

export async function syncItem(chargeId: number): Promise<{ success: boolean; qbId?: string; error?: string }> {
  try {
    // Get charge master item
    const chargeResult = await pool.query(`
      SELECT id, service_name, service_code, category, price, description
      FROM charge_master
      WHERE id = $1
    `, [chargeId]);

    if (chargeResult.rows.length === 0) {
      return { success: false, error: 'Charge master item not found' };
    }

    const charge = chargeResult.rows[0];
    const existing = await getMapping('service', chargeId);

    // First, ensure income account exists (or use default)
    const incomeAccountId = await getOrCreateIncomeAccount();

    const itemData = {
      Name: charge.service_code.substring(0, 100),
      Description: charge.service_name,
      Type: 'Service',
      UnitPrice: charge.price,
      IncomeAccountRef: { value: incomeAccountId },
    };

    let result;
    if (existing) {
      result = await qbApiCall('POST', 'item', {
        ...itemData,
        Id: existing.quickbooks_id,
        SyncToken: existing.quickbooks_sync_token,
        sparse: true,
      });
    } else {
      result = await qbApiCall('POST', 'item', itemData);
    }

    if (result.success && result.data?.Item) {
      const item = result.data.Item;
      await saveMapping('service', chargeId, item.Id, item.SyncToken);
      return { success: true, qbId: item.Id };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('Sync item error:', error);
    return { success: false, error: 'Failed to sync item' };
  }
}

export async function syncInvoice(invoiceId: number): Promise<{ success: boolean; qbId?: string; error?: string }> {
  try {
    // Get invoice with patient info
    const invoiceResult = await pool.query(`
      SELECT i.*, p.id as patient_db_id
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      return { success: false, error: 'Invoice not found' };
    }

    const invoice = invoiceResult.rows[0];

    // Ensure customer is synced
    let customerMapping = await getMapping('patient', invoice.patient_db_id);
    if (!customerMapping) {
      const customerSync = await syncCustomer(invoice.patient_db_id);
      if (!customerSync.success) {
        return { success: false, error: 'Failed to sync customer first' };
      }
      customerMapping = await getMapping('patient', invoice.patient_db_id);
    }

    // Get invoice items
    const itemsResult = await pool.query(`
      SELECT ii.*, cm.id as charge_id
      FROM invoice_items ii
      LEFT JOIN charge_master cm ON ii.charge_master_id = cm.id
      WHERE ii.invoice_id = $1
    `, [invoiceId]);

    // Build line items
    const lines = [];
    for (const item of itemsResult.rows) {
      let itemRef = null;

      if (item.charge_id) {
        // Ensure item is synced
        let itemMapping = await getMapping('service', item.charge_id);
        if (!itemMapping) {
          await syncItem(item.charge_id);
          itemMapping = await getMapping('service', item.charge_id);
        }
        if (itemMapping) {
          itemRef = { value: itemMapping.quickbooks_id };
        }
      }

      lines.push({
        DetailType: 'SalesItemLineDetail',
        Amount: item.total_price,
        Description: item.description,
        SalesItemLineDetail: {
          ItemRef: itemRef,
          Qty: item.quantity,
          UnitPrice: item.unit_price,
        },
      });
    }

    const existing = await getMapping('invoice', invoiceId);

    const invoiceData = {
      CustomerRef: { value: customerMapping!.quickbooks_id },
      TxnDate: invoice.invoice_date,
      DueDate: invoice.due_date,
      DocNumber: invoice.invoice_number,
      Line: lines,
    };

    let result;
    if (existing) {
      result = await qbApiCall('POST', 'invoice', {
        ...invoiceData,
        Id: existing.quickbooks_id,
        SyncToken: existing.quickbooks_sync_token,
        sparse: true,
      });
    } else {
      result = await qbApiCall('POST', 'invoice', invoiceData);
    }

    if (result.success && result.data?.Invoice) {
      const qbInvoice = result.data.Invoice;
      await saveMapping('invoice', invoiceId, qbInvoice.Id, qbInvoice.SyncToken);
      return { success: true, qbId: qbInvoice.Id };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('Sync invoice error:', error);
    return { success: false, error: 'Failed to sync invoice' };
  }
}

export async function syncPayment(invoiceId: number): Promise<{ success: boolean; qbId?: string; error?: string }> {
  try {
    // Get invoice and payments
    const invoiceResult = await pool.query(`
      SELECT i.*, p.id as patient_db_id
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      return { success: false, error: 'Invoice not found' };
    }

    const invoice = invoiceResult.rows[0];

    // Ensure invoice is synced first
    let invoiceMapping = await getMapping('invoice', invoiceId);
    if (!invoiceMapping) {
      const invoiceSync = await syncInvoice(invoiceId);
      if (!invoiceSync.success) {
        return { success: false, error: 'Failed to sync invoice first' };
      }
      invoiceMapping = await getMapping('invoice', invoiceId);
    }

    // Ensure customer is synced
    const customerMapping = await getMapping('patient', invoice.patient_db_id);
    if (!customerMapping) {
      return { success: false, error: 'Customer not synced' };
    }

    // Get total payments
    const paymentsResult = await pool.query(`
      SELECT SUM(amount) as total_paid
      FROM payments
      WHERE invoice_id = $1
    `, [invoiceId]);

    const totalPaid = parseFloat(paymentsResult.rows[0]?.total_paid || 0);

    if (totalPaid === 0) {
      return { success: true }; // No payment to sync
    }

    // Check if payment already synced
    const existingPayment = await getMapping('payment', invoiceId);

    const paymentData = {
      CustomerRef: { value: customerMapping.quickbooks_id },
      TotalAmt: totalPaid,
      Line: [{
        Amount: totalPaid,
        LinkedTxn: [{
          TxnId: invoiceMapping!.quickbooks_id,
          TxnType: 'Invoice',
        }],
      }],
    };

    let result;
    if (existingPayment) {
      result = await qbApiCall('POST', 'payment', {
        ...paymentData,
        Id: existingPayment.quickbooks_id,
        SyncToken: existingPayment.quickbooks_sync_token,
        sparse: true,
      });
    } else {
      result = await qbApiCall('POST', 'payment', paymentData);
    }

    if (result.success && result.data?.Payment) {
      const qbPayment = result.data.Payment;
      await saveMapping('payment', invoiceId, qbPayment.Id, qbPayment.SyncToken);
      return { success: true, qbId: qbPayment.Id };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('Sync payment error:', error);
    return { success: false, error: 'Failed to sync payment' };
  }
}

// ===== Batch Sync Functions =====

export async function syncAllCustomers(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const patients = await pool.query('SELECT id FROM patients');
  let succeeded = 0;
  let failed = 0;

  for (const patient of patients.rows) {
    const result = await syncCustomer(patient.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
      await setMappingError('patient', patient.id, result.error || 'Unknown error');
    }
  }

  return { processed: patients.rows.length, succeeded, failed };
}

export async function syncAllItems(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const charges = await pool.query('SELECT id FROM charge_master WHERE is_active = true');
  let succeeded = 0;
  let failed = 0;

  for (const charge of charges.rows) {
    const result = await syncItem(charge.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
      await setMappingError('service', charge.id, result.error || 'Unknown error');
    }
  }

  return { processed: charges.rows.length, succeeded, failed };
}

export async function syncUnsyncedInvoices(): Promise<{ processed: number; succeeded: number; failed: number }> {
  // Get invoices not yet synced or with pending status
  const invoices = await pool.query(`
    SELECT i.id FROM invoices i
    LEFT JOIN quickbooks_sync_map qsm ON qsm.entity_type = 'invoice' AND qsm.medsys_id = i.id
    WHERE qsm.id IS NULL OR qsm.sync_status = 'pending'
    ORDER BY i.created_at
    LIMIT 100
  `);

  let succeeded = 0;
  let failed = 0;

  for (const invoice of invoices.rows) {
    const result = await syncInvoice(invoice.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: invoices.rows.length, succeeded, failed };
}

export async function syncUnsyncedPayments(): Promise<{ processed: number; succeeded: number; failed: number }> {
  // Get invoices with payments that need syncing
  const invoices = await pool.query(`
    SELECT DISTINCT i.id FROM invoices i
    JOIN payments pay ON pay.invoice_id = i.id
    LEFT JOIN quickbooks_sync_map qsm ON qsm.entity_type = 'payment' AND qsm.medsys_id = i.id
    WHERE qsm.id IS NULL OR qsm.sync_status = 'pending'
    ORDER BY i.created_at
    LIMIT 100
  `);

  let succeeded = 0;
  let failed = 0;

  for (const invoice of invoices.rows) {
    const result = await syncPayment(invoice.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: invoices.rows.length, succeeded, failed };
}

export async function fullSync(userId?: number): Promise<{ success: boolean; results: any }> {
  const logId = await startSyncLog('full', 'all', 'push', userId);

  try {
    const results = {
      customers: await syncAllCustomers(),
      items: await syncAllItems(),
      invoices: await syncUnsyncedInvoices(),
      payments: await syncUnsyncedPayments(),
    };

    const totalProcessed = results.customers.processed + results.items.processed +
                          results.invoices.processed + results.payments.processed;
    const totalSucceeded = results.customers.succeeded + results.items.succeeded +
                          results.invoices.succeeded + results.payments.succeeded;
    const totalFailed = results.customers.failed + results.items.failed +
                       results.invoices.failed + results.payments.failed;

    await completeSyncLog(logId, totalProcessed, totalSucceeded, totalFailed, 'completed');

    // Update last sync timestamp
    await pool.query('UPDATE quickbooks_config SET last_sync_at = CURRENT_TIMESTAMP WHERE id = 1');

    return { success: true, results };
  } catch (error) {
    await completeSyncLog(logId, 0, 0, 0, 'failed', { error: String(error) });
    return { success: false, results: { error: String(error) } };
  }
}

// ===== Pull Sync Functions =====

export async function pullPaymentUpdates(): Promise<{ processed: number; updated: number }> {
  // Query QB for recent payments
  const result = await qbApiCall('GET', 'query?query=' + encodeURIComponent(
    "SELECT * FROM Payment WHERE Metadata.LastUpdatedTime > '2020-01-01' MAXRESULTS 100"
  ));

  if (!result.success || !result.data?.QueryResponse?.Payment) {
    return { processed: 0, updated: 0 };
  }

  let updated = 0;
  const payments = result.data.QueryResponse.Payment;

  for (const qbPayment of payments) {
    // Find linked invoice in our system
    const mapping = await pool.query(`
      SELECT medsys_id FROM quickbooks_sync_map
      WHERE entity_type = 'invoice' AND quickbooks_id = $1
    `, [qbPayment.Line?.[0]?.LinkedTxn?.[0]?.TxnId]);

    if (mapping.rows.length > 0) {
      const invoiceId = mapping.rows[0].medsys_id;

      // Check if payment amount differs
      const currentPayments = await pool.query(
        'SELECT SUM(amount) as total FROM payments WHERE invoice_id = $1',
        [invoiceId]
      );

      const qbAmount = qbPayment.TotalAmt;
      const currentAmount = parseFloat(currentPayments.rows[0]?.total || 0);

      if (Math.abs(qbAmount - currentAmount) > 0.01) {
        // Log the discrepancy (don't auto-update to prevent issues)
        console.log(`Payment discrepancy for invoice ${invoiceId}: QB=${qbAmount}, MedSys=${currentAmount}`);
        updated++;
      }
    }
  }

  return { processed: payments.length, updated };
}

// ===== Sync Log Functions =====

async function startSyncLog(
  syncType: string,
  entityType: string,
  direction: string,
  userId?: number
): Promise<number> {
  const result = await pool.query(`
    INSERT INTO quickbooks_sync_log (sync_type, entity_type, direction, started_at, status, created_by)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'running', $4)
    RETURNING id
  `, [syncType, entityType, direction, userId]);

  return result.rows[0].id;
}

async function completeSyncLog(
  logId: number,
  processed: number,
  succeeded: number,
  failed: number,
  status: string,
  errorDetails?: object
) {
  await pool.query(`
    UPDATE quickbooks_sync_log SET
      records_processed = $2,
      records_succeeded = $3,
      records_failed = $4,
      completed_at = CURRENT_TIMESTAMP,
      status = $5,
      error_details = $6
    WHERE id = $1
  `, [logId, processed, succeeded, failed, status, errorDetails ? JSON.stringify(errorDetails) : null]);
}

export async function getSyncLog(limit: number = 50) {
  const result = await pool.query(`
    SELECT qsl.*, u.first_name || ' ' || u.last_name as created_by_name
    FROM quickbooks_sync_log qsl
    LEFT JOIN users u ON qsl.created_by = u.id
    ORDER BY qsl.created_at DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

export async function getMappings(entityType?: string) {
  let query = 'SELECT * FROM quickbooks_sync_map';
  const params: any[] = [];

  if (entityType) {
    query += ' WHERE entity_type = $1';
    params.push(entityType);
  }

  query += ' ORDER BY last_synced_at DESC LIMIT 200';

  const result = await pool.query(query, params);
  return result.rows;
}

export async function deleteMapping(id: number) {
  await pool.query('DELETE FROM quickbooks_sync_map WHERE id = $1', [id]);
}

// ===== Helper Functions =====

async function getOrCreateIncomeAccount(): Promise<string> {
  // Try to find existing "Services" or "Sales" account
  const result = await qbApiCall('GET', 'query?query=' + encodeURIComponent(
    "SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1"
  ));

  if (result.success && result.data?.QueryResponse?.Account?.length > 0) {
    return result.data.QueryResponse.Account[0].Id;
  }

  // If no income account found, this would be an issue
  // For now, return empty string (QB will use default)
  return '';
}
