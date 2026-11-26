import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import {
  getFinancialSummary,
  exportInvoicesToExcel,
  exportInvoiceDetailToExcel,
  exportRevenueTrendToExcel,
  getAgingReport,
  getFinancialStatement,
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

// Department revenue: the Finances page is shown to lab, pharmacy, imaging and
// nursing staff, so they may read their OWN department; finance roles any.
const FINANCE_ROLES = ['admin', 'accountant', 'receptionist'];
const OWN_DEPARTMENT: Record<string, string> = {
  lab: 'lab', imaging: 'imaging', nurse: 'nursing',
  pharmacy: 'pharmacy', pharmacist: 'pharmacy', pharmacy_tech: 'pharmacy',
};
const departmentAccess = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as any).user;
  const role: string = user?.role;
  if (user?.is_super_admin || FINANCE_ROLES.includes(role) || role === 'office_manager'
      || OWN_DEPARTMENT[role] === req.params.department) {
    next();
    return;
  }
  res.status(403).json({ error: 'You can only view your own department\'s finances' });
};
router.get('/department/:department/revenue', departmentAccess, getDepartmentRevenue);
router.get('/department/:department/line-items', departmentAccess, getDepartmentLineItems);

router.use(authorizeRoles('admin', 'accountant', 'receptionist'));

// Financial dashboard
router.get('/summary', getFinancialSummary);

// Excel exports
router.get('/export/invoices', exportInvoicesToExcel);
router.get('/export/revenue-trend', exportRevenueTrendToExcel);
router.get('/export/invoice/:id', exportInvoiceDetailToExcel);

// Reports
router.get('/reports/aging', getAgingReport);
router.get('/reports/financial-statement', getFinancialStatement);
router.get('/reports/revenue-by-payer', getRevenueByPayer);


// PDF generation
router.get('/statement/:patient_id', generatePatientStatement);
router.get('/receipt/:payment_id', generateReceipt);

export default router;
