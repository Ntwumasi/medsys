import { Request, Response } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as qbwcService from '../services/qbwcService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ===== Status & Configuration =====

export const getStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await pool.query('SELECT * FROM quickbooks_config WHERE id = 1');

    if (config.rows.length === 0) {
      res.json({
        connected: false,
        configured: false,
        integrationType: 'desktop',
      });
      return;
    }

    const qbConfig = config.rows[0];
    const queueStatus = await qbwcService.getQueueStatus();

    res.json({
      connected: qbConfig.is_connected,
      configured: !!qbConfig.qbwc_password_hash,
      integrationType: qbConfig.integration_type || 'desktop',
      username: qbConfig.qbwc_username,
      companyFilePath: qbConfig.company_file_path,
      pollIntervalMinutes: qbConfig.poll_interval_minutes,
      lastPollAt: qbConfig.last_poll_at,
      lastSyncAt: qbConfig.last_sync_at,
      syncEnabled: qbConfig.sync_enabled,
      autoSyncInvoices: qbConfig.auto_sync_invoices,
      autoSyncPayments: qbConfig.auto_sync_payments,
      ownerId: qbConfig.owner_id,
      fileId: qbConfig.file_id,
      queueStatus,
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
};

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      syncEnabled,
      autoSyncInvoices,
      autoSyncPayments,
      username,
      companyFilePath,
      pollIntervalMinutes,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (syncEnabled !== undefined) {
      updates.push(`sync_enabled = $${paramIndex++}`);
      values.push(syncEnabled);
    }
    if (autoSyncInvoices !== undefined) {
      updates.push(`auto_sync_invoices = $${paramIndex++}`);
      values.push(autoSyncInvoices);
    }
    if (autoSyncPayments !== undefined) {
      updates.push(`auto_sync_payments = $${paramIndex++}`);
      values.push(autoSyncPayments);
    }
    if (username) {
      updates.push(`qbwc_username = $${paramIndex++}`);
      values.push(username);
    }
    if (companyFilePath !== undefined) {
      updates.push(`company_file_path = $${paramIndex++}`);
      values.push(companyFilePath);
    }
    if (pollIntervalMinutes) {
      updates.push(`poll_interval_minutes = $${paramIndex++}`);
      values.push(pollIntervalMinutes);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      await pool.query(`UPDATE quickbooks_config SET ${updates.join(', ')} WHERE id = 1`, values);
    }

    res.json({ message: 'Settings updated' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// ===== Password Management =====

export const setPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;

    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(`
      UPDATE quickbooks_config SET
        qbwc_password_hash = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [passwordHash]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const newPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(`
      UPDATE quickbooks_config SET
        qbwc_password_hash = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [passwordHash]);

    res.json({
      message: 'Password reset successfully',
      newPassword, // Show once, user must save it
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// ===== QWC File Generation =====

export const downloadQWCFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await pool.query('SELECT * FROM quickbooks_config WHERE id = 1');

    if (config.rows.length === 0) {
      res.status(400).json({ error: 'QuickBooks not configured' });
      return;
    }

    const qbConfig = config.rows[0];
    const baseUrl = process.env.APP_URL || 'https://medsys-five.vercel.app';

    const qwcContent = `<?xml version="1.0"?>
<QBWCXML>
  <AppName>MedSys EMR</AppName>
  <AppID></AppID>
  <AppURL>${baseUrl}/api/quickbooks/soap</AppURL>
  <AppDescription>MedSys EMR - QuickBooks Integration for medical billing sync</AppDescription>
  <AppSupport>${baseUrl}/support</AppSupport>
  <UserName>${qbConfig.qbwc_username || 'medsys'}</UserName>
  <OwnerID>{${qbConfig.owner_id || crypto.randomUUID()}}</OwnerID>
  <FileID>{${qbConfig.file_id || crypto.randomUUID()}}</FileID>
  <QBType>QBFS</QBType>
  <Scheduler>
    <RunEveryNMinutes>${qbConfig.poll_interval_minutes || 5}</RunEveryNMinutes>
  </Scheduler>
  <IsReadOnly>false</IsReadOnly>
</QBWCXML>`;

    res.setHeader('Content-Type', 'application/x-qwc');
    res.setHeader('Content-Disposition', 'attachment; filename="medsys.qwc"');
    res.send(qwcContent);
  } catch (error) {
    console.error('Download QWC error:', error);
    res.status(500).json({ error: 'Failed to generate QWC file' });
  }
};

// ===== Queue Management =====

export const queueCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await qbwcService.queueAllCustomers();
    res.json({
      message: 'Customers queued for sync',
      queued: count,
    });
  } catch (error) {
    console.error('Queue customers error:', error);
    res.status(500).json({ error: 'Failed to queue customers' });
  }
};

export const queueInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await qbwcService.queueAllInvoices();
    res.json({
      message: 'Invoices queued for sync',
      queued: count,
    });
  } catch (error) {
    console.error('Queue invoices error:', error);
    res.status(500).json({ error: 'Failed to queue invoices' });
  }
};

