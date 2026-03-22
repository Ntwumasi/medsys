import { Request, Response } from 'express';
import pool from '../database/db';

// Generate unique claim number
const generateClaimNumber = async (): Promise<string> => {
  const result = await pool.query(
    `SELECT COUNT(*) + 1 as next_id FROM insurance_claims`
  );
  const nextId = result.rows[0].next_id;
  const year = new Date().getFullYear();
  return `CLM${year}${String(nextId).padStart(6, '0')}`;
};

// Create a new claim from an invoice
export const createClaim = async (req: Request, res: Response): Promise<void> => {
  try {
    const { invoice_id } = req.body;
    const userId = (req as any).user?.id;

    // Get invoice details with patient and encounter info
    const invoiceResult = await pool.query(
      `SELECT i.*,
              p.id as patient_id,
              p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name,
              u.date_of_birth,
              e.id as encounter_id,
              e.encounter_number
       FROM invoices i
       JOIN patients p ON i.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN encounters e ON i.encounter_id = e.id
       WHERE i.id = $1`,
      [invoice_id]
    );

    if (invoiceResult.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const invoice = invoiceResult.rows[0];

    // Check if claim already exists for this invoice
    const existingClaim = await pool.query(
      `SELECT id, claim_number FROM insurance_claims WHERE invoice_id = $1`,
      [invoice_id]
    );

    if (existingClaim.rows.length > 0) {
      res.status(400).json({
        error: 'Claim already exists for this invoice',
        claim_id: existingClaim.rows[0].id,
        claim_number: existingClaim.rows[0].claim_number
      });
      return;
    }

    // Get patient's insurance info
    const insuranceResult = await pool.query(
      `SELECT pps.*, ip.id as provider_id, ip.name as provider_name,
              pid.member_id, pid.plan_option, pid.annual_limit, pid.used_to_date
       FROM patient_payer_sources pps
       JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
       LEFT JOIN patient_insurance_details pid ON pid.patient_id = pps.patient_id
         AND pid.insurance_provider_id = ip.id
       WHERE pps.patient_id = $1 AND pps.payer_type = 'insurance'
       ORDER BY pps.is_primary DESC
       LIMIT 1`,
      [invoice.patient_id]
    );

    if (insuranceResult.rows.length === 0) {
      res.status(400).json({ error: 'Patient has no insurance on record' });
      return;
    }

    const insurance = insuranceResult.rows[0];

    // Get diagnoses from encounter
    const diagnosesResult = await pool.query(
      `SELECT diagnosis_code, diagnosis_description, type
       FROM diagnoses
       WHERE encounter_id = $1
       ORDER BY type = 'primary' DESC, created_at`,
      [invoice.encounter_id]
    );

    const primaryDiagnosis = diagnosesResult.rows.find(d => d.type === 'primary') || diagnosesResult.rows[0];
    const secondaryDiagnoses = diagnosesResult.rows.filter(d => d !== primaryDiagnosis);

    // Get invoice items for claim
    const itemsResult = await pool.query(
      `SELECT description, quantity, unit_price, total_price, category
       FROM invoice_items
       WHERE invoice_id = $1`,
      [invoice_id]
    );

    // Generate claim number
    const claimNumber = await generateClaimNumber();

    // Calculate coverage
    const annualLimit = parseFloat(insurance.annual_limit) || 0;
    const usedToDate = parseFloat(insurance.used_to_date) || 0;
    const remainingCoverage = annualLimit - usedToDate;

    // Create the claim
    const result = await pool.query(
      `INSERT INTO insurance_claims (
        claim_number, invoice_id, patient_id, encounter_id, insurance_provider_id,
        member_id, plan_option,
        primary_diagnosis_code, primary_diagnosis_desc, secondary_diagnosis_codes,
        total_charged, annual_limit, used_to_date, remaining_coverage,
        claim_items, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'draft', $16)
      RETURNING *`,
      [
        claimNumber,
        invoice_id,
        invoice.patient_id,
        invoice.encounter_id,
        insurance.provider_id,
        insurance.member_id || '',
        insurance.plan_option || '',
        primaryDiagnosis?.diagnosis_code || '',
        primaryDiagnosis?.diagnosis_description || '',
        JSON.stringify(secondaryDiagnoses.map(d => ({
          code: d.diagnosis_code,
          description: d.diagnosis_description
        }))),
        invoice.total_amount,
        annualLimit,
        usedToDate,
        remainingCoverage,
        JSON.stringify(itemsResult.rows),
        userId
      ]
    );

    res.status(201).json({
      message: 'Claim created successfully',
      claim: result.rows[0],
      patient_name: invoice.patient_name,
      provider_name: insurance.provider_name
    });

  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ error: 'Failed to create claim' });
  }
};

