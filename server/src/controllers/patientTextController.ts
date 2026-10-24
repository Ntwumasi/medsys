import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../database/db';
import { auditService } from '../services/auditService';
import { isArkeselSandbox, isSMSConfigured } from '../services/smsService';
import { PATIENT_TEXT_KINDS, runDailyPatientTexts } from '../services/patientAutoTextService';

// Only these keys can be written from the settings screen.
const EDITABLE_KEYS = new Set<string>([
  ...PATIENT_TEXT_KINDS.map((k) => `patient_sms_${k}_enabled`),
  'patient_sms_refill_days_before',
  'patient_sms_clinic_name',
  'patient_sms_clinic_phone',
  'follow_up_reminder_days_before',
]);

/** GET /api/patient-texts/settings */
export const getPatientTextSettings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await pool.query(
      `SELECT setting_key, setting_value FROM reminder_settings WHERE setting_key = ANY($1)`,
      [[...EDITABLE_KEYS]]
    );
    const settings: Record<string, string> = {};
    rows.rows.forEach((r) => { settings[r.setting_key] = r.setting_value; });
    res.json({
      settings,
      sms_configured: isSMSConfigured(),
      sandbox: isArkeselSandbox(),
      sender_approved: process.env.ARKESEL_SENDER_APPROVED === 'true',
    });
  } catch (error) {
    console.error('Get patient text settings error:', error);
    res.status(500).json({ error: 'Failed to load text settings' });
  }
};

/** PUT /api/patient-texts/settings — body: { key: value, ... } */
export const updatePatientTextSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const updates = Object.entries(body).filter(([k]) => EDITABLE_KEYS.has(k));
    if (updates.length === 0) {
      res.status(400).json({ error: 'No editable settings in the request' });
      return;
    }
    for (const [key, raw] of updates) {
      const value = String(raw ?? '').trim();
      if (key.endsWith('_enabled') && value !== 'true' && value !== 'false') {
        res.status(400).json({ error: `${key} must be true or false` });
        return;
      }
      if (key.endsWith('_days_before') && !(parseInt(value) >= 1 && parseInt(value) <= 14)) {
        res.status(400).json({ error: `${key} must be between 1 and 14` });
        return;
      }
    }
    for (const [key, raw] of updates) {
      await pool.query(
        `INSERT INTO reminder_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, String(raw ?? '').trim()]
      );
    }
    await auditService.log({
      userId: (req as any).user?.id,
      action: 'update',
      entityType: 'patient_text_settings',
      details: Object.fromEntries(updates),
    });
    res.json({ message: 'Text settings saved' });
  } catch (error) {
    console.error('Update patient text settings error:', error);
    res.status(500).json({ error: 'Failed to save text settings' });
  }
};

/** GET /api/patient-texts/log?kind=&status=&limit= */
export const getPatientTextLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const params: unknown[] = [];
    const where: string[] = [];
    if (typeof req.query.kind === 'string' && req.query.kind) {
      params.push(req.query.kind);
      where.push(`l.kind = $${params.length}`);
    }
    if (typeof req.query.status === 'string' && req.query.status) {
      params.push(req.query.status);
      where.push(`l.status = $${params.length}`);
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 100, 1), 500);
    params.push(limit);

    const rows = await pool.query(
      `SELECT l.id, l.kind, l.channel, l.destination, l.message, l.status, l.provider, l.error,
              l.created_at, l.sent_at, l.patient_id, p.patient_number,
              u.first_name || ' ' || u.last_name AS patient_name
         FROM patient_sms_log l
         LEFT JOIN patients p ON p.id = l.patient_id
         LEFT JOIN users u ON u.id = p.user_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY l.created_at DESC
        LIMIT $${params.length}`,
      params
    );
    const counts = await pool.query(
      `SELECT kind,
              COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
         FROM patient_sms_log
        WHERE created_at >= CURRENT_DATE - 30
        GROUP BY kind`
    );
    res.json({ log: rows.rows, last_30_days: counts.rows });
  } catch (error) {
    console.error('Get patient text log error:', error);
    res.status(500).json({ error: 'Failed to load text log' });
  }
};

/** POST /api/patient-texts/run-daily — admin "Run now" for the daily reminders. */
export const runPatientTextsNow = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runDailyPatientTexts();
    await auditService.log({
      userId: (req as any).user?.id,
      action: 'create',
      entityType: 'patient_text_daily_run',
      details: { ...result },
    });
    res.json({ message: 'Daily reminders processed', result });
  } catch (error) {
    console.error('Run patient texts error:', error);
    res.status(500).json({ error: 'Failed to run daily reminders' });
  }
};

/**
 * GET /api/cron/daily-patient-texts — called by Vercel Cron (see vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; refuse anything else, and
 * refuse outright if the secret isn't configured.
 */
export const cronDailyPatientTexts = async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.authorization || '';
  const expected = `Bearer ${secret}`;
  const ok =
    !!secret &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const result = await runDailyPatientTexts();
    res.json({ ok: true, result });
  } catch (error) {
    console.error('Cron daily patient texts error:', error);
    res.status(500).json({ error: 'Daily reminders failed' });
  }
};

/** PUT /api/patients/:id/reminder-opt-out — patient asked for no automatic texts. */
export const setReminderOptOut = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const optOut = req.body?.sms_reminders_opt_out;
    if (typeof optOut !== 'boolean') {
      res.status(400).json({ error: 'sms_reminders_opt_out must be true or false' });
      return;
    }
    const result = await pool.query(
      `UPDATE patients SET sms_reminders_opt_out = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING id, patient_number, sms_reminders_opt_out`,
      [id, optOut]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    await auditService.log({
      userId: (req as any).user?.id,
      action: 'update',
      entityType: 'patient_reminder_opt_out',
      entityId: Number(id),
      details: { sms_reminders_opt_out: optOut },
    });
    res.json({
      message: optOut
        ? 'Patient will no longer get automatic reminder texts.'
        : 'Patient will get automatic reminder texts again.',
      patient: result.rows[0],
    });
  } catch (error) {
    console.error('Set reminder opt-out error:', error);
    res.status(500).json({ error: 'Failed to update reminder preference' });
  }
};