export const queueSingleEntity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;
    const entityId = parseInt(id);

    if (isNaN(entityId)) {
      res.status(400).json({ error: 'Invalid entity ID' });
      return;
    }

    switch (type) {
      case 'customer':
      case 'patient':
        await qbwcService.queueCustomerSync(entityId);
        break;
      case 'invoice':
        await qbwcService.queueInvoiceSync(entityId);
        break;
      default:
        res.status(400).json({ error: 'Invalid entity type. Use: customer, patient, or invoice' });
        return;
    }

    res.json({ message: `${type} queued for sync` });
  } catch (error) {
    console.error('Queue single entity error:', error);
    res.status(500).json({ error: 'Failed to queue entity' });
  }
};

export const getQueueStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await qbwcService.getQueueStatus();
    res.json(status);
  } catch (error) {
    console.error('Get queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
};

export const getQueueItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const items = await qbwcService.getQueueItems(status, limit);
    res.json(items);
  } catch (error) {
    console.error('Get queue items error:', error);
    res.status(500).json({ error: 'Failed to get queue items' });
  }
};

export const retryFailedRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await qbwcService.retryFailedRequests();
    res.json({
      message: 'Failed requests queued for retry',
      count,
    });
  } catch (error) {
    console.error('Retry failed requests error:', error);
    res.status(500).json({ error: 'Failed to retry requests' });
  }
};

export const clearQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const count = await qbwcService.clearQueue(status);
    res.json({
      message: status ? `Cleared ${status} requests` : 'Queue cleared',
      count,
    });
  } catch (error) {
    console.error('Clear queue error:', error);
    res.status(500).json({ error: 'Failed to clear queue' });
  }
};

// ===== Sync Mappings =====

export const getMappings = async (req: Request, res: Response): Promise<void> => {
  try {
    const entityType = req.query.entityType as string | undefined;

    let query = 'SELECT * FROM quickbooks_sync_map';
    const params: any[] = [];

    if (entityType) {
      query += ' WHERE entity_type = $1';
      params.push(entityType);
    }

    query += ' ORDER BY last_synced_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get mappings error:', error);
    res.status(500).json({ error: 'Failed to get mappings' });
  }
};

export const deleteMapping = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid mapping ID' });
      return;
    }

    await pool.query('DELETE FROM quickbooks_sync_map WHERE id = $1', [id]);
    res.json({ message: 'Mapping deleted' });
  } catch (error) {
    console.error('Delete mapping error:', error);
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
};

// ===== Sync Log =====

export const getSyncLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await pool.query(`
      SELECT qsl.*, u.first_name || ' ' || u.last_name as created_by_name
      FROM quickbooks_sync_log qsl
      LEFT JOIN users u ON qsl.created_by = u.id
      ORDER BY qsl.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get sync log error:', error);
    res.status(500).json({ error: 'Failed to get sync log' });
  }
};

// ===== Disconnect =====

export const disconnect = async (req: Request, res: Response): Promise<void> => {
  try {
    // Clear all sessions
    await pool.query('DELETE FROM quickbooks_sessions');

    // Clear queue
    await pool.query('DELETE FROM quickbooks_request_queue');

    // Reset config (keep credentials)
    await pool.query(`
      UPDATE quickbooks_config SET
        is_connected = false,
        last_poll_at = NULL,
        last_sync_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    res.json({ message: 'Disconnected from QuickBooks' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};
