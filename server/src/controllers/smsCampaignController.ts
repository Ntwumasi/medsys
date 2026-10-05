import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import pool from '../database/db';
import { auditService } from '../services/auditService';
import {
  getArkeselBalance,
  isArkeselSandbox,
  sendArkeselBatch,
  smsParts,
  validatePhoneNumber,
} from '../services/smsService';
import { buildWhere } from './marketingController';
import type { ContactFilters } from './marketingController';

/**
 * Marketing bulk SMS.
 *
 * Flow: marketing writes a campaign (audience filters + message) → the
 * audience is snapshotted → an admin approves → the campaign is sent in
 * batches through Arkesel, each recipient tracked to delivery.
 *
 * Safety rules:
 *  - opted-out patients, merged duplicates and closed records are never in the
 *    audience, and opt-outs are re-checked at the moment of sending;
 *  - real messages only go out from Vercel PRODUCTION with sandbox off.
 *    Everywhere else (staging shares the live patient database) a campaign is
 *    forced into Arkesel sandbox: accepted and logged by Arkesel, never
 *    delivered, never billed;
 *  - campaigns never fall back to another provider.
 */

const MAX_AUDIENCE = 10000;
const BATCH_SIZE = 100;

const realSendsAllowed = (): boolean =>
  process.env.VERCEL_ENV === 'production' && !isArkeselSandbox();

const isAdmin = (req: Request): boolean => {
  const u = (req as any).user;
  return u?.role === 'admin' || u?.is_super_admin === true;
};

const audit = (req: Request, action: 'create' | 'approve' | 'reject' | 'cancel' | 'send', entityId: number | undefined, details: Record<string, unknown>) =>
  auditService.log({
    userId: (req as any).user?.id,
    action,
    entityType: 'sms_campaign',
    entityId,
    details,
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || undefined,
  });

// Arkesel calls our delivery webhook without auth headers, so the URL carries
// a per-campaign signature instead.
const callbackToken = (campaignId: number): string =>
  createHmac('sha256', process.env.JWT_SECRET || 'medsys')
    .update(`sms-campaign:${campaignId}`)
    .digest('hex')
    .slice(0, 32);

const callbackUrlFor = (req: Request, campaignId: number): string | undefined => {
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  if (!host || /localhost|127\.0\.0\.1/.test(host)) return undefined;
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || 'https';
  return `${proto}://${host}/api/sms/arkesel-callback?c=${campaignId}&t=${callbackToken(campaignId)}`;
};

const titleCase = (s: string | null | undefined): string =>
  (s || '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

/** "{first_name}" in the composer → Arkesel's "<%first_name%>" template tag. */
const toArkeselTemplate = (message: string): string => message.replace(/\{first_name\}/g, '<%first_name%>');
const render = (message: string, firstName: string): string =>
  message.replace(/\{first_name\}/g, firstName || 'there');

interface AudienceFilters {
  since?: string | null;
  gender?: string | null;
  min_age?: number | null;
  max_age?: number | null;
}

const cleanFilters = (raw: any): AudienceFilters => {
  const num = (v: unknown): number | null => {
    const n = parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n >= 0 && n <= 130 ? n : null;
  };
  return {
    since: typeof raw?.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.since) ? raw.since : null,
    gender: raw?.gender === 'male' || raw?.gender === 'female' ? raw.gender : null,
    min_age: num(raw?.min_age),
    max_age: num(raw?.max_age),
  };
};

interface AudienceRow {
  patient_id: number;
  phone: string;
  first_name: string;
}

/** Contactable audience for the filters: valid Ghana mobile numbers, one per number. */
const loadAudience = async (filters: AudienceFilters): Promise<{ rows: AudienceRow[]; invalidPhones: number }> => {
  const f: ContactFilters = {
    since: filters.since,
    has: 'phone',
    gender: filters.gender,
    minAge: filters.min_age,
    maxAge: filters.max_age,
  };
  const { where, params } = buildWhere({ ...f, optedOut: false });
  const result = await pool.query(
    `SELECT p.id AS patient_id, u.phone, BTRIM(u.first_name) AS first_name
       FROM patients p
       JOIN users u ON p.user_id = u.id
      WHERE ${where}
      ORDER BY p.id`,
    params
  );
  const seen = new Set<string>();
  const rows: AudienceRow[] = [];
  let invalidPhones = 0;
  for (const r of result.rows) {
    const v = validatePhoneNumber(String(r.phone));
    if (!v.valid) {
      invalidPhones++;
      continue;
    }
    const phone = v.formatted.replace(/^\+/, '');
    if (seen.has(phone)) continue; // family members sharing a phone get one message
    seen.add(phone);
    rows.push({ patient_id: r.patient_id, phone, first_name: titleCase(String(r.first_name || '').split(/\s+/)[0]) });
  }
  return { rows, invalidPhones };
};

