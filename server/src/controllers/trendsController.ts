import { Request, Response } from 'express';
import pool from '../database/db';

// Trend endpoints that power the sparklines on each dashboard. One
// controller, one endpoint per dashboard area. Each returns several
// named series so the client can render multiple sparklines from a
// single request.
//
// Generating each per-day bucket on the database side keeps the
// payload small (an array of {day, value} entries) and avoids shipping
// raw rows to the browser.

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

const parseDays = (raw: unknown): number => {
  const n = parseInt(String(raw || ''), 10);
  if (Number.isFinite(n) && n > 0 && n <= MAX_DAYS) return n;
  return DEFAULT_DAYS;
};

// Builds a complete day index from N days ago through today so empty
// buckets show up as zero (otherwise sparklines lie about "no data" days).
const buildDayIndex = (days: number): string[] => {
  const out: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

interface DayRow { day: string; value: number }

// Joins a sparse SQL result (only days with data) onto the full day index
// so the client always gets a continuous series.
const fillSeries = (
  rows: Array<{ day: string; value: string | number }>,
  index: string[],
): DayRow[] => {
  const map = new Map<string, number>();
  for (const r of rows) {
    const day = typeof r.day === 'string' ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10);
    map.set(day, typeof r.value === 'number' ? r.value : parseFloat(r.value) || 0);
  }
  return index.map((day) => ({ day, value: map.get(day) || 0 }));
};

