import { Request, Response } from 'express';
import pool from '../database/db';
import notificationService from '../services/notificationService';
import { sendSMS, validatePhoneNumber } from '../services/smsService';
import { createPortalToken, portalLinkFor } from './patientPortalController';
import { getTextSettings } from '../services/patientAutoTextService';

/**
 * Patient ↔ front desk messages. One conversation per patient. Patients write
 * from the portal; receptionists and admins answer from the receptionist
 * dashboard. The patient is texted a link when the clinic replies (the text
 * never repeats the message — phones are often shared).
 */

const MAX_LENGTH = 1000;
const PATIENT_DAILY_LIMIT = 20;

const patientIdFor = async (req: Request): Promise<number | null> => {
  const userId = (req as any).user?.id;
  if (!userId) return null;
  const r = await pool.query(`SELECT id FROM patients WHERE user_id = $1 AND merged_into IS NULL LIMIT 1`, [userId]);
  return r.rows[0]?.id ?? null;
};

const cleanBody = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const body = raw.trim();
  return body && body.length <= MAX_LENGTH ? body : null;
};

const thread = (patientId: number) =>
  pool.query(
    `SELECT m.id, m.sender, m.body, m.created_at, m.read_by_patient_at, m.read_by_staff_at,
            CASE WHEN m.sender = 'staff' THEN u.first_name END AS staff_first_name
       FROM patient_portal_messages m
       LEFT JOIN users u ON u.id = m.staff_user_id
      WHERE m.patient_id = $1
      ORDER BY m.created_at, m.id`,
    [patientId]
  );

// ---------------------------------------------------------------------------
// Patient side
// ---------------------------------------------------------------------------

/** GET /patient-portal/messages — the patient's conversation; marks replies read. */
export const getMyMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const patientId = await patientIdFor(req);
    if (!patientId) { res.status(404).json({ error: 'Patient record not found' }); return; }
    const rows = await thread(patientId);
    await pool.query(
      `UPDATE patient_portal_messages SET read_by_patient_at = CURRENT_TIMESTAMP
        WHERE patient_id = $1 AND sender = 'staff' AND read_by_patient_at IS NULL`,
      [patientId]
    );
    res.json({
      messages: rows.rows.map((m) => ({
        id: m.id, sender: m.sender, body: m.body, created_at: m.created_at,
        staff_name: m.staff_first_name || null,
        read: m.sender === 'patient' ? !!m.read_by_staff_at : true,
      })),
    });
  } catch (error) {
    console.error('Portal get messages error:', error);
    res.status(500).json({ error: 'Could not load your messages' });
  }
};

/** POST /patient-portal/messages { body } */
export const sendMyMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const patientId = await patientIdFor(req);
    if (!patientId) { res.status(404).json({ error: 'Patient record not found' }); return; }
    const body = cleanBody(req.body?.body);
    if (!body) { res.status(400).json({ error: `Please write a message (up to ${MAX_LENGTH} characters).` }); return; }

    const today = await pool.query(
      `SELECT COUNT(*)::int AS n FROM patient_portal_messages
        WHERE patient_id = $1 AND sender = 'patient' AND created_at > NOW() - INTERVAL '1 day'`,
      [patientId]
    );
    if (today.rows[0].n >= PATIENT_DAILY_LIMIT) {
      res.status(429).json({ error: 'You have sent a lot of messages today. Please call the clinic if it is urgent.' });
      return;
    }

    const r = await pool.query(
      `INSERT INTO patient_portal_messages (patient_id, sender, body) VALUES ($1, 'patient', $2)
       RETURNING id, created_at`,
      [patientId, body]
    );
    const p = await pool.query(
      `SELECT u.first_name || ' ' || u.last_name AS name, p.patient_number
         FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
      [patientId]
    );
    // Never let a notification problem lose the patient's message.
    notificationService.sendToRole('receptionist', {
      type: 'patient_alert',
      title: 'New patient message',
      message: `${p.rows[0]?.name || 'A patient'} (${p.rows[0]?.patient_number || ''}) sent a message from the portal.`,
      entityType: 'portal_message',
      entityId: patientId,
    }).catch((e) => console.error('[portal-messages] notify failed:', e));

    res.status(201).json({ message: { id: r.rows[0].id, sender: 'patient', body, created_at: r.rows[0].created_at, staff_name: null, read: false } });
  } catch (error) {
    console.error('Portal send message error:', error);
    res.status(500).json({ error: 'Your message could not be sent. Please try again.' });
  }
};

// ---------------------------------------------------------------------------
// Staff side (receptionist / admin)
// ---------------------------------------------------------------------------

/** GET /portal-messages — conversations, unanswered first. */
export const listConversations = async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT m.patient_id, p.patient_number,
              u.first_name || ' ' || u.last_name AS patient_name,
              to_char(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              last.body AS last_body, last.sender AS last_sender, last.created_at AS last_at,
              COUNT(*) FILTER (WHERE m.sender = 'patient' AND m.read_by_staff_at IS NULL)::int AS unread
         FROM patient_portal_messages m
         JOIN patients p ON p.id = m.patient_id
         JOIN users u ON u.id = p.user_id
         JOIN LATERAL (
           SELECT body, sender, created_at FROM patient_portal_messages x
            WHERE x.patient_id = m.patient_id ORDER BY created_at DESC, id DESC LIMIT 1
         ) last ON true
        GROUP BY m.patient_id, p.patient_number, u.first_name, u.last_name, p.date_of_birth, last.body, last.sender, last.created_at
        ORDER BY (last.sender = 'patient') DESC, last.created_at DESC
        LIMIT 200`
    );
    res.json({
      conversations: r.rows,
      unread_total: r.rows.reduce((s, c) => s + c.unread, 0),
    });
  } catch (error) {
    console.error('List portal conversations error:', error);
    res.status(500).json({ error: 'Could not load patient messages' });
  }
};