const validateMessage = (message: unknown): string | null => {
  if (typeof message !== 'string' || !message.trim()) return 'Write a message';
  if (message.length > 640) return 'Message is too long (max 640 characters, 4 SMS)';
  return null;
};

/** GET /marketing/sms/status — is SMS set up, sandbox or live, balance. */
export const getSmsStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const configured = !!process.env.ARKESEL_API_KEY;
    const balance = configured ? await getArkeselBalance() : { sms: null, main: null };
    res.json({
      configured,
      sender_id: process.env.ARKESEL_SENDER_ID || null,
      live: realSendsAllowed(),
      balance_sms: balance.sms,
      balance_main: balance.main,
    });
  } catch (error) {
    console.error('SMS status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** POST /marketing/sms/preview — audience size, sample and cost for a draft. */
export const previewSmsCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = cleanFilters(req.body?.filters);
    const message = String(req.body?.message || '');
    const { rows, invalidPhones } = await loadAudience(filters);
    const sample = rows[0];
    const rendered = render(message, sample?.first_name || 'Ama');
    const parts = smsParts(rendered || ' ');
    res.json({
      recipients: rows.length,
      invalid_phones: invalidPhones,
      too_many: rows.length > MAX_AUDIENCE,
      max_audience: MAX_AUDIENCE,
      sample_message: rendered,
      parts: parts.parts,
      unicode: parts.unicode,
      length: parts.length,
      credits: rows.length * parts.parts,
    });
  } catch (error) {
    console.error('SMS preview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** POST /marketing/sms/campaigns — create (snapshot audience), awaiting approval. */
export const createSmsCampaign = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const name = String(req.body?.name || '').trim().slice(0, 150);
    const message = String(req.body?.message || '');
    const filters = cleanFilters(req.body?.filters);
    if (!name) {
      res.status(400).json({ error: 'Give the campaign a name' });
      return;
    }
    const msgError = validateMessage(message);
    if (msgError) {
      res.status(400).json({ error: msgError });
      return;
    }
    const { rows } = await loadAudience(filters);
    if (rows.length === 0) {
      res.status(400).json({ error: 'No patients match these filters' });
      return;
    }
    if (rows.length > MAX_AUDIENCE) {
      res.status(400).json({ error: `Audience is ${rows.length}; narrow it to ${MAX_AUDIENCE} or fewer` });
      return;
    }
    const parts = smsParts(render(message, 'Ama')).parts;

    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO sms_campaigns (name, message, filters, sandbox, recipient_count, credits_per_message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, message, JSON.stringify(filters), !realSendsAllowed(), rows.length, parts, (req as any).user?.id]
    );
    const campaign = created.rows[0];
    // Bulk insert the snapshot in chunks.
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      await client.query(
        `INSERT INTO sms_campaign_recipients (campaign_id, patient_id, phone, first_name)
         SELECT $1, x.patient_id, x.phone, x.first_name
           FROM UNNEST($2::int[], $3::text[], $4::text[]) AS x(patient_id, phone, first_name)
         ON CONFLICT (campaign_id, phone) DO NOTHING`,
        [campaign.id, chunk.map((r) => r.patient_id), chunk.map((r) => r.phone), chunk.map((r) => r.first_name)]
      );
    }
    await client.query('COMMIT');
    await audit(req, 'create', campaign.id, { name, recipients: rows.length, filters, sandbox: campaign.sandbox });
    res.status(201).json({ campaign });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Create SMS campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

const CAMPAIGN_SELECT = `
  SELECT c.*,
         cu.first_name || ' ' || cu.last_name AS created_by_name,
         au.first_name || ' ' || au.last_name AS approved_by_name,
         (SELECT COUNT(*) FROM sms_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'pending')::int AS pending_count,
         (SELECT COUNT(*) FROM sms_campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('submitted', 'delivered'))::int AS sent_count,
         (SELECT COUNT(*) FROM sms_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'delivered')::int AS delivered_count,
         (SELECT COUNT(*) FROM sms_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'failed')::int AS failed_count,
         (SELECT COUNT(*) FROM sms_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'skipped')::int AS skipped_count
    FROM sms_campaigns c
    LEFT JOIN users cu ON cu.id = c.created_by
    LEFT JOIN users au ON au.id = c.approved_by`;

/** GET /marketing/sms/campaigns */
export const listSmsCampaigns = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`${CAMPAIGN_SELECT} ORDER BY c.created_at DESC LIMIT 100`);
    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('List SMS campaigns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** GET /marketing/sms/campaigns/:id — campaign + recipients (first 500). */
export const getSmsCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const result = await pool.query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    const recipients = await pool.query(
      `SELECT r.id, r.patient_id, r.phone, r.first_name, r.status, r.delivery_status, r.error, r.updated_at,
              p.patient_number
         FROM sms_campaign_recipients r
         LEFT JOIN patients p ON p.id = r.patient_id
        WHERE r.campaign_id = $1
        ORDER BY CASE r.status WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, r.id
        LIMIT 500`,
      [id]
    );
    res.json({ campaign: result.rows[0], recipients: recipients.rows });
  } catch (error) {
    console.error('Get SMS campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** POST /marketing/sms/campaigns/:id/approve — admin only. */
export const approveSmsCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Only an admin can approve a campaign' });
      return;
    }
    const id = parseInt(req.params.id as string, 10);
    const result = await pool.query(
      `UPDATE sms_campaigns
          SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending_approval'
        RETURNING *`,
      [id, (req as any).user?.id]
    );
    if (result.rows.length === 0) {
      res.status(409).json({ error: 'Only campaigns awaiting approval can be approved' });
      return;
    }
    await audit(req, 'approve', id, {});
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('Approve SMS campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** POST /marketing/sms/campaigns/:id/reject — admin only, with a reason. */
export const rejectSmsCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Only an admin can reject a campaign' });
      return;
    }
    const id = parseInt(req.params.id as string, 10);
    const reason = String(req.body?.reason || '').trim().slice(0, 500) || null;
    const result = await pool.query(
      `UPDATE sms_campaigns
          SET status = 'rejected', rejection_reason = $2, approved_by = $3, approved_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending_approval'
        RETURNING *`,
      [id, reason, (req as any).user?.id]
    );
    if (result.rows.length === 0) {
      res.status(409).json({ error: 'Only campaigns awaiting approval can be rejected' });
      return;
    }
    await audit(req, 'reject', id, { reason });
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('Reject SMS campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** POST /marketing/sms/campaigns/:id/cancel — stops any unsent recipients. */
export const cancelSmsCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const result = await pool.query(
      `UPDATE sms_campaigns SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status IN ('pending_approval', 'approved', 'sending')
        RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(409).json({ error: 'This campaign can no longer be cancelled' });
      return;
    }
    await pool.query(
      `UPDATE sms_campaign_recipients SET status = 'skipped', error = 'Campaign cancelled', updated_at = NOW()
        WHERE campaign_id = $1 AND status = 'pending'`,
      [id]
    );
    await audit(req, 'cancel', id, {});
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('Cancel SMS campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /marketing/sms/campaigns/:id/send-batch — sends the next batch.
 * The browser calls this repeatedly until `remaining` is 0, which keeps each
 * request well inside the serverless time limit and lets the screen show
 * progress. Recipients are claimed with SKIP LOCKED, so two tabs sending the
 * same campaign can never message anyone twice.
 */
export const sendSmsCampaignBatch = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const client = await pool.connect();
  try {
    const campRes = await client.query(`SELECT * FROM sms_campaigns WHERE id = $1`, [id]);
    const campaign = campRes.rows[0];
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    if (!['approved', 'sending'].includes(campaign.status)) {
      res.status(409).json({ error: campaign.status === 'pending_approval' ? 'This campaign needs admin approval before sending' : `Campaign is ${campaign.status}` });
      return;
    }
    // A campaign created in sandbox stays sandbox; a live one is downgraded to
    // sandbox if this environment may not send for real.
    const sandbox = campaign.sandbox || !realSendsAllowed();

    if (campaign.status === 'approved') {
      await client.query(
        `UPDATE sms_campaigns SET status = 'sending', sent_by = $2, started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $1`,
        [id, (req as any).user?.id]
      );
      await audit(req, 'send', id, { sandbox, recipients: campaign.recipient_count });
    }

    // Claim the next batch. Anyone who opted out since the campaign was
    // created is skipped, not messaged.
    await client.query('BEGIN');
    await client.query(
      `UPDATE sms_campaign_recipients r
          SET status = 'skipped', error = 'Opted out of marketing', updated_at = NOW()
         FROM patients p
        WHERE r.campaign_id = $1 AND r.status = 'pending' AND p.id = r.patient_id
          AND (COALESCE(p.marketing_opt_out, false) = true OR p.merged_into IS NOT NULL)`,
      [id]
    );
    const claimed = await client.query(
      `UPDATE sms_campaign_recipients SET status = 'submitted', updated_at = NOW()
        WHERE id IN (
          SELECT id FROM sms_campaign_recipients
           WHERE campaign_id = $1 AND status = 'pending'
           ORDER BY id
           LIMIT $2
           FOR UPDATE SKIP LOCKED)
        RETURNING id, phone, first_name`,
      [id, BATCH_SIZE]
    );
    await client.query('COMMIT');

    let sent = 0;
    let failed = 0;
    if (claimed.rows.length > 0) {
      const personalised = /\{first_name\}/.test(campaign.message);
      const variables: Record<string, Record<string, string>> | undefined = personalised
        ? Object.fromEntries(claimed.rows.map((r) => [r.phone, { first_name: r.first_name || 'there' }]))
        : undefined;
      const result = await sendArkeselBatch({
        recipients: claimed.rows.map((r) => r.phone),
        message: personalised ? toArkeselTemplate(campaign.message) : campaign.message,
        variables,
        callbackUrl: callbackUrlFor(req, id),
        sandbox,
      });

      if (!result.ok) {
        // A whole-batch rejection (sender ID not approved, no balance) would
        // hit every batch the same way. Put the batch back in the queue and
        // stop, so pressing Send again after fixing it carries on.
        await pool.query(
          `UPDATE sms_campaign_recipients SET status = 'pending', error = $2, updated_at = NOW() WHERE id = ANY($1::int[])`,
          [claimed.rows.map((r) => r.id), result.error || 'SMS request failed']
        );
        res.json({ sent: 0, failed: 0, remaining: await pendingCount(id), error: result.error, sandbox, halted: true });
        return;
      }

      const invalid = new Set(result.invalid);
      for (const r of claimed.rows) {
        if (invalid.has(r.phone)) {
          await pool.query(
            `UPDATE sms_campaign_recipients SET status = 'failed', error = 'Invalid number', updated_at = NOW() WHERE id = $1`,
            [r.id]
          );
          failed++;
        } else {
          await pool.query(
            `UPDATE sms_campaign_recipients SET provider_message_id = $2, delivery_status = $3, updated_at = NOW() WHERE id = $1`,
            [r.id, result.ids[r.phone] || null, sandbox ? 'SANDBOX' : 'SUBMITTED']
          );
          sent++;
        }
      }
    }

    const remaining = await pendingCount(id);
    if (remaining === 0) {
      await pool.query(
        `UPDATE sms_campaigns SET status = 'sent', completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'sending'`,
        [id]
      );
    }
    res.json({ sent, failed, remaining, sandbox });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Send SMS campaign batch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

const pendingCount = async (campaignId: number): Promise<number> => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM sms_campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`,
    [campaignId]
  );
  return r.rows[0].n;
};

/**
 * GET|POST /sms/arkesel-callback?c=<campaign>&t=<sig>&sms_id=…&status=…
 * Arkesel's delivery report. Unauthenticated by design (Arkesel can't log in),
 * so the URL carries a signature tied to the campaign.
 */
export const arkeselDeliveryCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = { ...(req.body || {}), ...req.query } as Record<string, string>;
    const campaignId = parseInt(String(q.c || ''), 10);
    const token = String(q.t || '');
    const smsId = String(q.sms_id || '');
    const status = String(q.status || '').toUpperCase().slice(0, 30);
    const expected = Number.isFinite(campaignId) ? callbackToken(campaignId) : '';
    if (!expected || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }
    if (!smsId || !status) {
      res.status(400).json({ error: 'sms_id and status are required' });
      return;
    }
    const newStatus = status === 'DELIVERED' ? 'delivered'
      : ['NOT_DELIVERED', 'EXPIRED', 'PROHIBITED', 'REJECTED', 'FAILED'].includes(status) ? 'failed'
      : null;
    await pool.query(
      `UPDATE sms_campaign_recipients
          SET delivery_status = $3::text,
              status = COALESCE($4::text, status),
              error = CASE WHEN $4::text = 'failed' THEN 'Not delivered: ' || $3::text ELSE error END,
              updated_at = NOW()
        WHERE campaign_id = $1 AND provider_message_id = $2`,
      [campaignId, smsId, status, newStatus]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Arkesel delivery callback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
