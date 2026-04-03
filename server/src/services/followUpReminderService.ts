import pool from '../database/db';
import { sendEmail, textToHtml, validateEmail } from './emailService';
import { format } from 'date-fns';

interface FollowUpReminder {
  encounter_id: number;
  appointment_id: number;
  patient_id: number;
  patient_name: string;
  patient_email: string;
  appointment_date: Date;
  follow_up_reason: string;
  days_until_appointment: number;
}

/**
 * Get follow-up appointments that need reminders sent
 * Finds appointments X days before their date where reminder hasn't been sent
 */
export const getFollowUpsDueForReminder = async (daysBefore: number = 3): Promise<FollowUpReminder[]> => {
  const result = await pool.query(`
    SELECT
      e.id as encounter_id,
      e.follow_up_appointment_id as appointment_id,
      e.patient_id,
      e.follow_up_reason,
      u.first_name || ' ' || u.last_name as patient_name,
      u.email as patient_email,
      a.appointment_date,
      EXTRACT(DAY FROM (a.appointment_date - CURRENT_DATE)) as days_until_appointment
    FROM encounters e
    JOIN appointments a ON e.follow_up_appointment_id = a.id
    JOIN patients p ON e.patient_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE e.follow_up_required = true
      AND e.follow_up_scheduled = true
      AND (e.follow_up_reminder_sent = false OR e.follow_up_reminder_sent IS NULL)
      AND a.status NOT IN ('cancelled', 'completed', 'no-show')
      AND a.appointment_date > CURRENT_DATE
      AND a.appointment_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
  `, [daysBefore]);

  return result.rows;
};

/**
 * Send a follow-up reminder email to a patient
 */
export const sendFollowUpReminder = async (reminder: FollowUpReminder): Promise<boolean> => {
  if (!reminder.patient_email || !validateEmail(reminder.patient_email)) {
    console.log(`[Follow-up Reminder] No valid email for patient ${reminder.patient_name}`);
    return false;
  }

  const appointmentDateStr = format(new Date(reminder.appointment_date), 'EEEE, MMMM d, yyyy');
  const appointmentTimeStr = format(new Date(reminder.appointment_date), 'h:mm a');

  const subject = 'Reminder: Upcoming Follow-Up Appointment';

  const body = `
Dear ${reminder.patient_name},

This is a friendly reminder that you have a follow-up appointment scheduled at MedSys Clinic.

APPOINTMENT DETAILS
-------------------
Date: ${appointmentDateStr}
Time: ${appointmentTimeStr}
${reminder.follow_up_reason ? `Reason: ${reminder.follow_up_reason}` : ''}

Please arrive 10 minutes early to complete any necessary paperwork.

If you need to reschedule, please contact us as soon as possible.

Thank you,
MedSys Clinic
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .appointment-box { background: white; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 15px 0; }
    .date { font-size: 20px; color: #2563eb; font-weight: bold; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    .icon { display: inline-block; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Follow-Up Appointment Reminder</h1>
    <p>MedSys Clinic</p>
  </div>
  <div class="content">
    <p>Dear ${reminder.patient_name},</p>
    <p>This is a friendly reminder of your upcoming follow-up appointment:</p>

    <div class="appointment-box">
      <p class="date">${appointmentDateStr}</p>
      <p><strong>Time:</strong> ${appointmentTimeStr}</p>
      ${reminder.follow_up_reason ? `<p><strong>Reason:</strong> ${reminder.follow_up_reason}</p>` : ''}
    </div>

    <p><strong>Please arrive 10 minutes early</strong> to complete any necessary paperwork.</p>
    <p>If you need to reschedule, please contact us as soon as possible.</p>
  </div>
  <div class="footer">
    <p>This is an automated message from MedSys Clinic.</p>
    <p>If you have questions, please call our office.</p>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await sendEmail(reminder.patient_email, subject, body, html);

    if (result.success) {
      // Record the reminder in follow_up_reminders table
      await pool.query(`
        INSERT INTO follow_up_reminders (
          encounter_id, appointment_id, patient_id,
          reminder_type, days_before, contact_info, message, status, sent_at
        ) VALUES ($1, $2, $3, 'email', $4, $5, $6, 'sent', CURRENT_TIMESTAMP)
      `, [
        reminder.encounter_id,
        reminder.appointment_id,
        reminder.patient_id,
        reminder.days_until_appointment,
        reminder.patient_email,
        body
      ]);

      // Mark the encounter as reminder sent
      await pool.query(`
        UPDATE encounters
        SET follow_up_reminder_sent = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [reminder.encounter_id]);

      console.log(`[Follow-up Reminder] Sent to ${reminder.patient_name} (${reminder.patient_email})`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[Follow-up Reminder] Error sending to ${reminder.patient_email}:`, error);
    return false;
  }
};

/**
 * Process all pending follow-up reminders
 * Call this function on a schedule (e.g., daily) to send reminders
 */
export const processFollowUpReminders = async (): Promise<{ sent: number; failed: number }> => {
  console.log('[Follow-up Reminder Service] Starting reminder processing...');

  // Get the days_before setting from reminder_settings table
  let daysBefore = 3; // default
  try {
    const settingResult = await pool.query(
      `SELECT setting_value FROM reminder_settings WHERE setting_key = 'follow_up_reminder_days_before'`
    );
    if (settingResult.rows.length > 0) {
      daysBefore = parseInt(settingResult.rows[0].setting_value) || 3;
    }
  } catch {
    // Use default if table doesn't exist
  }

  const reminders = await getFollowUpsDueForReminder(daysBefore);
  console.log(`[Follow-up Reminder Service] Found ${reminders.length} reminders to send`);

  let sent = 0;
  let failed = 0;

  for (const reminder of reminders) {
    const success = await sendFollowUpReminder(reminder);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`[Follow-up Reminder Service] Completed: ${sent} sent, ${failed} failed`);
  return { sent, failed };
};

/**
 * Start the reminder service with periodic checks
 * This runs in the background and checks for reminders every hour
 */
export const startFollowUpReminderService = (intervalMs: number = 3600000): NodeJS.Timeout => {
  console.log('[Follow-up Reminder Service] Starting periodic reminder service');

  // Run immediately on start
  processFollowUpReminders().catch(console.error);

  // Then run on interval
  const intervalId = setInterval(() => {
    processFollowUpReminders().catch(console.error);
  }, intervalMs);

  return intervalId;
};

export default {
  getFollowUpsDueForReminder,
  sendFollowUpReminder,
  processFollowUpReminders,
  startFollowUpReminderService,
};
