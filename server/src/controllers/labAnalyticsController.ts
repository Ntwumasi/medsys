import { Request, Response } from 'express';
import pool from '../database/db';

// Get comprehensive lab analytics
export const getLabAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND lo.ordered_date >= $1 AND lo.ordered_date <= $2`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND lo.ordered_date >= $1`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND lo.ordered_date <= $1`;
      params.push(end_date);
    }

    // Get summary totals
    const totals = await pool.query(
      `SELECT
        COUNT(*) as total_tests,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tests,
        COUNT(*) FILTER (WHERE status IN ('ordered', 'in-progress')) as pending_tests,
        COUNT(*) FILTER (WHERE priority = 'stat') as stat_tests,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_tests,
        COUNT(*) FILTER (WHERE priority = 'routine') as routine_tests,
        COUNT(DISTINCT patient_id) as unique_patients
       FROM lab_orders lo
       WHERE 1=1 ${dateFilter}`,
      params
    );

    // Get average turnaround time (only for completed tests)
    const tatQuery = dateFilter.replace(/lo\./g, '');
    const tatResult = await pool.query(
      `SELECT
        AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600) as average_tat_hours,
        AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600) FILTER (WHERE priority = 'stat') as stat_tat_hours,
        AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600) FILTER (WHERE priority = 'urgent') as urgent_tat_hours,
        AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600) FILTER (WHERE priority = 'routine') as routine_tat_hours
       FROM lab_orders
       WHERE status = 'completed' AND result_date IS NOT NULL ${tatQuery}`,
      params
    );

    // Get critical results count
    const criticalResult = await pool.query(
      `SELECT
        COUNT(*) as total_critical,
        COUNT(*) FILTER (WHERE is_acknowledged = false) as pending_acknowledgment
       FROM critical_result_alerts
       WHERE 1=1`
    );

    res.json({
      totals: totals.rows[0],
      turnaround_time: tatResult.rows[0],
      critical_results: criticalResult.rows[0]
    });
  } catch (error) {
    console.error('Get lab analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch lab analytics' });
  }
};

// Get tests per period (day/week/month)
export const getTestsPerPeriod = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, group_by } = req.query;
    const grouping = group_by || 'day';

    let dateFormat: string;
    switch (grouping) {
      case 'week':
        dateFormat = 'YYYY-WW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    let query = `
      SELECT
        TO_CHAR(ordered_date, '${dateFormat}') as period,
        COUNT(*) as total_tests,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tests,
        COUNT(*) FILTER (WHERE priority = 'stat') as stat_tests,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_tests,
        COUNT(*) FILTER (WHERE priority = 'routine') as routine_tests
      FROM lab_orders
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (start_date) {
      query += ` AND ordered_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      query += ` AND ordered_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    query += ` GROUP BY period ORDER BY period DESC LIMIT 52`;

    const result = await pool.query(query, params);

    res.json({ data: result.rows });
  } catch (error) {
    console.error('Get tests per period error:', error);
    res.status(500).json({ error: 'Failed to fetch tests per period' });
  }
};

// Get turnaround time metrics
export const getTurnaroundTimeMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND ordered_date >= $1 AND ordered_date <= $2`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND ordered_date >= $1`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND ordered_date <= $1`;
      params.push(end_date);
    }

    // TAT by priority
    const tatByPriority = await pool.query(
      `SELECT
        priority,
        COUNT(*) as test_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 1) as avg_tat_hours,
        ROUND(MIN(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 1) as min_tat_hours,
        ROUND(MAX(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 1) as max_tat_hours
       FROM lab_orders
       WHERE status = 'completed' AND result_date IS NOT NULL ${dateFilter}
       GROUP BY priority
       ORDER BY
         CASE priority
           WHEN 'stat' THEN 1
           WHEN 'urgent' THEN 2
           WHEN 'routine' THEN 3
         END`,
      params
    );

    // TAT trend over time
    const tatTrend = await pool.query(
      `SELECT
        DATE(ordered_date) as date,
        COUNT(*) as test_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 1) as avg_tat_hours
       FROM lab_orders
       WHERE status = 'completed' AND result_date IS NOT NULL ${dateFilter}
       GROUP BY DATE(ordered_date)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );

    // Tests meeting TAT target (24 hours for routine, 4 hours for urgent, 1 hour for stat)
    const tatCompliance = await pool.query(
      `SELECT
        COUNT(*) as total_completed,
        COUNT(*) FILTER (
          WHERE (priority = 'routine' AND EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600 <= 24)
             OR (priority = 'urgent' AND EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600 <= 4)
             OR (priority = 'stat' AND EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600 <= 1)
        ) as within_target,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE (priority = 'routine' AND EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600 <= 24)
               OR (priority = 'urgent' AND EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600 <= 4)
               OR (priority = 'stat' AND EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600 <= 1)
          ) / NULLIF(COUNT(*), 0), 1
        ) as compliance_percentage
       FROM lab_orders
       WHERE status = 'completed' AND result_date IS NOT NULL ${dateFilter}`,
      params
    );

    res.json({
      by_priority: tatByPriority.rows,
      trend: tatTrend.rows,
      compliance: tatCompliance.rows[0]
    });
  } catch (error) {
    console.error('Get turnaround time metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch turnaround time metrics' });
  }
};