// Get all claims with filters
export const getClaims = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, insurance_provider_id, start_date, end_date, search } = req.query;

    let query = `
      SELECT ic.*,
             ip.name as insurance_provider_name,
             u.first_name || ' ' || u.last_name as patient_name,
             p.patient_number,
             inv.invoice_number,
             doc.first_name || ' ' || doc.last_name as reviewed_by_name
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN insurance_providers ip ON ic.insurance_provider_id = ip.id
      LEFT JOIN invoices inv ON ic.invoice_id = inv.id
      LEFT JOIN users doc ON ic.reviewed_by_doctor = doc.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (status && status !== 'all') {
      paramCount++;
      query += ` AND ic.status = $${paramCount}`;
      params.push(status);
    }

    if (insurance_provider_id) {
      paramCount++;
      query += ` AND ic.insurance_provider_id = $${paramCount}`;
      params.push(insurance_provider_id);
    }

    if (start_date) {
      paramCount++;
      query += ` AND ic.created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND ic.created_at <= $${paramCount}`;
      params.push(end_date);
    }

    if (search) {
      paramCount++;
      query += ` AND (ic.claim_number ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR p.patient_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY ic.created_at DESC`;

    const result = await pool.query(query, params);

    // Get summary counts
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COUNT(*) FILTER (WHERE status = 'pending_doctor_review') as pending_review,
        COUNT(*) FILTER (WHERE status = 'approved_by_doctor') as approved_by_doctor,
        COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'denied') as denied,
        COUNT(*) FILTER (WHERE status = 'paid') as paid,
        COALESCE(SUM(total_charged), 0) as total_charged,
        COALESCE(SUM(amount_approved), 0) as total_approved,
        COALESCE(SUM(amount_paid), 0) as total_paid
      FROM insurance_claims
    `);

    res.json({
      claims: result.rows,
      summary: summaryResult.rows[0]
    });

  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
};

// Get single claim by ID
export const getClaimById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ic.*,
              ip.name as insurance_provider_name,
              ip.contact_email as provider_email,
              ip.contact_phone as provider_phone,
              u.first_name || ' ' || u.last_name as patient_name,
              u.date_of_birth as patient_dob,
              u.phone as patient_phone,
              u.email as patient_email,
              p.patient_number,
              p.address as patient_address,
              inv.invoice_number,
              inv.invoice_date,
              e.encounter_number,
              e.encounter_date,
              e.chief_complaint,
              doc.first_name || ' ' || doc.last_name as reviewed_by_name,
              creator.first_name || ' ' || creator.last_name as created_by_name,
              submitter.first_name || ' ' || submitter.last_name as submitted_by_name
       FROM insurance_claims ic
       JOIN patients p ON ic.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN insurance_providers ip ON ic.insurance_provider_id = ip.id
       LEFT JOIN invoices inv ON ic.invoice_id = inv.id
       LEFT JOIN encounters e ON ic.encounter_id = e.id
       LEFT JOIN users doc ON ic.reviewed_by_doctor = doc.id
       LEFT JOIN users creator ON ic.created_by = creator.id
       LEFT JOIN users submitter ON ic.submitted_by = submitter.id
       WHERE ic.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    // Get all diagnoses for the encounter
    const diagnosesResult = await pool.query(
      `SELECT diagnosis_code, diagnosis_description, type
       FROM diagnoses
       WHERE encounter_id = $1
       ORDER BY type = 'primary' DESC, created_at`,
      [result.rows[0].encounter_id]
    );

    // Get orders for validation display
    const ordersResult = await pool.query(
      `SELECT 'lab' as order_type, test_name as name, test_code as code, status
       FROM lab_orders WHERE encounter_id = $1
       UNION ALL
       SELECT 'imaging' as order_type, imaging_type as name, NULL as code, status
       FROM imaging_orders WHERE encounter_id = $1
       UNION ALL
       SELECT 'pharmacy' as order_type, medication_name as name, NULL as code, status
       FROM pharmacy_orders WHERE encounter_id = $1`,
      [result.rows[0].encounter_id]
    );

    res.json({
      claim: result.rows[0],
      diagnoses: diagnosesResult.rows,
      orders: ordersResult.rows
    });

  } catch (error) {
    console.error('Get claim by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch claim' });
  }
};

