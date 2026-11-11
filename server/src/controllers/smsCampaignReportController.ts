import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../database/db';
import { auditService } from '../services/auditService';
import { optedOutPatientPhonesSql } from './marketingImportController';

/**
 * Bulk SMS reports (read-only), modelled on the Arkesel dashboard reports:
 *  - one campaign: counts, delivery rate, credits, who/when, opt-outs since;
 *  - its recipients as an Excel download;
 *  - a month-by-month summary across campaigns.
 *
 * Definitions used throughout:
 *  - "sent to Arkesel" (attempted) = submitted + delivered + failed. Pending
 *    and skipped recipients were never sent.
 *  - delivery rate = delivered / attempted. "submitted" means Arkesel accepted
 *    the message but no delivery report has arrived (sandbox never sends one).
 *  - credits = credits_per_message × messages Arkesel accepted (submitted,
 *    delivered, or failed after Arkesel gave it a message id — a number Arkesel
 *    rejected up front is not charged). credits_per_message is worked out when
 *    the campaign is created from the message with a sample first name, so for
 *    "{first_name}" messages it's an estimate. Sandbox campaigns are never
 *    charged. Arkesel does not tell us a cedi price per credit, so there is no
 *    GHS cost.
 */

const SUMMARY_MONTHS = 6;

const rate = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export interface CampaignCountsRow {
  recipient_count: number;
  credits_per_message: number;
  sandbox: boolean;
  pending: number;
  submitted: number;
  delivered: number;
  failed: number;
  skipped: number;
  skipped_opted_out: number;
  accepted: number;
}

/** The numbers on a campaign report, from the per-status counts. */
export const campaignReportNumbers = (row: CampaignCountsRow, optedOutSince: number) => {
  const n = (v: unknown) => Number(v) || 0;
  const pending = n(row.pending);
  const submitted = n(row.submitted);
  const delivered = n(row.delivered);
  const failed = n(row.failed);
  const skipped = n(row.skipped);
  const attempted = submitted + delivered + failed;
  const cpm = n(row.credits_per_message) || 1;
  const creditsUsed = n(row.accepted) * cpm;
  return {
    recipients: n(row.recipient_count) || pending + attempted + skipped,
    pending,
    submitted,
    delivered,
    failed,
    skipped,
    skipped_opted_out: n(row.skipped_opted_out),
    attempted,
    delivery_rate: rate(delivered, attempted),
    credits_per_message: cpm,
    credits_estimated: n(row.recipient_count) * cpm,
    credits_used: creditsUsed,
    credits_charged: row.sandbox ? 0 : creditsUsed,
    opted_out_since: optedOutSince,
  };
};

const COUNTS_SQL = `
  COUNT(r.id) FILTER (WHERE r.status = 'pending')::int AS pending,
  COUNT(r.id) FILTER (WHERE r.status = 'submitted')::int AS submitted,
  COUNT(r.id) FILTER (WHERE r.status = 'delivered')::int AS delivered,
  COUNT(r.id) FILTER (WHERE r.status = 'failed')::int AS failed,
  COUNT(r.id) FILTER (WHERE r.status = 'skipped')::int AS skipped,
  COUNT(r.id) FILTER (WHERE r.status = 'skipped' AND r.error = 'Opted out of marketing')::int AS skipped_opted_out,
  COUNT(r.id) FILTER (WHERE r.status IN ('submitted', 'delivered')
                         OR (r.status = 'failed' AND r.provider_message_id IS NOT NULL))::int AS accepted`;

