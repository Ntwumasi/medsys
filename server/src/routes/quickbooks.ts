import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as qbController from '../controllers/quickbooksController';

const router = express.Router();

// All QuickBooks routes require authentication and admin role
// except the callback which is called by Intuit

// OAuth endpoints
router.get('/auth-url', authenticateToken, authorizeRoles('admin'), qbController.getAuthUrl);
router.get('/callback', qbController.handleCallback); // No auth - called by Intuit
router.post('/disconnect', authenticateToken, authorizeRoles('admin'), qbController.disconnect);
router.get('/status', authenticateToken, authorizeRoles('admin'), qbController.getStatus);

// Settings
router.put('/settings', authenticateToken, authorizeRoles('admin'), qbController.updateSettings);

// Sync endpoints
router.post('/sync/customers', authenticateToken, authorizeRoles('admin'), qbController.syncCustomers);
router.post('/sync/items', authenticateToken, authorizeRoles('admin'), qbController.syncItems);
router.post('/sync/invoices', authenticateToken, authorizeRoles('admin'), qbController.syncInvoices);
router.post('/sync/payments', authenticateToken, authorizeRoles('admin'), qbController.syncPayments);
router.post('/sync/full', authenticateToken, authorizeRoles('admin'), qbController.fullSync);
router.post('/sync/single/:type/:id', authenticateToken, authorizeRoles('admin'), qbController.syncSingleEntity);

// Pull endpoints
router.post('/pull/payments', authenticateToken, authorizeRoles('admin'), qbController.pullPayments);

// Admin endpoints
router.get('/sync-log', authenticateToken, authorizeRoles('admin'), qbController.getSyncLog);
router.get('/mappings', authenticateToken, authorizeRoles('admin'), qbController.getMappings);
router.delete('/mappings/:id', authenticateToken, authorizeRoles('admin'), qbController.deleteMapping);

export default router;