// Update claim details
export const updateClaim = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      member_id, plan_option,
      primary_diagnosis_code, primary_diagnosis_desc,
      secondary_diagnosis_codes
    } = req.body;

    const result = await pool.query(
      `UPDATE insurance_claims
       SET member_id = COALESCE($1, member_id),
           plan_option = COALESCE($2, plan_option),
           primary_diagnosis_code = COALESCE($3, primary_diagnosis_code),
           primary_diagnosis_desc = COALESCE($4, primary_diagnosis_desc),
           secondary_diagnosis_codes = COALESCE($5, secondary_diagnosis_codes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [member_id, plan_option, primary_diagnosis_code, primary_diagnosis_desc,
       secondary_diagnosis_codes ? JSON.stringify(secondary_diagnosis_codes) : null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    res.json({ message: 'Claim updated', claim: result.rows[0] });

  } catch (error) {
    console.error('Update claim error:', error);
    res.status(500).json({ error: 'Failed to update claim' });
  }
};

// Validate diagnosis against orders
export const validateDiagnosis = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get claim with diagnosis
    const claimResult = await pool.query(
      `SELECT * FROM insurance_claims WHERE id = $1`,
      [id]
    );

    if (claimResult.rows.length === 0) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    const claim = claimResult.rows[0];

    // Get orders for the encounter
    const ordersResult = await pool.query(
      `SELECT 'lab' as category, test_name as name, test_code as code
       FROM lab_orders WHERE encounter_id = $1
       UNION ALL
       SELECT 'imaging' as category, imaging_type as name, NULL as code
       FROM imaging_orders WHERE encounter_id = $1
       UNION ALL
       SELECT 'pharmacy' as category, medication_name as name, NULL as code
       FROM pharmacy_orders WHERE encounter_id = $1`,
      [claim.encounter_id]
    );

    // Get valid procedures for this diagnosis
    const diagnosisCode = claim.primary_diagnosis_code;
    const validProcedures = await pool.query(
      `SELECT procedure_category, procedure_code, procedure_name
       FROM diagnosis_procedure_mappings
       WHERE $1 LIKE REPLACE(diagnosis_code_pattern, '%', '') || '%'
         AND is_valid = true`,
      [diagnosisCode]
    );

    const validMap = new Map<string, Set<string>>();
    validProcedures.rows.forEach(p => {
      if (!validMap.has(p.procedure_category)) {
        validMap.set(p.procedure_category, new Set());
      }
      if (p.procedure_code) {
        validMap.get(p.procedure_category)!.add(p.procedure_code.toLowerCase());
      }
      if (p.procedure_name) {
        validMap.get(p.procedure_category)!.add(p.procedure_name.toLowerCase());
      }
    });

    // Validate each order
    const validationIssues: any[] = [];
    let allValid = true;

    ordersResult.rows.forEach(order => {
      const categoryValid = validMap.has(order.category);
      let orderValid = false;

      if (categoryValid) {
        const validSet = validMap.get(order.category)!;
        // Check if order name or code matches any valid procedure
        orderValid = validSet.size === 0 || // If no specific procedures listed, category match is enough
          (order.code && validSet.has(order.code.toLowerCase())) ||
          Array.from(validSet).some(v => order.name.toLowerCase().includes(v));
      }

      if (!orderValid) {
        allValid = false;
        validationIssues.push({
          order_type: order.category,
          order_name: order.name,
          issue: `${order.name} may not be indicated for diagnosis ${diagnosisCode}`,
          requires_override: true
        });
      }
    });

    // Update claim with validation results
    await pool.query(
      `UPDATE insurance_claims
       SET diagnosis_validated = $1,
           validation_issues = $2,
           status = CASE WHEN status = 'draft' THEN 'pending_validation' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [allValid, JSON.stringify(validationIssues), id]
    );

    res.json({
      validated: allValid,
      issues: validationIssues,
      diagnosis_code: diagnosisCode,
      orders_checked: ordersResult.rows.length,
      message: allValid
        ? 'All orders are validated for this diagnosis'
        : 'Some orders require doctor override'
    });

  } catch (error) {
    console.error('Validate diagnosis error:', error);
    res.status(500).json({ error: 'Failed to validate diagnosis' });
  }
};

