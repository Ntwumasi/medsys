import { Request, Response } from 'express';
import pool from '../database/db';

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