// Get test volume by type/category
export const getTestVolumeByType = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND lo.ordered_date >= $1 AND lo.ordered_date <= $2`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND lo.ordered_date >= $1`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND lo.ordered_date <= $1`;
      params.push(end_date);
    }

    // Volume by test category (joining with catalog if available)
    const byCategory = await pool.query(
      `SELECT
        COALESCE(tc.category, 'Uncategorized') as category,
        COUNT(*) as test_count,
        COUNT(*) FILTER (WHERE lo.status = 'completed') as completed_count
       FROM lab_orders lo
       LEFT JOIN lab_test_catalog tc ON lo.test_name = tc.test_name OR lo.test_code = tc.test_code
       WHERE 1=1 ${dateFilter}
       GROUP BY COALESCE(tc.category, 'Uncategorized')
       ORDER BY test_count DESC`,
      params
    );

    // Top 10 most ordered tests
    const topTests = await pool.query(
      `SELECT
        test_name,
        COUNT(*) as order_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 1) as avg_tat_hours
       FROM lab_orders
       WHERE 1=1 ${dateFilter.replace(/lo\./g, '')}
       GROUP BY test_name
       ORDER BY order_count DESC
       LIMIT 10`,
      params
    );

    // Tests by ordering provider
    const byProvider = await pool.query(
      `SELECT
        u.first_name || ' ' || u.last_name as provider_name,
        COUNT(*) as order_count
       FROM lab_orders lo
       JOIN users u ON lo.ordering_provider = u.id
       WHERE 1=1 ${dateFilter}
       GROUP BY u.first_name, u.last_name
       ORDER BY order_count DESC
       LIMIT 10`,
      params
    );

    res.json({
      by_category: byCategory.rows,
      top_tests: topTests.rows,
      by_provider: byProvider.rows
    });
  } catch (error) {
    console.error('Get test volume by type error:', error);
    res.status(500).json({ error: 'Failed to fetch test volume by type' });
  }
};

// Get critical results statistics
export const getCriticalResultsStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND cra.created_at >= $1 AND cra.created_at <= $2`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND cra.created_at >= $1`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND cra.created_at <= $1`;
      params.push(end_date);
    }

    // Summary stats
    const summary = await pool.query(
      `SELECT
        COUNT(*) as total_critical,
        COUNT(*) FILTER (WHERE is_acknowledged = true) as acknowledged_count,
        COUNT(*) FILTER (WHERE is_acknowledged = false) as pending_count,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_count,
        ROUND(AVG(
          CASE WHEN is_acknowledged = true
          THEN EXTRACT(EPOCH FROM (acknowledged_at - created_at)) / 60
          ELSE NULL END
        )::numeric, 1) as avg_acknowledge_time_minutes
       FROM critical_result_alerts cra
       WHERE 1=1 ${dateFilter}`,
      params
    );

    // By alert type
    const byType = await pool.query(
      `SELECT
        alert_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE is_acknowledged = false) as pending_count
       FROM critical_result_alerts cra
       WHERE 1=1 ${dateFilter}
       GROUP BY alert_type
       ORDER BY count DESC`,
      params
    );

    // Recent unacknowledged
    const recentUnack = await pool.query(
      `SELECT
        cra.*,
        lo.test_name,
        lo.patient_id,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_provider.first_name || ' ' || u_provider.last_name as ordering_provider_name,
        p.patient_number
       FROM critical_result_alerts cra
       JOIN lab_orders lo ON cra.lab_order_id = lo.id
       JOIN patients p ON lo.patient_id = p.id
       JOIN users u_patient ON p.user_id = u_patient.id
       JOIN users u_provider ON cra.ordering_provider_id = u_provider.id
       WHERE cra.is_acknowledged = false
       ORDER BY cra.created_at DESC
       LIMIT 20`
    );

    res.json({
      summary: summary.rows[0],
      by_type: byType.rows,
      recent_unacknowledged: recentUnack.rows
    });
  } catch (error) {
    console.error('Get critical results stats error:', error);
    res.status(500).json({ error: 'Failed to fetch critical results stats' });
  }
};

