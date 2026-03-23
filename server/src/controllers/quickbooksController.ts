import { Request, Response } from 'express';
import * as qbService from '../services/quickbooksService';

// ===== OAuth Endpoints =====

export const getAuthUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const authUrl = await qbService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Get auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
};

export const handleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, realmId, error } = req.query;

    if (error) {
      // User denied access or error occurred
      res.redirect('/quickbooks?error=' + encodeURIComponent(String(error)));
      return;
    }

    if (!code || !realmId) {
      res.redirect('/quickbooks?error=missing_parameters');
      return;
    }

    const result = await qbService.handleOAuthCallback(String(code), String(realmId));

    if (result.success) {
      res.redirect('/quickbooks?connected=true');
    } else {
      res.redirect('/quickbooks?error=' + encodeURIComponent(result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/quickbooks?error=callback_failed');
  }
};

export const disconnect = async (req: Request, res: Response): Promise<void> => {
  try {
    const success = await qbService.disconnectQuickBooks();
    if (success) {
      res.json({ message: 'Disconnected from QuickBooks' });
    } else {
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect from QuickBooks' });
  }
};

export const getStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await qbService.getConnectionStatus();
    res.json(status);
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
};

// ===== Settings Endpoints =====

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { syncEnabled, autoSyncInvoices, autoSyncPayments } = req.body;

    await qbService.updateSyncSettings({
      syncEnabled,
      autoSyncInvoices,
      autoSyncPayments,
    });

    res.json({ message: 'Settings updated' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// ===== Sync Endpoints =====

export const syncCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await qbService.syncAllCustomers();
    res.json({
      message: 'Customer sync completed',
      ...result,
    });
  } catch (error) {
    console.error('Sync customers error:', error);
    res.status(500).json({ error: 'Failed to sync customers' });
  }
};

export const syncItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await qbService.syncAllItems();
    res.json({
      message: 'Items sync completed',
      ...result,
    });
  } catch (error) {
    console.error('Sync items error:', error);
    res.status(500).json({ error: 'Failed to sync items' });
  }
};

export const syncInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await qbService.syncUnsyncedInvoices();
    res.json({
      message: 'Invoice sync completed',
      ...result,
    });
  } catch (error) {
    console.error('Sync invoices error:', error);
    res.status(500).json({ error: 'Failed to sync invoices' });
  }
};

export const syncPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await qbService.syncUnsyncedPayments();
    res.json({
      message: 'Payment sync completed',
      ...result,
    });
  } catch (error) {
    console.error('Sync payments error:', error);
    res.status(500).json({ error: 'Failed to sync payments' });
  }
};

export const fullSync = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const result = await qbService.fullSync(userId);

    if (result.success) {
      res.json({
        message: 'Full sync completed',
        results: result.results,
      });
    } else {
      res.status(500).json({
        error: 'Sync failed',
        details: result.results,
      });
    }
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({ error: 'Failed to perform full sync' });
  }
};

export const syncSingleEntity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;
    const entityId = parseInt(id);

    if (isNaN(entityId)) {
      res.status(400).json({ error: 'Invalid entity ID' });
      return;
    }

    let result;
    switch (type) {
      case 'customer':
      case 'patient':
        result = await qbService.syncCustomer(entityId);
        break;
      case 'item':
      case 'service':
        result = await qbService.syncItem(entityId);
        break;
      case 'invoice':
        result = await qbService.syncInvoice(entityId);
        break;
      case 'payment':
        result = await qbService.syncPayment(entityId);
        break;
      default:
        res.status(400).json({ error: 'Invalid entity type' });
        return;
    }

    if (result.success) {
      res.json({
        message: `${type} synced successfully`,
        quickbooksId: result.qbId,
      });
    } else {
      res.status(500).json({
        error: `Failed to sync ${type}`,
        details: result.error,
      });
    }
  } catch (error) {
    console.error('Sync single entity error:', error);
    res.status(500).json({ error: 'Failed to sync entity' });
  }
};

// ===== Pull Endpoints =====

export const pullPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await qbService.pullPaymentUpdates();
    res.json({
      message: 'Payment pull completed',
      ...result,
    });
  } catch (error) {
    console.error('Pull payments error:', error);
    res.status(500).json({ error: 'Failed to pull payments' });
  }
};

// ===== Admin Endpoints =====

export const getSyncLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await qbService.getSyncLog(limit);
    res.json(logs);
  } catch (error) {
    console.error('Get sync log error:', error);
    res.status(500).json({ error: 'Failed to get sync log' });
  }
};

export const getMappings = async (req: Request, res: Response): Promise<void> => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const mappings = await qbService.getMappings(entityType);
    res.json(mappings);
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

    await qbService.deleteMapping(id);
    res.json({ message: 'Mapping deleted' });
  } catch (error) {
    console.error('Delete mapping error:', error);
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
};
