import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as qbController from '../controllers/quickbooksController';
import qbwcRouter from './qbwc';

const router = express.Router();

// Mount QBWC SOAP endpoints (no auth - handled by QBWC protocol)
router.use('/', qbwcRouter);

// QuickBooks routes - accessible by admin and accountant
const qbAuth = [authenticateToken, authorizeRoles('admin', 'accountant')];

// Status & Configuration
router.get('/status', ...qbAuth, qbController.getStatus);
router.put('/settings', ...qbAuth, qbController.updateSettings);

// Payer -> QuickBooks customer mapping (payer-based billing)
router.get('/payer-mappings', ...qbAuth, qbController.getPayerMappings);
router.put('/payer-mappings', ...qbAuth, qbController.updatePayerMapping);
router.post('/redrive', ...qbAuth, qbController.redriveTransactions);

// Password Management
router.post('/password', ...qbAuth, qbController.setPassword);
router.post('/password/reset', ...qbAuth, qbController.resetPassword);

// QWC File Download
router.get('/qwc-file', ...qbAuth, qbController.downloadQWCFile);

// Queue Management
router.post('/queue/customers', ...qbAuth, qbController.queueCustomers);
router.post('/queue/invoices', ...qbAuth, qbController.queueInvoices);
router.post('/queue/:type/:id', ...qbAuth, qbController.queueSingleEntity);
router.get('/queue/status', ...qbAuth, qbController.getQueueStatus);
router.get('/queue/items', ...qbAuth, qbController.getQueueItems);
router.post('/queue/retry', ...qbAuth, qbController.retryFailedRequests);
router.delete('/queue', ...qbAuth, qbController.clearQueue);

// Sync Mappings
router.get('/mappings', ...qbAuth, qbController.getMappings);
router.delete('/mappings/:id', ...qbAuth, qbController.deleteMapping);

// Sync Log
router.get('/sync-log', ...qbAuth, qbController.getSyncLog);

// Import from QuickBooks
router.post('/import/customers', ...qbAuth, qbController.importCustomers);
router.post('/import/items', ...qbAuth, qbController.importServiceItems);
router.post('/import/invoices', ...qbAuth, qbController.importInvoices);
router.post('/import/all', ...qbAuth, qbController.importAll);

// Revenue account routing. The report is a dry run and the discovery call is
// read-only; only create-items writes into the QuickBooks company file.
router.get('/revenue-map', ...qbAuth, qbController.getRevenueMap);
router.get('/revenue-map/report', ...qbAuth, qbController.getRevenueRoutingReport);
router.post('/revenue-map/discover-accounts', ...qbAuth, qbController.discoverRevenueAccounts);
router.post('/revenue-map/create-items', ...qbAuth, qbController.createRevenueItems);

// Imported Data View
router.get('/imported', ...qbAuth, qbController.getImportedData);

// Disconnect
router.post('/disconnect', ...qbAuth, qbController.disconnect);

export default router;