// Get daily lab workload
export const getDailyWorkload = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.query;
    const targetDate = date || 'CURRENT_DATE';

    const workload = await pool.query(
      `SELECT
        DATE(ordered_date) as date,
        EXTRACT(HOUR FROM ordered_date) as hour,
        COUNT(*) as orders_received,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status IN ('ordered', 'in-progress')) as pending
       FROM lab_orders
       WHERE DATE(ordered_date) = ${date ? '$1' : 'CURRENT_DATE'}
       GROUP BY DATE(ordered_date), EXTRACT(HOUR FROM ordered_date)
       ORDER BY hour`,
      date ? [date] : []
    );

    res.json({ workload: workload.rows });
  } catch (error) {
    console.error('Get daily workload error:', error);
    res.status(500).json({ error: 'Failed to fetch daily workload' });
  }
};

// Export analytics data as CSV
export const exportAnalyticsCSV = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, report_type } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND lo.ordered_date >= $1 AND lo.ordered_date <= $2`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND lo.ordered_date >= $1`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND lo.ordered_date <= $1`;
      params.push(end_date);
    }

    let csvData = '';
    let filename = 'lab_analytics';

    switch (report_type) {
      case 'tests':
        // Export all tests
        const tests = await pool.query(
          `SELECT
            lo.id,
            p.patient_number,
            u_patient.first_name || ' ' || u_patient.last_name as patient_name,
            lo.test_name,
            lo.test_code,
            lo.priority,
            lo.status,
            lo.ordered_date,
            lo.result_date,
            lo.results,
            u_provider.first_name || ' ' || u_provider.last_name as ordering_provider,
            ROUND(EXTRACT(EPOCH FROM (lo.result_date - lo.ordered_date)) / 3600, 2) as tat_hours
           FROM lab_orders lo
           JOIN patients p ON lo.patient_id = p.id
           JOIN users u_patient ON p.user_id = u_patient.id
           JOIN users u_provider ON lo.ordering_provider = u_provider.id
           WHERE 1=1 ${dateFilter}
           ORDER BY lo.ordered_date DESC`,
          params
        );
        csvData = 'Order ID,Patient Number,Patient Name,Test Name,Test Code,Priority,Status,Ordered Date,Result Date,Results,Ordering Provider,TAT Hours\n';
        tests.rows.forEach(row => {
          csvData += `${row.id},"${row.patient_number}","${row.patient_name}","${row.test_name}","${row.test_code || ''}","${row.priority}","${row.status}","${row.ordered_date}","${row.result_date || ''}","${(row.results || '').replace(/"/g, '""')}","${row.ordering_provider}",${row.tat_hours || ''}\n`;
        });
        filename = 'lab_tests_report';
        break;

      case 'tat':
        // Export TAT summary
        const tatData = await pool.query(
          `SELECT
            DATE(ordered_date) as date,
            priority,
            COUNT(*) as test_count,
            ROUND(AVG(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 2) as avg_tat_hours,
            ROUND(MIN(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 2) as min_tat_hours,
            ROUND(MAX(EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600)::numeric, 2) as max_tat_hours
           FROM lab_orders
           WHERE status = 'completed' AND result_date IS NOT NULL ${dateFilter.replace(/lo\./g, '')}
           GROUP BY DATE(ordered_date), priority
           ORDER BY date DESC, priority`,
          params
        );
        csvData = 'Date,Priority,Test Count,Avg TAT (hrs),Min TAT (hrs),Max TAT (hrs)\n';
        tatData.rows.forEach(row => {
          csvData += `${row.date},${row.priority},${row.test_count},${row.avg_tat_hours},${row.min_tat_hours},${row.max_tat_hours}\n`;
        });
        filename = 'lab_tat_report';
        break;

      case 'volume':
        // Export test volume by category
        const volumeData = await pool.query(
          `SELECT
            COALESCE(tc.category, 'Uncategorized') as category,
            lo.test_name,
            COUNT(*) as total_orders,
            COUNT(*) FILTER (WHERE lo.status = 'completed') as completed,
            COUNT(*) FILTER (WHERE lo.status IN ('pending', 'in_progress')) as pending
           FROM lab_orders lo
           LEFT JOIN lab_test_catalog tc ON lo.test_name = tc.test_name OR lo.test_code = tc.test_code
           WHERE 1=1 ${dateFilter}
           GROUP BY COALESCE(tc.category, 'Uncategorized'), lo.test_name
           ORDER BY total_orders DESC`,
          params
        );
        csvData = 'Category,Test Name,Total Orders,Completed,Pending\n';
        volumeData.rows.forEach(row => {
          csvData += `"${row.category}","${row.test_name}",${row.total_orders},${row.completed},${row.pending}\n`;
        });
        filename = 'lab_volume_report';
        break;

      case 'critical':
        // Export critical results
        const criticalData = await pool.query(
          `SELECT
            cra.id,
            cra.created_at,
            lo.test_name,
            p.patient_number,
            u_patient.first_name || ' ' || u_patient.last_name as patient_name,
            cra.alert_type,
            cra.result_value,
            cra.is_acknowledged,
            cra.acknowledged_at,
            u_ack.first_name || ' ' || u_ack.last_name as acknowledged_by
           FROM critical_result_alerts cra
           JOIN lab_orders lo ON cra.lab_order_id = lo.id
           JOIN patients p ON lo.patient_id = p.id
           JOIN users u_patient ON p.user_id = u_patient.id
           LEFT JOIN users u_ack ON cra.acknowledged_by = u_ack.id
           WHERE 1=1 ${dateFilter.replace(/lo\./g, 'cra.')}
           ORDER BY cra.created_at DESC`,
          params
        );
        csvData = 'Alert ID,Created At,Test Name,Patient Number,Patient Name,Alert Type,Result Value,Acknowledged,Acknowledged At,Acknowledged By\n';
        criticalData.rows.forEach(row => {
          csvData += `${row.id},"${row.created_at}","${row.test_name}","${row.patient_number}","${row.patient_name}","${row.alert_type}","${row.result_value}",${row.is_acknowledged},"${row.acknowledged_at || ''}","${row.acknowledged_by || ''}"\n`;
        });
        filename = 'lab_critical_results_report';
        break;

      default:
        // Default: summary report
        const summaryData = await pool.query(
          `SELECT
            DATE(ordered_date) as date,
            COUNT(*) as total_tests,
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) as pending,
            COUNT(*) FILTER (WHERE priority = 'stat') as stat_tests,
            ROUND(AVG(CASE WHEN status = 'completed' AND result_date IS NOT NULL
              THEN EXTRACT(EPOCH FROM (result_date - ordered_date)) / 3600
              ELSE NULL END)::numeric, 2) as avg_tat
           FROM lab_orders
           WHERE 1=1 ${dateFilter.replace(/lo\./g, '')}
           GROUP BY DATE(ordered_date)
           ORDER BY date DESC`,
          params
        );
        csvData = 'Date,Total Tests,Completed,Pending,STAT Tests,Avg TAT (hrs)\n';
        summaryData.rows.forEach(row => {
          csvData += `${row.date},${row.total_tests},${row.completed},${row.pending},${row.stat_tests},${row.avg_tat || ''}\n`;
        });
        filename = 'lab_summary_report';
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvData);
  } catch (error) {
    console.error('Export analytics CSV error:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
};
