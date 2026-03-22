import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getFinancialSummary,
  exportInvoicesToExcel,
  exportInvoiceDetailToExcel,
  getAgingReport,
  getRevenueByPayer,
} from '../controllers/accountantController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Financial dashboard
router.get('/summary', getFinancialSummary);

// Excel exports
router.get('/export/invoices', exportInvoicesToExcel);
router.get('/export/invoice/:id', exportInvoiceDetailToExcel);

// Reports
router.get('/reports/aging', getAgingReport);
router.get('/reports/revenue-by-payer', getRevenueByPayer);

export default router;
