import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import {
  getFinancialSummary,
  exportInvoicesToExcel,
  exportInvoiceDetailToExcel,
  getAgingReport,
  getRevenueByPayer,
  getDepartmentRevenue,
  getDepartmentLineItems,
  generatePatientStatement,
  generateReceipt,
} from '../controllers/accountantController';

const router = Router();

// SECURITY: financial reporting is restricted to finance roles. Without
// the role gate, any authenticated user (including 'patient') could pull
// the clinic's entire billing state.
router.use(authenticateToken);
router.use(authorizeRoles('admin', 'accountant', 'receptionist'));

// Financial dashboard
router.get('/summary', getFinancialSummary);

// Excel exports
router.get('/export/invoices', exportInvoicesToExcel);
router.get('/export/invoice/:id', exportInvoiceDetailToExcel);

// Reports
router.get('/reports/aging', getAgingReport);
router.get('/reports/revenue-by-payer', getRevenueByPayer);

// Department revenue (for department-specific finance views)
router.get('/department/:department/revenue', getDepartmentRevenue);
router.get('/department/:department/line-items', getDepartmentLineItems);

// PDF generation
router.get('/statement/:patient_id', generatePatientStatement);
router.get('/receipt/:payment_id', generateReceipt);

export default router;