// Check coverage limits
export const checkCoverage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const claimResult = await pool.query(
      `SELECT ic.*, pid.annual_limit as current_limit, pid.used_to_date as current_used
       FROM insurance_claims ic
       LEFT JOIN patient_insurance_details pid ON ic.patient_id = pid.patient_id
         AND ic.insurance_provider_id = pid.insurance_provider_id
       WHERE ic.id = $1`,
      [id]
    );

    if (claimResult.rows.length === 0) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    const claim = claimResult.rows[0];
    const annualLimit = parseFloat(claim.current_limit) || parseFloat(claim.annual_limit) || 0;
    const usedToDate = parseFloat(claim.current_used) || parseFloat(claim.used_to_date) || 0;
    const claimAmount = parseFloat(claim.total_charged) || 0;
    const remaining = annualLimit - usedToDate;
    const exceedsLimit = claimAmount > remaining;

    res.json({
      annual_limit: annualLimit,
      used_to_date: usedToDate,
      remaining_coverage: remaining,
      claim_amount: claimAmount,
      exceeds_limit: exceedsLimit,
      shortfall: exceedsLimit ? claimAmount - remaining : 0,
      message: exceedsLimit
        ? `Claim exceeds remaining coverage by GHS ${(claimAmount - remaining).toFixed(2)}`
        : 'Claim is within coverage limits'
    });

  } catch (error) {
    console.error('Check coverage error:', error);
    res.status(500).json({ error: 'Failed to check coverage' });
  }
};

// Submit claim for doctor review
export const submitForDoctorReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { validation_override_reason } = req.body;
    const userId = (req as any).user?.id;

    // Get claim current status
    const claimResult = await pool.query(
      `SELECT * FROM insurance_claims WHERE id = $1`,
      [id]
    );

    if (claimResult.rows.length === 0) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    const claim = claimResult.rows[0];

    // Check if validation issues exist and override reason provided
    const validationIssues = claim.validation_issues || [];
    if (validationIssues.length > 0 && !validation_override_reason) {
      res.status(400).json({
        error: 'Validation issues exist. Please provide override reason.',
        issues: validationIssues
      });
      return;
    }

    // Update claim status
    await pool.query(
      `UPDATE insurance_claims
       SET status = 'pending_doctor_review',
           validation_override_by = $1,
           validation_override_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [validationIssues.length > 0 ? userId : null, validation_override_reason, id]
    );

    res.json({ message: 'Claim submitted for doctor review' });

  } catch (error) {
    console.error('Submit for doctor review error:', error);
    res.status(500).json({ error: 'Failed to submit for review' });
  }
};

// Doctor approves claim
export const doctorApproveClaim = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { doctor_notes } = req.body;
    const userId = (req as any).user?.id;

    const result = await pool.query(
      `UPDATE insurance_claims
       SET status = 'approved_by_doctor',
           reviewed_by_doctor = $1,
           doctor_reviewed_at = CURRENT_TIMESTAMP,
           doctor_notes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND status = 'pending_doctor_review'
       RETURNING *`,
      [userId, doctor_notes, id]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Claim not found or not pending review' });
      return;
    }

    res.json({ message: 'Claim approved by doctor', claim: result.rows[0] });

  } catch (error) {
    console.error('Doctor approve claim error:', error);
    res.status(500).json({ error: 'Failed to approve claim' });
  }
};

// Doctor rejects claim
export const doctorRejectClaim = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { doctor_notes } = req.body;
    const userId = (req as any).user?.id;

    if (!doctor_notes) {
      res.status(400).json({ error: 'Rejection reason is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE insurance_claims
       SET status = 'doctor_rejected',
           reviewed_by_doctor = $1,
           doctor_reviewed_at = CURRENT_TIMESTAMP,
           doctor_notes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND status = 'pending_doctor_review'
       RETURNING *`,
      [userId, doctor_notes, id]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Claim not found or not pending review' });
      return;
    }

    res.json({ message: 'Claim rejected by doctor', claim: result.rows[0] });

  } catch (error) {
    console.error('Doctor reject claim error:', error);
    res.status(500).json({ error: 'Failed to reject claim' });
  }
};

