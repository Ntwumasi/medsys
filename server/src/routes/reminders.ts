import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getOutstandingInvoices,
  getReminderSettings,
  updateReminderSettings,
  sendReminder,
  sendBulkReminders,
  getReminderHistory,
  getReminderStats,
  previewReminder
} from '../controllers/reminderController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Outstanding invoices eligible for reminders
router.get('/outstanding', getOutstandingInvoices);

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