/** GET /portal-messages/:patient_id — one conversation; marks the patient's messages read. */
export const getConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const patientId = parseInt(String(req.params.patient_id), 10);
    if (!patientId) { res.status(400).json({ error: 'Invalid patient' }); return; }
    const p = await pool.query(
      `SELECT p.id, p.patient_number, u.first_name || ' ' || u.last_name AS patient_name,
              to_char(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth
         FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
      [patientId]
    );
    if (!p.rows.length) { res.status(404).json({ error: 'Patient not found' }); return; }
    const rows = await thread(patientId);
    await pool.query(
      `UPDATE patient_portal_messages SET read_by_staff_at = CURRENT_TIMESTAMP, read_by_staff_user_id = $2
        WHERE patient_id = $1 AND sender = 'patient' AND read_by_staff_at IS NULL`,
      [patientId, (req as any).user?.id || null]
    );
    res.json({
      patient: p.rows[0],
      messages: rows.rows.map((m) => ({
        id: m.id, sender: m.sender, body: m.body, created_at: m.created_at,
        staff_name: m.staff_first_name || null,
        read_by_patient: m.sender === 'staff' ? !!m.read_by_patient_at : null,
      })),
    });
  } catch (error) {
    console.error('Get portal conversation error:', error);
    res.status(500).json({ error: 'Could not load the conversation' });
  }
};

/** POST /portal-messages/:patient_id { body } — reply, then text the patient a link. */
export const replyToPatient = async (req: Request, res: Response): Promise<void> => {
  try {
    const patientId = parseInt(String(req.params.patient_id), 10);
    const staffId = (req as any).user?.id || null;
    const body = cleanBody(req.body?.body);
    if (!patientId) { res.status(400).json({ error: 'Invalid patient' }); return; }
    if (!body) { res.status(400).json({ error: `Please write a reply (up to ${MAX_LENGTH} characters).` }); return; }

    const p = await pool.query(
      `SELECT u.phone, u.first_name, u.last_name, (p.merged_into IS NOT NULL) AS merged
         FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
      [patientId]
    );
    if (!p.rows.length) { res.status(404).json({ error: 'Patient not found' }); return; }

    const r = await pool.query(
      `INSERT INTO patient_portal_messages (patient_id, sender, staff_user_id, body)
       VALUES ($1, 'staff', $2, $3) RETURNING id, created_at`,
      [patientId, staffId, body]
    );
    // Answering also clears anything still unread.
    await pool.query(
      `UPDATE patient_portal_messages SET read_by_staff_at = CURRENT_TIMESTAMP, read_by_staff_user_id = $2
        WHERE patient_id = $1 AND sender = 'patient' AND read_by_staff_at IS NULL`,
      [patientId, staffId]
    );

    // Text the patient that there's a reply. The reply is saved either way;
    // the response says honestly whether the text went.
    let texted = false;
    const phone = p.rows[0].phone ? validatePhoneNumber(p.rows[0].phone) : null;
    if (phone?.valid && !p.rows[0].merged) {
      const s = await getTextSettings();
      const token = await createPortalToken(patientId, { purpose: 'notify', target: 'messages', deliveryMethod: 'staff', sentBy: staffId });
      const first = String(p.rows[0].first_name || '').trim().split(/\s+/)[0] || 'there';
      const sms = await sendSMS(
        phone.formatted,
        `Hello ${first}, ${s.clinicName} has replied to your message. Read it here: ${portalLinkFor(token)} (valid 7 days).`
      );
      texted = sms.success;
    }

    res.status(201).json({
      message: { id: r.rows[0].id, sender: 'staff', body, created_at: r.rows[0].created_at, read_by_patient: false },
      texted,
    });
  } catch (error) {
    console.error('Reply to patient error:', error);
    res.status(500).json({ error: 'Your reply could not be sent. Please try again.' });
  }
};
