import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import {
  getOutstandingInvoices,
  startAfreshReminders,
  getReminderSettings,
  updateReminderSettings,
  sendReminder,
  sendBulkReminders,
  getReminderHistory,
  getReminderStats,
  previewReminder
} from '../controllers/reminderController';

const router = Router();

// SECURITY: payment reminders touch contact info and can fire real SMS/email
// at patients — must be restricted to billing roles.
router.use(authenticateToken);
router.use(authorizeRoles('admin', 'accountant', 'receptionist'));

// Outstanding invoices eligible for reminders
router.get('/outstanding', getOutstandingInvoices);

// "Start Afresh" — exclude all current outstanding invoices from the list
router.post('/start-afresh', authorizeRoles('admin', 'accountant'), startAfreshReminders);

// Reminder settings
router.get('/settings', getReminderSettings);
router.put('/settings', updateReminderSettings);

// Send reminders
router.post('/send', sendReminder);
router.post('/send-bulk', sendBulkReminders);

// Preview reminder message
router.get('/preview', previewReminder);

// Reminder history
router.get('/history/:invoiceId', getReminderHistory);

// Statistics
router.get('/stats', getReminderStats);

export default router;
