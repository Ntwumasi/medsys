import pool from '../database/db';

export interface LabResultValue {
  name: string;
  value: number;
  unit: string;
  status: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';
  referenceRange: string;
}

export interface ParsedLabResult {
  values: LabResultValue[];
  hasAbnormal: boolean;
  hasCritical: boolean;
}

export const labResultsService = {
  /**
   * Parse and evaluate lab results against reference ranges
   */
  async evaluateResults(testName: string, resultJson: string | object, patientGender?: string, patientAge?: number): Promise<ParsedLabResult> {
    const results: LabResultValue[] = [];
    let hasAbnormal = false;
    let hasCritical = false;

    // Parse the result JSON
    const resultData = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;

    // Get reference ranges for this test
    const rangesResult = await pool.query(
      `SELECT * FROM lab_reference_ranges
       WHERE test_name ILIKE $1 OR test_code ILIKE $1
       AND (gender IS NULL OR gender = $2 OR gender = 'all')
       AND (age_min IS NULL OR age_min <= $3)
       AND (age_max IS NULL OR age_max >= $3)`,
      [`%${testName}%`, patientGender || 'all', patientAge || 40]
    );

    const rangeMap = new Map(rangesResult.rows.map(r => [r.test_name.toLowerCase(), r]));

    // Evaluate each value in the result
    for (const [key, rawValue] of Object.entries(resultData)) {
      // Try to extract numeric value
      const valueMatch = String(rawValue).match(/[\d.]+/);
      if (!valueMatch) continue;

      const value = parseFloat(valueMatch[0]);
      const unitMatch = String(rawValue).match(/[a-zA-Z/%^]+/g);
      const unit = unitMatch ? unitMatch.join('') : '';

      // Find reference range
      const range = rangeMap.get(key.toLowerCase()) ||
                   rangesResult.rows.find(r =>
                     r.test_name.toLowerCase().includes(key.toLowerCase()) ||
                     key.toLowerCase().includes(r.test_name.toLowerCase())
                   );

      let status: LabResultValue['status'] = 'normal';
      let referenceRange = 'N/A';

      if (range) {
        referenceRange = `${range.min_normal} - ${range.max_normal} ${range.unit || ''}`;

        if (range.critical_low && value < range.critical_low) {
          status = 'critical_low';
          hasCritical = true;
        } else if (range.critical_high && value > range.critical_high) {
          status = 'critical_high';
          hasCritical = true;
        } else if (value < range.min_normal) {
          status = 'low';
          hasAbnormal = true;
        } else if (value > range.max_normal) {
          status = 'high';
          hasAbnormal = true;
        }
      }

      results.push({
        name: key,
        value,
        unit,
        status,
        referenceRange,
      });
    }

    return { values: results, hasAbnormal, hasCritical };
  },

  /**
   * Format lab results with status indicators
   */
  formatResultsWithStatus(parsed: ParsedLabResult): string {
    const lines = parsed.values.map(v => {
      const indicator = v.status === 'normal' ? '' :
                       v.status === 'high' ? ' ↑' :
                       v.status === 'low' ? ' ↓' :
                       v.status === 'critical_high' ? ' ↑↑ CRITICAL' :
                       ' ↓↓ CRITICAL';
      return `${v.name}: ${v.value} ${v.unit}${indicator} (Ref: ${v.referenceRange})`;
    });

    return lines.join('\n');
  },

  /**
   * Get reference range for a specific test
   */
  async getReferenceRange(testName: string, gender?: string, age?: number): Promise<any> {
    const result = await pool.query(
      `SELECT * FROM lab_reference_ranges
       WHERE (test_name ILIKE $1 OR test_code ILIKE $1)
       AND (gender IS NULL OR gender = $2 OR gender = 'all')
       AND (age_min IS NULL OR age_min <= $3)
       AND (age_max IS NULL OR age_max >= $3)
       LIMIT 1`,
      [`%${testName}%`, gender || 'all', age || 40]
    );
    return result.rows[0] || null;
  },

  /**
   * Check if any results are critical and need immediate attention
   */
  async checkCriticalResults(orderId: number): Promise<boolean> {
    const orderResult = await pool.query(
      `SELECT lo.*, p.gender, p.date_of_birth
       FROM lab_orders lo
       JOIN patients p ON lo.patient_id = p.id
       WHERE lo.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0 || !orderResult.rows[0].result) {
      return false;
    }

    const order = orderResult.rows[0];
    const age = order.date_of_birth ?
      Math.floor((Date.now() - new Date(order.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) :
      undefined;

    const parsed = await this.evaluateResults(order.test_name, order.result, order.gender, age);
    return parsed.hasCritical;
  },
};

export default labResultsService;