const parseId = (req: Request): number | null => {
  const id = parseInt(String(req.params.id ?? ''), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

/** GET /marketing/sms/campaigns/:id/report */
export const getSmsCampaignReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseId(req);
    if (!id) {
      res.status(400).json({ error: 'Invalid campaign id' });
      return;
    }
    const result = await pool.query(
      `SELECT c.id, c.name, c.message, c.status, c.sandbox, c.filters, c.recipient_count, c.credits_per_message,
              c.created_at, c.approved_at, c.started_at, c.completed_at, c.rejection_reason,
              NULLIF(BTRIM(CONCAT_WS(' ', cu.first_name, cu.last_name)), '') AS created_by_name,
              NULLIF(BTRIM(CONCAT_WS(' ', au.first_name, au.last_name)), '') AS approved_by_name,
              NULLIF(BTRIM(CONCAT_WS(' ', su.first_name, su.last_name)), '') AS sent_by_name,
              ${COUNTS_SQL}
         FROM sms_campaigns c
         LEFT JOIN users cu ON cu.id = c.created_by
         LEFT JOIN users au ON au.id = c.approved_by
         LEFT JOIN users su ON su.id = c.sent_by
         LEFT JOIN sms_campaign_recipients r ON r.campaign_id = c.id
        WHERE c.id = $1
        GROUP BY c.id, cu.first_name, cu.last_name, au.first_name, au.last_name, su.first_name, su.last_name`,
      [id]
    );
    const c = result.rows[0];
    if (!c) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Recipients who were messaged and are opted out now. Opt-outs are checked
    // at the moment of sending, so anyone messaged was not opted out then: they
    // opted out after receiving it. An imported contact counts if the contact
    // was marked opted out, or its number belongs to an opted-out patient.
    const opted = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM sms_campaign_recipients r
         LEFT JOIN patients p ON p.id = r.patient_id
         LEFT JOIN marketing_contacts mc ON mc.id = r.contact_id
        WHERE r.campaign_id = $1
          AND r.status IN ('submitted', 'delivered', 'failed')
          AND (COALESCE(p.marketing_opt_out, false) = true
               OR COALESCE(mc.opted_out, false) = true
               OR (r.patient_id IS NULL AND r.phone IN (${optedOutPatientPhonesSql})))`,
      [id]
    );

    res.json({
      campaign: {
        id: c.id,
        name: c.name,
        message: c.message,
        status: c.status,
        sandbox: c.sandbox,
        filters: c.filters,
        rejection_reason: c.rejection_reason,
        created_by_name: c.created_by_name,
        created_at: c.created_at,
        approved_by_name: c.approved_by_name,
        approved_at: c.approved_at,
        sent_by_name: c.sent_by_name,
        started_at: c.started_at,
        completed_at: c.completed_at,
      },
      numbers: campaignReportNumbers(c, opted.rows[0]?.n ?? 0),
    });
  } catch (error) {
    console.error('SMS campaign report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** "October BP check!" → "october-bp-check" (safe in a filename). */
export const slugify = (name: string): string =>
  String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'campaign';

export const recipientsFilename = (id: number, name: string): string => `campaign-${id}-${slugify(name)}-recipients.xlsx`;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Not sent yet',
  submitted: 'Sent (awaiting delivery report)',
  delivered: 'Delivered',
  failed: 'Failed',
  skipped: 'Skipped',
};

/** GET /marketing/sms/campaigns/:id/recipients/export — every recipient as .xlsx */
export const exportSmsCampaignRecipients = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseId(req);
    if (!id) {
      res.status(400).json({ error: 'Invalid campaign id' });
      return;
    }
    const camp = await pool.query(`SELECT id, name, sandbox FROM sms_campaigns WHERE id = $1`, [id]);
    if (camp.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    const campaign = camp.rows[0];
    const recipients = await pool.query(
      `SELECT r.id, r.patient_id, r.contact_id, r.phone, r.status, r.delivery_status, r.error, r.updated_at,
              p.patient_number,
              COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', pu.first_name, pu.last_name)), ''),
                       NULLIF(BTRIM(CONCAT_WS(' ', mc.first_name, mc.last_name)), ''),
                       r.first_name) AS name
         FROM sms_campaign_recipients r
         LEFT JOIN patients p ON p.id = r.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN marketing_contacts mc ON mc.id = r.contact_id
        WHERE r.campaign_id = $1
        ORDER BY r.id`,
      [id]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Recipients');
    sheet.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Patient #', key: 'patient', width: 20 },
      { header: 'Status', key: 'status', width: 30 },
      { header: 'Delivery Status', key: 'delivery_status', width: 18 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Last Updated', key: 'updated_at', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of recipients.rows) {
      sheet.addRow({
        name: r.name || '',
        phone: r.phone,
        patient: r.patient_number || (r.patient_id ? '' : 'Imported contact'),
        status: STATUS_LABEL[r.status] || r.status,
        delivery_status: r.delivery_status || '',
        note: r.error || '',
        updated_at: r.updated_at ? new Date(r.updated_at) : null,
      });
    }
    sheet.getColumn('updated_at').numFmt = 'yyyy-mm-dd hh:mm';
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Names and phone numbers leaving the system: record who took them.
    await auditService.log({
      userId: (req as any).user?.id,
      action: 'export',
      entityType: 'sms_campaign_recipients',
      entityId: id,
      details: { rows: recipients.rows.length, format: 'xlsx' },
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || undefined,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${recipientsFilename(id, campaign.name)}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (error) {
    console.error('Export SMS campaign recipients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export interface MonthRow {
  month: string;
  campaigns: number;
  attempted: number;
  delivered: number;
  failed: number;
  credits_used: number;
}

/** Adds delivery rates and the totals row to the per-month figures. */
export const summarizeMonths = (rows: MonthRow[]) => {
  const months = rows.map((r) => {
    const m = {
      month: r.month,
      campaigns: Number(r.campaigns) || 0,
      attempted: Number(r.attempted) || 0,
      delivered: Number(r.delivered) || 0,
      failed: Number(r.failed) || 0,
      credits_used: Number(r.credits_used) || 0,
    };
    return { ...m, delivery_rate: rate(m.delivered, m.attempted) };
  });
  const sum = (k: 'campaigns' | 'attempted' | 'delivered' | 'failed' | 'credits_used') =>
    months.reduce((t, m) => t + m[k], 0);
  const totals = {
    campaigns: sum('campaigns'),
    attempted: sum('attempted'),
    delivered: sum('delivered'),
    failed: sum('failed'),
    credits_used: sum('credits_used'),
  };
  return { months, totals: { ...totals, delivery_rate: rate(totals.delivered, totals.attempted) } };
};

/**
 * GET /marketing/sms/reports/summary?include_sandbox=1
 * Last 6 calendar months (oldest first, empty months included). A campaign
 * counts in the month it started sending. Sandbox (test) campaigns are left
 * out unless asked for.
 */
export const getSmsCampaignSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const includeSandbox = ['1', 'true', 'yes'].includes(String(req.query.include_sandbox || '').toLowerCase());
    const result = await pool.query(
      `WITH months AS (
         SELECT generate_series(
                  date_trunc('month', NOW()) - make_interval(months => $1::int - 1),
                  date_trunc('month', NOW()),
                  INTERVAL '1 month') AS month
       ),
       camp AS (
         SELECT c.id, c.credits_per_message, date_trunc('month', c.started_at) AS month
           FROM sms_campaigns c
          WHERE c.started_at IS NOT NULL
            AND c.started_at >= (SELECT MIN(month) FROM months)
            AND ($2::boolean OR c.sandbox = false)
       ),
       stats AS (
         SELECT camp.month,
                COUNT(DISTINCT camp.id)::int AS campaigns,
                COUNT(r.id) FILTER (WHERE r.status IN ('submitted', 'delivered', 'failed'))::int AS attempted,
                COUNT(r.id) FILTER (WHERE r.status = 'delivered')::int AS delivered,
                COUNT(r.id) FILTER (WHERE r.status = 'failed')::int AS failed,
                COALESCE(SUM(camp.credits_per_message) FILTER (
                  WHERE r.status IN ('submitted', 'delivered')
                     OR (r.status = 'failed' AND r.provider_message_id IS NOT NULL)), 0)::int AS credits_used
           FROM camp
           LEFT JOIN sms_campaign_recipients r ON r.campaign_id = camp.id
          GROUP BY camp.month
       )
       SELECT to_char(m.month, 'YYYY-MM') AS month,
              COALESCE(s.campaigns, 0) AS campaigns,
              COALESCE(s.attempted, 0) AS attempted,
              COALESCE(s.delivered, 0) AS delivered,
              COALESCE(s.failed, 0) AS failed,
              COALESCE(s.credits_used, 0) AS credits_used
         FROM months m
         LEFT JOIN stats s ON s.month = m.month
        ORDER BY m.month`,
      [SUMMARY_MONTHS, includeSandbox]
    );
    res.json({ include_sandbox: includeSandbox, ...summarizeMonths(result.rows) });
  } catch (error) {
    console.error('SMS campaign summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
