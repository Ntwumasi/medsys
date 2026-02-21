import { Request, Response } from 'express';
import pool from '../database/db';

// Get QC results with optional filters
export const getQCResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { test_code, start_date, end_date, control_level, limit } = req.query;

    let query = `
      SELECT
        qc.*,
        u.first_name || ' ' || u.last_name as performed_by_name
      FROM lab_qc_results qc
      LEFT JOIN users u ON qc.performed_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (test_code) {
      query += ` AND qc.test_code = $${paramIndex}`;
      params.push(test_code);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND qc.performed_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND qc.performed_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (control_level) {
      query += ` AND qc.control_level = $${paramIndex}`;
      params.push(control_level);
      paramIndex++;
    }

    query += ` ORDER BY qc.performed_at DESC`;

    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string) || 100);
    }

    const result = await pool.query(query, params);

    res.json({ qc_results: result.rows });
  } catch (error) {
    console.error('Error fetching QC results:', error);
    res.status(500).json({ error: 'Failed to fetch QC results' });
  }
};

// Record a QC result
export const recordQCResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      test_code,
      test_name,
      control_level,
      lot_number,
      measured_value,
      target_value,
      standard_deviation,
      unit,
      notes
    } = req.body;

    const userId = (req as any).user?.id;

    if (!test_code || !control_level || measured_value === undefined || target_value === undefined || standard_deviation === undefined) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Calculate if within limits (2 SD rule for Levey-Jennings)
    const deviation = Math.abs(measured_value - target_value);
    const isWithinLimits = deviation <= (2 * standard_deviation);

    const result = await pool.query(
      `INSERT INTO lab_qc_results
       (test_code, test_name, control_level, lot_number, measured_value, target_value, standard_deviation, unit, performed_by, is_within_limits, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        test_code,
        test_name || null,
        control_level,
        lot_number || null,
        measured_value,
        target_value,
        standard_deviation,
        unit || null,
        userId,
        isWithinLimits,
        notes || null
      ]
    );

    res.json({
      message: 'QC result recorded successfully',
      qc_result: result.rows[0],
      warning: !isWithinLimits ? 'ALERT: QC result is outside acceptable limits!' : null
    });
  } catch (error) {
    console.error('Error recording QC result:', error);
    res.status(500).json({ error: 'Failed to record QC result' });
  }
};

// Get Levey-Jennings chart data for a specific test
export const getLeveyJenningsData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { test_code } = req.params;
    const { control_level, days } = req.query;

    const daysBack = parseInt(days as string) || 30;

    let query = `
      SELECT
        qc.id,
        qc.measured_value,
        qc.target_value,
        qc.standard_deviation,
        qc.performed_at,
        qc.control_level,
        qc.lot_number,
        qc.is_within_limits
      FROM lab_qc_results qc
      WHERE qc.test_code = $1
        AND qc.performed_at >= NOW() - INTERVAL '${daysBack} days'
    `;
    const params: any[] = [test_code];
    let paramIndex = 2;

    if (control_level) {
      query += ` AND qc.control_level = $${paramIndex}`;
      params.push(control_level);
    }

    query += ` ORDER BY qc.performed_at ASC`;

    const result = await pool.query(query, params);

    // Calculate chart bounds
    const data = result.rows;
    if (data.length > 0) {
      const targetValue = parseFloat(data[0].target_value);
      const standardDeviation = parseFloat(data[0].standard_deviation);

      const chartData = {
        test_code,
        target_value: targetValue,
        standard_deviation: standardDeviation,
        upper_limit_2sd: targetValue + (2 * standardDeviation),
        lower_limit_2sd: targetValue - (2 * standardDeviation),
        upper_limit_3sd: targetValue + (3 * standardDeviation),
        lower_limit_3sd: targetValue - (3 * standardDeviation),
        data_points: data.map(row => ({
          id: row.id,
          value: parseFloat(row.measured_value),
          date: row.performed_at,
          control_level: row.control_level,
          lot_number: row.lot_number,
          is_within_limits: row.is_within_limits
        }))
      };

      res.json({ chart_data: chartData });
    } else {
      res.json({ chart_data: null, message: 'No QC data found for this test' });
    }
  } catch (error) {
    console.error('Error fetching Levey-Jennings data:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
};

// Get QC summary/statistics
export const getQCSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days } = req.query;
    const daysBack = parseInt(days as string) || 30;

    // Overall stats
    const overallStats = await pool.query(`
      SELECT
        COUNT(*) as total_qc_runs,
        COUNT(*) FILTER (WHERE is_within_limits = true) as within_limits,
        COUNT(*) FILTER (WHERE is_within_limits = false) as out_of_limits,
        COUNT(DISTINCT test_code) as tests_with_qc
      FROM lab_qc_results
      WHERE performed_at >= NOW() - INTERVAL '${daysBack} days'
    `);

    // Tests with out-of-limit results
    const outOfLimitTests = await pool.query(`
      SELECT
        test_code,
        test_name,
        COUNT(*) as ool_count,
        MAX(performed_at) as last_ool
      FROM lab_qc_results
      WHERE is_within_limits = false
        AND performed_at >= NOW() - INTERVAL '${daysBack} days'
      GROUP BY test_code, test_name
      ORDER BY ool_count DESC
    `);

    // Recent QC runs
    const recentRuns = await pool.query(`
      SELECT
        qc.*,
        u.first_name || ' ' || u.last_name as performed_by_name
      FROM lab_qc_results qc
      LEFT JOIN users u ON qc.performed_by = u.id
      ORDER BY qc.performed_at DESC
      LIMIT 20
    `);

    // Available tests for QC
    const availableTests = await pool.query(`
      SELECT DISTINCT test_code, test_name
      FROM lab_qc_results
      ORDER BY test_code
    `);

    res.json({
      summary: overallStats.rows[0],
      out_of_limit_tests: outOfLimitTests.rows,
      recent_runs: recentRuns.rows,
      available_tests: availableTests.rows
    });
  } catch (error) {
    console.error('Error fetching QC summary:', error);
    res.status(500).json({ error: 'Failed to fetch QC summary' });
  }
};

// Delete QC result
export const deleteQCResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM lab_qc_results WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'QC result not found' });
      return;
    }

    res.json({ message: 'QC result deleted successfully' });
  } catch (error) {
    console.error('Error deleting QC result:', error);
    res.status(500).json({ error: 'Failed to delete QC result' });
  }
};
