import { Request, Response } from 'express';
import pool from '../database/db';
import { aiService } from '../services/aiService';

// GET /admin/reports/staff-activity?period=day|week|month&date=YYYY-MM-DD&ai=1
//
// Per-employee activity summary from audit_logs over a period. Super-admin only
// (for the owners to review staff productivity). Optionally adds an AI narrative.
export const getStaffActivityReport = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as any;
  if (!authReq.user?.is_super_admin) {
    res.status(403).json({ error: 'Super admins only' });
    return;
  }
  try {
    const period = (req.query.period as string) || 'day';
    const baseStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const base = new Date(baseStr + 'T00:00:00');
    if (isNaN(base.getTime())) { res.status(400).json({ error: 'Invalid date' }); return; }

    const start = new Date(base);
    const end = new Date(base);
    if (period === 'week') { start.setDate(start.getDate() - 6); end.setDate(end.getDate() + 1); }
    else if (period === 'month') { start.setDate(1); end.setMonth(end.getMonth() + 1); end.setDate(1); }
    else { end.setDate(end.getDate() + 1); } // day

    const rows = (await pool.query(
      `SELECT al.user_id, u.first_name || ' ' || u.last_name AS name, u.role,
              al.action, al.entity_type, COUNT(*)::int AS cnt,
              MIN(al.created_at) AS first_at, MAX(al.created_at) AS last_at
       FROM audit_logs al JOIN users u ON al.user_id = u.id
       WHERE al.created_at >= $1 AND al.created_at < $2
       GROUP BY al.user_id, name, u.role, al.action, al.entity_type`,
      [start.toISOString(), end.toISOString()]
    )).rows;

    // Logins in range (successful), per user
    const logins = (await pool.query(
      `SELECT user_id, COUNT(*)::int AS cnt FROM login_attempts
       WHERE success = true AND attempted_at >= $1 AND attempted_at < $2 AND user_id IS NOT NULL
       GROUP BY user_id`,
      [start.toISOString(), end.toISOString()]
    ).catch(() => ({ rows: [] }))).rows;
    const loginMap = new Map<number, number>(logins.map((r: any) => [r.user_id, r.cnt]));

    const byUser = new Map<number, any>();
    for (const r of rows) {
      if (!byUser.has(r.user_id)) {
        byUser.set(r.user_id, { user_id: r.user_id, name: r.name, role: r.role, total_actions: 0, logins: loginMap.get(r.user_id) || 0, breakdown: [] as any[], first_at: r.first_at, last_at: r.last_at });
      }
      const e = byUser.get(r.user_id);
      e.total_actions += r.cnt;
      const label = `${r.action} ${String(r.entity_type || '').replace(/_/g, ' ')}`.trim();
      e.breakdown.push({ label, count: r.cnt });
      if (new Date(r.first_at) < new Date(e.first_at)) e.first_at = r.first_at;
      if (new Date(r.last_at) > new Date(e.last_at)) e.last_at = r.last_at;
    }
    const employees = Array.from(byUser.values())
      .map((e) => ({ ...e, breakdown: e.breakdown.sort((a: any, b: any) => b.count - a.count) }))
      .sort((a, b) => b.total_actions - a.total_actions);

    let ai_summary: string | null = null;
    if (req.query.ai && aiService.isAvailable && aiService.isAvailable() && (aiService as any).summarizeStaffActivity) {
      ai_summary = await (aiService as any).summarizeStaffActivity(period, employees);
    }

    res.json({
      period,
      start: start.toISOString(),
      end: end.toISOString(),
      employees,
      ai_summary,
      ai_available: !!(aiService.isAvailable && aiService.isAvailable()),
    });
  } catch (error) {
    console.error('Staff activity report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /admin/reports/doctor-revenue?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Per-doctor revenue summary for a date range, broken down by the
// invoice_item.category (consult / lab / pharmacy / imaging / other).
// Used by the admin Doctor Revenue tab.
//
// Revenue attribution model:
//   - Each invoice belongs to an encounter (i.encounter_id)
//   - Each encounter has one provider_id (the doctor of record)
//   - All invoice_items on that invoice attribute to that doctor
// This is the simplest defensible model. If a nurse-ordered lab on a
// doctor-owned encounter, the revenue still goes to that doctor — which
// matches how clinics typically attribute revenue (by chart, not by
// keystroke).
export const getDoctorRevenue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start, end } = req.query as { start?: string; end?: string };

    // Default: current calendar month
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const startDate = start || defaultStart;
    const endDate = end || defaultEnd;

    // Per-doctor, per-category sums. invoice_date is the billable date.
    const query = `
      SELECT
        e.provider_id,
        u.first_name || ' ' || u.last_name AS doctor_name,
        u.clinic AS doctor_clinic,
        LOWER(COALESCE(ii.category, 'other')) AS category,
        COALESCE(SUM(ii.total_price), 0) AS amount,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoice_items ii
      JOIN invoices i  ON ii.invoice_id = i.id
      JOIN encounters e ON i.encounter_id = e.id
      JOIN users u     ON e.provider_id = u.id
      WHERE u.role = 'doctor'
        AND DATE(i.invoice_date) >= $1::date
        AND DATE(i.invoice_date) <= $2::date
      GROUP BY e.provider_id, u.first_name, u.last_name, u.clinic, LOWER(COALESCE(ii.category, 'other'))
      ORDER BY u.last_name ASC, u.first_name ASC
    `;
    const result = await pool.query(query, [startDate, endDate]);

    // Pivot category rows into a per-doctor object so the client can render
    // a clean table without further grouping.
    interface DoctorRow {
      provider_id: number;
      doctor_name: string;
      doctor_clinic: string | null;
      by_category: Record<string, number>;
      total: number;
      invoice_count: number;
    }
    const byDoctor = new Map<number, DoctorRow>();
    for (const row of result.rows) {
      const pid = row.provider_id;
      const amount = parseFloat(row.amount) || 0;
      const invoices = parseInt(row.invoice_count) || 0;
      if (!byDoctor.has(pid)) {
        byDoctor.set(pid, {
          provider_id: pid,
          doctor_name: row.doctor_name,
          doctor_clinic: row.doctor_clinic,
          by_category: {},
          total: 0,
          invoice_count: 0,
        });
      }
      const doc = byDoctor.get(pid)!;
      doc.by_category[row.category] = (doc.by_category[row.category] || 0) + amount;
      doc.total += amount;
      // invoice_count is per-category aggregation; we want distinct invoices
      // per doctor. Use max as a safe approximation (a single invoice may
      // span categories, so summing would double-count).
      doc.invoice_count = Math.max(doc.invoice_count, invoices);
    }

    const doctors = Array.from(byDoctor.values()).sort((a, b) => b.total - a.total);

    // Collect all category keys we saw — drives the column set on the client.
    const categories = Array.from(
      new Set(doctors.flatMap(d => Object.keys(d.by_category)))
    ).sort();

    // Grand totals row
    const grandTotal = doctors.reduce((sum, d) => sum + d.total, 0);
    const totalsByCategory: Record<string, number> = {};
    for (const d of doctors) {
      for (const [cat, amt] of Object.entries(d.by_category)) {
        totalsByCategory[cat] = (totalsByCategory[cat] || 0) + amt;
      }
    }

    res.json({
      start_date: startDate,
      end_date: endDate,
      doctors,
      categories,
      totals: {
        grand_total: grandTotal,
        by_category: totalsByCategory,
      },
    });
  } catch (error) {
    console.error('Get doctor revenue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /admin/reports/doctor-revenue/lines?provider_id=&start=&end=
//
// Per-line-item drill-down for a single doctor in a date range. Returns
// one row per distinct service description with quantity, count of times
// billed, and total revenue — modeled after the "Physician Production"
// breakdown the user uses on paper. Optionally filter by category.
export const getDoctorRevenueLines = async (req: Request, res: Response): Promise<void> => {
  try {
    const providerId = parseInt(String(req.query.provider_id || ''), 10);
    if (!providerId) {
      res.status(400).json({ error: 'provider_id is required' });
      return;
    }
    const { start, end, category } = req.query as { start?: string; end?: string; category?: string };

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const startDate = start || defaultStart;
    const endDate = end || defaultEnd;

    const params: any[] = [providerId, startDate, endDate];
    let categoryClause = '';
    if (category) {
      params.push(category);
      categoryClause = `AND LOWER(COALESCE(ii.category, 'other')) = LOWER($${params.length})`;
    }

    // Aggregate by (category, description) so similarly-named items roll up.
    const linesSql = `
      SELECT
        LOWER(COALESCE(ii.category, 'other'))     AS category,
        ii.description                            AS description,
        COUNT(*)::int                             AS line_count,
        COALESCE(SUM(ii.quantity), 0)::int        AS quantity,
        COALESCE(SUM(ii.total_price), 0)          AS total
      FROM invoice_items ii
      JOIN invoices i  ON ii.invoice_id = i.id
      JOIN encounters e ON i.encounter_id = e.id
      WHERE e.provider_id = $1
        AND DATE(i.invoice_date) >= $2::date
        AND DATE(i.invoice_date) <= $3::date
        ${categoryClause}
      GROUP BY LOWER(COALESCE(ii.category, 'other')), ii.description
      ORDER BY total DESC
    `;
    const linesResult = await pool.query(linesSql, params);

    const lines = linesResult.rows.map(r => ({
      category: r.category,
      description: r.description,
      line_count: parseInt(r.line_count) || 0,
      quantity: parseInt(r.quantity) || 0,
      total: parseFloat(r.total) || 0,
    }));

    // Per-category subtotals for the drill-down panel.
    const categoryTotals: Record<string, number> = {};
    for (const l of lines) {
      categoryTotals[l.category] = (categoryTotals[l.category] || 0) + l.total;
    }
    const grandTotal = lines.reduce((s, l) => s + l.total, 0);

    // Doctor's display name for the report header.
    const doctorResult = await pool.query(
      `SELECT first_name || ' ' || last_name AS doctor_name, clinic
         FROM users WHERE id = $1`,
      [providerId]
    );
    const doctorName = doctorResult.rows[0]?.doctor_name || 'Unknown';
    const doctorClinic = doctorResult.rows[0]?.clinic || null;

    res.json({
      provider_id: providerId,
      doctor_name: doctorName,
      doctor_clinic: doctorClinic,
      start_date: startDate,
      end_date: endDate,
      lines,
      totals: {
        grand_total: grandTotal,
        by_category: categoryTotals,
      },
    });
  } catch (error) {
    console.error('Get doctor revenue lines error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
