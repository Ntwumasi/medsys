import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as qbController from '../controllers/quickbooksController';
import qbwcRouter from './qbwc';

const router = express.Router();

// Mount QBWC SOAP endpoints (no auth - handled by QBWC protocol)
router.use('/', qbwcRouter);

// All admin routes require authentication and admin role
const adminAuth = [authenticateToken, authorizeRoles('admin')];

// Status & Configuration
router.get('/status', ...adminAuth, qbController.getStatus);
router.put('/settings', ...adminAuth, qbController.updateSettings);

// Password Management
router.post('/password', ...adminAuth, qbController.setPassword);
router.post('/password/reset', ...adminAuth, qbController.resetPassword);

// QWC File Download
router.get('/qwc-file', ...adminAuth, qbController.downloadQWCFile);

// Queue Management
router.post('/queue/customers', ...adminAuth, qbController.queueCustomers);
router.post('/queue/invoices', ...adminAuth, qbController.queueInvoices);
router.post('/queue/:type/:id', ...adminAuth, qbController.queueSingleEntity);
router.get('/queue/status', ...adminAuth, qbController.getQueueStatus);
router.get('/queue/items', ...adminAuth, qbController.getQueueItems);
router.post('/queue/retry', ...adminAuth, qbController.retryFailedRequests);
router.delete('/queue', ...adminAuth, qbController.clearQueue);

// Sync Mappings
router.get('/mappings', ...adminAuth, qbController.getMappings);
router.delete('/mappings/:id', ...adminAuth, qbController.deleteMapping);

// Sync Log
router.get('/sync-log', ...adminAuth, qbController.getSyncLog);

// Disconnect
router.post('/disconnect', ...adminAuth, qbController.disconnect);

export default router;