// Submit claim to insurance (final submission)
export const submitClaim = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { submission_reference } = req.body;
    const userId = (req as any).user?.id;

    const result = await pool.query(
      `UPDATE insurance_claims
       SET status = 'submitted',
           submitted_by = $1,
           submitted_at = CURRENT_TIMESTAMP,
           submission_reference = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND status = 'approved_by_doctor'
       RETURNING *`,
      [userId, submission_reference, id]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Claim not found or not approved by doctor' });
      return;
    }

    res.json({ message: 'Claim submitted to insurance', claim: result.rows[0] });

  } catch (error) {
    console.error('Submit claim error:', error);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
};

// Update claim status (after insurer response)
export const updateClaimStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, amount_approved, amount_paid, patient_responsibility, notes } = req.body;

    const validStatuses = ['processing', 'approved', 'partial', 'denied', 'paid'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const result = await pool.query(
      `UPDATE insurance_claims
       SET status = $1,
           amount_approved = COALESCE($2, amount_approved),
           amount_paid = COALESCE($3, amount_paid),
           patient_responsibility = COALESCE($4, patient_responsibility),
           notes = COALESCE($5, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [status, amount_approved, amount_paid, patient_responsibility, notes, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    // If paid, update patient's used_to_date
    if (status === 'paid' && amount_paid) {
      const claim = result.rows[0];
      await pool.query(
        `UPDATE patient_insurance_details
         SET used_to_date = COALESCE(used_to_date, 0) + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE patient_id = $2 AND insurance_provider_id = $3`,
        [amount_paid, claim.patient_id, claim.insurance_provider_id]
      );
    }

    res.json({ message: 'Claim status updated', claim: result.rows[0] });

  } catch (error) {
    console.error('Update claim status error:', error);
    res.status(500).json({ error: 'Failed to update claim status' });
  }
};

// Get claims pending doctor review
export const getClaimsPendingReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT ic.*,
              ip.name as insurance_provider_name,
              u.first_name || ' ' || u.last_name as patient_name,
              p.patient_number,
              inv.invoice_number,
              e.chief_complaint
       FROM insurance_claims ic
       JOIN patients p ON ic.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN insurance_providers ip ON ic.insurance_provider_id = ip.id
       LEFT JOIN invoices inv ON ic.invoice_id = inv.id
       LEFT JOIN encounters e ON ic.encounter_id = e.id
       WHERE ic.status = 'pending_doctor_review'
       ORDER BY ic.created_at ASC`
    );

    res.json({ claims: result.rows, count: result.rows.length });

  } catch (error) {
    console.error('Get claims pending review error:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
};

// Get claims approved and ready for submission
export const getClaimsReadyForSubmission = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT ic.*,
              ip.name as insurance_provider_name,
              u.first_name || ' ' || u.last_name as patient_name,
              p.patient_number,
              inv.invoice_number,
              doc.first_name || ' ' || doc.last_name as approved_by_name
       FROM insurance_claims ic
       JOIN patients p ON ic.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN insurance_providers ip ON ic.insurance_provider_id = ip.id
       LEFT JOIN invoices inv ON ic.invoice_id = inv.id
       LEFT JOIN users doc ON ic.reviewed_by_doctor = doc.id
       WHERE ic.status = 'approved_by_doctor'
       ORDER BY ic.doctor_reviewed_at ASC`
    );

    res.json({ claims: result.rows, count: result.rows.length });

  } catch (error) {
    console.error('Get claims ready for submission error:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
};