// GET /admin/trends?days=30
// Series: tasks_created (per day), tasks_completed (per day),
// appointments (count per day).
export const getAdminTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseDays(req.query.days);
    const index = buildDayIndex(days);
    const since = index[0];

    const tasksCreated = await pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*)::int AS value
         FROM admin_tasks
        WHERE created_at >= $1::date
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC`,
      [since],
    );
    const tasksCompleted = await pool.query(
      `SELECT DATE(updated_at) AS day, COUNT(*)::int AS value
         FROM admin_tasks
        WHERE status = 'complete' AND updated_at >= $1::date
        GROUP BY DATE(updated_at)
        ORDER BY DATE(updated_at) ASC`,
      [since],
    );
    const appointments = await pool.query(
      `SELECT DATE(appointment_date) AS day, COUNT(*)::int AS value
         FROM appointments
        WHERE appointment_date >= $1::date
          AND appointment_date < ($1::date + INTERVAL '${days + 1} days')
        GROUP BY DATE(appointment_date)
        ORDER BY DATE(appointment_date) ASC`,
      [since],
    );

    res.json({
      days,
      series: {
        tasks_created: fillSeries(tasksCreated.rows, index),
        tasks_completed: fillSeries(tasksCompleted.rows, index),
        appointments: fillSeries(appointments.rows, index),
      },
    });
  } catch (error) {
    console.error('Admin trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /lab/trends?days=30
// Series: orders_created, orders_completed, stat_orders, critical_alerts,
// avg_tat_hours (per day, averaged across completed orders that day).
export const getLabTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseDays(req.query.days);
    const index = buildDayIndex(days);
    const since = index[0];

    const created = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM lab_orders
        WHERE ordered_date >= $1::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [since],
    );
    const completed = await pool.query(
      `SELECT DATE(result_date) AS day, COUNT(*)::int AS value
         FROM lab_orders
        WHERE result_date IS NOT NULL AND result_date >= $1::date
        GROUP BY DATE(result_date)
        ORDER BY DATE(result_date) ASC`,
      [since],
    );
    const stat = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM lab_orders
        WHERE priority = 'stat' AND ordered_date >= $1::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [since],
    );
    // avg_tat_hours uses time between ordered_date and result_date for
    // orders completed each day. Days with no completions stay at 0.
    const tat = await pool.query(
      `SELECT DATE(result_date) AS day,
              ROUND(AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600.0)::numeric, 2)::float AS value
         FROM lab_orders
        WHERE result_date IS NOT NULL
          AND ordered_date IS NOT NULL
          AND result_date >= $1::date
        GROUP BY DATE(result_date)
        ORDER BY DATE(result_date) ASC`,
      [since],
    );
    // Critical alerts created per day. Schema-safe: only query if the
    // table exists, otherwise return empty.
    let critical: { rows: Array<{ day: string; value: string | number }> } = { rows: [] };
    try {
      critical = await pool.query(
        `SELECT DATE(created_at) AS day, COUNT(*)::int AS value
           FROM critical_result_alerts
          WHERE created_at >= $1::date
          GROUP BY DATE(created_at)
          ORDER BY DATE(created_at) ASC`,
        [since],
      );
    } catch {
      /* table may not exist on older deploys */
    }

    res.json({
      days,
      series: {
        orders_created: fillSeries(created.rows, index),
        orders_completed: fillSeries(completed.rows, index),
        stat_orders: fillSeries(stat.rows, index),
        avg_tat_hours: fillSeries(tat.rows, index),
        critical_alerts: fillSeries(critical.rows, index),
      },
    });
  } catch (error) {
    console.error('Lab trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /accountant/trends?days=30
// Series: billed (sum of invoice_date totals), collected (sum of payments),
// outstanding (running daily balance).
export const getAccountantTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseDays(req.query.days);
    const index = buildDayIndex(days);
    const since = index[0];

    const billed = await pool.query(
      `SELECT DATE(invoice_date) AS day, COALESCE(SUM(total_amount), 0)::float AS value
         FROM invoices
        WHERE invoice_date >= $1::date
        GROUP BY DATE(invoice_date)
        ORDER BY DATE(invoice_date) ASC`,
      [since],
    );
    const collected = await pool.query(
      `SELECT DATE(invoice_date) AS day, COALESCE(SUM(amount_paid), 0)::float AS value
         FROM invoices
        WHERE invoice_date >= $1::date
        GROUP BY DATE(invoice_date)
        ORDER BY DATE(invoice_date) ASC`,
      [since],
    );
    // Daily outstanding (sum of balance on invoices created up to and
    // including that day, minus payments). Approximation — uses
    // current balance row state per invoice grouped by invoice_date,
    // which is good enough for a sparkline trend.
    const outstanding = await pool.query(
      `SELECT DATE(invoice_date) AS day, COALESCE(SUM(balance), 0)::float AS value
         FROM invoices
        WHERE invoice_date >= $1::date AND balance > 0
        GROUP BY DATE(invoice_date)
        ORDER BY DATE(invoice_date) ASC`,
      [since],
    );

    res.json({
      days,
      series: {
        billed: fillSeries(billed.rows, index),
        collected: fillSeries(collected.rows, index),
        outstanding: fillSeries(outstanding.rows, index),
      },
    });
  } catch (error) {
    console.error('Accountant trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /imaging/trends?days=30
// Series: orders_created, orders_completed, stat_orders. Walk-ins are
// derivable but live in a different table — skipped here so the response
// stays focused on imaging_orders aggregates.
export const getImagingTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseDays(req.query.days);
    const index = buildDayIndex(days);
    const since = index[0];

    const created = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM imaging_orders
        WHERE ordered_date >= $1::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [since],
    );
    const completed = await pool.query(
      `SELECT DATE(completed_date) AS day, COUNT(*)::int AS value
         FROM imaging_orders
        WHERE completed_date IS NOT NULL AND completed_date >= $1::date
        GROUP BY DATE(completed_date)
        ORDER BY DATE(completed_date) ASC`,
      [since],
    );
    const stat = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM imaging_orders
        WHERE priority = 'stat' AND ordered_date >= $1::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [since],
    );

    res.json({
      days,
      series: {
        orders_created: fillSeries(created.rows, index),
        orders_completed: fillSeries(completed.rows, index),
        stat_orders: fillSeries(stat.rows, index),
      },
    });
  } catch (error) {
    console.error('Imaging trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /doctor/trends?days=30
// Doctor-personal series for the logged-in provider:
//   patients_seen   — encounters where this provider was the provider_id
//   labs_ordered    — lab orders this provider ordered
//   imaging_ordered — imaging orders this provider ordered
//   rx_ordered      — pharmacy orders this provider ordered
//
// All grouped by ordered_date (or encounter_date) so a doctor sees
// their own activity arc, not the whole clinic's.
export const getDoctorTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const days = parseDays(req.query.days);
    const index = buildDayIndex(days);
    const since = index[0];

    const patients = await pool.query(
      `SELECT DATE(encounter_date) AS day, COUNT(*)::int AS value
         FROM encounters
        WHERE provider_id = $1 AND encounter_date >= $2::date
        GROUP BY DATE(encounter_date)
        ORDER BY DATE(encounter_date) ASC`,
      [userId, since],
    );
    const labs = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM lab_orders
        WHERE ordering_provider = $1 AND ordered_date >= $2::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [userId, since],
    );
    const imaging = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM imaging_orders
        WHERE ordering_provider = $1 AND ordered_date >= $2::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [userId, since],
    );
    const rx = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM pharmacy_orders
        WHERE ordering_provider = $1 AND ordered_date >= $2::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [userId, since],
    );

    res.json({
      days,
      series: {
        patients_seen: fillSeries(patients.rows, index),
        labs_ordered: fillSeries(labs.rows, index),
        imaging_ordered: fillSeries(imaging.rows, index),
        rx_ordered: fillSeries(rx.rows, index),
      },
    });
  } catch (error) {
    console.error('Doctor trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /pharmacy/trends?days=30
// Series: orders_created, stat_orders, dispensed_count, unique_patients,
// total_units, avg_turnaround_minutes.
export const getPharmacyTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseDays(req.query.days);
    const index = buildDayIndex(days);
    const since = index[0];

    const created = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM pharmacy_orders
        WHERE ordered_date >= $1::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [since],
    );
    const stat = await pool.query(
      `SELECT DATE(ordered_date) AS day, COUNT(*)::int AS value
         FROM pharmacy_orders
        WHERE priority = 'stat' AND ordered_date >= $1::date
        GROUP BY DATE(ordered_date)
        ORDER BY DATE(ordered_date) ASC`,
      [since],
    );
    const dispensed = await pool.query(
      `SELECT DATE(dispensed_date) AS day, COUNT(*)::int AS value
         FROM pharmacy_orders
        WHERE dispensed_date IS NOT NULL AND dispensed_date >= $1::date
        GROUP BY DATE(dispensed_date)
        ORDER BY DATE(dispensed_date) ASC`,
      [since],
    );
    const uniquePatients = await pool.query(
      `SELECT DATE(dispensed_date) AS day, COUNT(DISTINCT patient_id)::int AS value
         FROM pharmacy_orders
        WHERE dispensed_date IS NOT NULL AND dispensed_date >= $1::date
        GROUP BY DATE(dispensed_date)
        ORDER BY DATE(dispensed_date) ASC`,
      [since],
    );
    const totalUnits = await pool.query(
      `SELECT DATE(dispensed_date) AS day,
              COALESCE(SUM(NULLIF(regexp_replace(quantity::text, '[^0-9.]', '', 'g'), '')::numeric), 0)::int AS value
         FROM pharmacy_orders
        WHERE dispensed_date IS NOT NULL AND dispensed_date >= $1::date
        GROUP BY DATE(dispensed_date)
        ORDER BY DATE(dispensed_date) ASC`,
      [since],
    );
    const tat = await pool.query(
      `SELECT DATE(dispensed_date) AS day,
              ROUND(AVG(EXTRACT(EPOCH FROM (dispensed_date - ordered_date)) / 60.0)::numeric, 1)::float AS value
         FROM pharmacy_orders
        WHERE dispensed_date IS NOT NULL
          AND ordered_date IS NOT NULL
          AND dispensed_date >= $1::date
        GROUP BY DATE(dispensed_date)
        ORDER BY DATE(dispensed_date) ASC`,
      [since],
    );

    res.json({
      days,
      series: {
        orders_created: fillSeries(created.rows, index),
        stat_orders: fillSeries(stat.rows, index),
        dispensed_count: fillSeries(dispensed.rows, index),
        unique_patients: fillSeries(uniquePatients.rows, index),
        total_units: fillSeries(totalUnits.rows, index),
        avg_turnaround_minutes: fillSeries(tat.rows, index),
      },
    });
  } catch (error) {
    console.error('Pharmacy trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
