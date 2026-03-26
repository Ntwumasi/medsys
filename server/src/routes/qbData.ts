import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as qbDataController from '../controllers/qbDataController';

const router = express.Router();

// All routes require accountant or admin role
const qbAuth = [authenticateToken, authorizeRoles('admin', 'accountant')];

// Dashboard
router.get('/dashboard', ...qbAuth, qbDataController.getDashboard);

// Customers
router.get('/customers', ...qbAuth, qbDataController.getCustomers);
router.get('/customers/:id', ...qbAuth, qbDataController.getCustomerById);

// Invoices
router.get('/invoices', ...qbAuth, qbDataController.getInvoices);
router.get('/invoices/:id', ...qbAuth, qbDataController.getInvoiceById);
router.post('/invoices/:id/payment', ...qbAuth, qbDataController.recordPayment);

// Payments
router.get('/payments', ...qbAuth, qbDataController.getPayments);

// Services
router.get('/services', ...qbAuth, qbDataController.getServices);
router.post('/services/:id/sync', ...qbAuth, qbDataController.syncService);

export default router;
