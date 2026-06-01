import { Request, Response } from 'express';
import pool from '../database/db';
import notificationService from '../services/notificationService';
import auditService from '../services/auditService';
import drugInteractionService from '../services/drugInteractionService';
import { dispenseFromBatches } from './inventoryController';
import { buildSafeUpdateClause } from '../utils/sqlSecurity';

// Allocate the next Path No for today. Format is DDMM###, daily sequence,
// matching the lab's existing convention (e.g. "2205001" = 22nd May, #001).
// Uses INSERT ... ON CONFLICT DO UPDATE so concurrent allocations don't
// collide — the counter row is locked for the duration of the upsert.
const allocatePathNo = async (): Promise<string> => {
  // Ensure the counter table exists (idempotent — for first-run safety
  // before the addLabPathNoAndTemplates migration has executed).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS path_no_counters (
      date_key CHAR(4) PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // DDMM in local-server time. The clinic operates in UTC+00 (Accra), so
  // server-local matches what the lab tech expects on paper labels.
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dateKey = `${dd}${mm}`;

  const result = await pool.query(
    `INSERT INTO path_no_counters (date_key, next_seq)
     VALUES ($1, 2)
     ON CONFLICT (date_key) DO UPDATE
       SET next_seq = path_no_counters.next_seq + 1,
           updated_at = CURRENT_TIMESTAMP
     RETURNING next_seq`,
    [dateKey],
  );
  // On first row of the day next_seq returned is 2 (we inserted 2), so the
  // allocated number is next_seq - 1 = 1. On subsequent rows the UPDATE
  // increments and returns the new value, also requiring -1 for the number
  // we just claimed.
  const seq = result.rows[0].next_seq - 1;
  return `${dateKey}${String(seq).padStart(3, '0')}`;
};

// Lab Orders
export const createLabOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const currentUserId = authReq.user?.id;
    const currentUserRole = authReq.user?.role;

    const { patient_id, encounter_id, test_name, test_code, priority, notes, ordering_provider_id, scheduled_time } = req.body;

    // Determine the ordering provider:
    // - If nurse provides ordering_provider_id, use that (ordering on behalf of doctor)
    // - Otherwise, use current user (doctor ordering for themselves)
    let orderingProvider = currentUserId;
    let enteredBy = currentUserId;

    if (currentUserRole === 'nurse' && ordering_provider_id) {
      // Nurse is ordering on behalf of a doctor
      orderingProvider = ordering_provider_id;
      enteredBy = currentUserId;
    }

    // Prevent duplicate: same test for the same encounter that isn't cancelled.
    // Scheduled orders are exempt — they represent repeated tests at different times.
    if (priority !== 'scheduled') {
      const dupCheck = await pool.query(
        `SELECT id FROM lab_orders
         WHERE encounter_id = $1
           AND (LOWER(test_name) = LOWER($2)
                OR ($3::text IS NOT NULL AND test_code IS NOT NULL AND LOWER(test_code) = LOWER($3::text)))
           AND status != 'cancelled'
         LIMIT 1`,
        [encounter_id, test_name, test_code || null]
      );
      if (dupCheck.rows.length > 0) {
        res.status(409).json({ error: `${test_name || test_code} has already been ordered for this encounter.` });
        return;
      }
    }

    // Allocate the lab's accession number (Path No). Best-effort — if the
    // counter fails we still create the order; an admin can patch path_no
    // later. (Falling back to NULL keeps go-live moving.)
    let pathNo: string | null = null;
    try {
      // Defensive: ensure path_no column exists too. The migration adds it,
      // but if code deploys first the column won't be there yet.
      await pool.query(`ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS path_no VARCHAR(10)`);
      pathNo = await allocatePathNo();
    } catch (pathErr) {
      console.error('Failed to allocate Path No, continuing without:', pathErr);
    }

    const parsedTime = scheduled_time ? new Date(scheduled_time) : null;
    const scheduledFor = (priority === 'scheduled' && parsedTime && !isNaN(parsedTime.getTime())) ? parsedTime : null;

    const result = await pool.query(
      `INSERT INTO lab_orders (
        patient_id, encounter_id, ordering_provider, entered_by, test_name, test_code, priority, notes, path_no, scheduled_for
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [patient_id, encounter_id, orderingProvider, enteredBy, test_name, test_code, priority || 'routine', notes, pathNo, scheduledFor]
    );

    const order = result.rows[0];

    // For walk-in/OTC patients (ordered by lab tech), bill immediately at order
    // creation so the patient can pay and leave without waiting for results.
    // For doctor/nurse-ordered tests, billing still happens on completion.
    if (currentUserRole === 'lab') {
      try {
        // Find or create invoice for this encounter
        let invoiceRow = await pool.query('SELECT id FROM invoices WHERE encounter_id = $1', [encounter_id]);
        if (invoiceRow.rows.length > 0) {
          const invoiceId = invoiceRow.rows[0].id;
          // Look up the charge_master price for this test
          const chargeResult = await pool.query(
            "SELECT id, price FROM charge_master WHERE LOWER(service_name) = LOWER($1) AND category = 'lab' AND is_active = true LIMIT 1",
            [test_name]
          );
          if (chargeResult.rows.length > 0) {
            const charge = chargeResult.rows[0];
            const { resolvePrice } = require('../services/priceResolutionService');
            const resolved = await resolvePrice(charge.id, invoiceId);
            const billingPrice = resolved.isExcluded ? 0 : resolved.unitPrice;
            await pool.query(
              'INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category) VALUES ($1, $2, $3, 1, $4, $4, $5)',
              [invoiceId, charge.id, test_name, billingPrice, 'lab']
            );
            // Update invoice total
            const itemsTotal = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
            await pool.query('UPDATE invoices SET subtotal = $1, total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [parseFloat(itemsTotal.rows[0].total), invoiceId]);
          }
        }
      } catch (billingErr) {
        console.error('Walk-in billing on order creation failed (non-fatal):', billingErr);
      }
    }

    // Create a walk-in lab appointment for scheduled orders so it shows on the calendar
    if (priority === 'scheduled') {
      const appointmentDate = scheduledFor || new Date();
      // Get patient name for the appointment
      const ptResult = await pool.query(
        `SELECT u.first_name || ' ' || u.last_name as patient_name
         FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
        [patient_id]
      );
      const patientName = ptResult.rows[0]?.patient_name || 'Unknown';
      await pool.query(
        `INSERT INTO appointments (patient_id, patient_name, appointment_date, duration_minutes,
          appointment_type, status, reason, created_by)
         VALUES ($1, $2, $3, 15, 'walk-in lab', 'scheduled', $4, $5)`,
        [patient_id, patientName, appointmentDate, `Lab: ${test_name}`, currentUserId]
      );
    }

    // Audit log
    await auditService.log({
      userId: currentUserId,
      action: 'create',
      entityType: 'lab_order',
      entityId: order.id,
      details: { test_name, test_code, priority, patient_id }
    });

    // Send STAT notification if high priority
    if (priority === 'stat' || priority === 'urgent') {
      await notificationService.notifyStatOrder('lab', order.id, 'lab');
    }

    // Notify assigned nurse about new order
    await notificationService.notifyNurseOrderCreated('lab', order.id);

    res.status(201).json({
      message: 'Lab order created successfully',
      order,
    });
  } catch (error) {
    console.error('Create lab order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLabOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureLabVerificationSchema();

    // Auto-cancel stale orders older than 3 days that are still pending/in-progress
    await pool.query(
      `UPDATE lab_orders
         SET status = 'cancelled',
             notes = COALESCE(notes || ' | ', '') || 'Auto-cancelled: stale order',
             updated_at = CURRENT_TIMESTAMP
       WHERE status IN ('ordered', 'in-progress')
         AND ordered_date < NOW() - INTERVAL '3 days'`
    );

    const { patient_id, encounter_id, status, start_date, end_date, priority } = req.query;

    const authReqGet = req as any;
    const requesterRole = authReqGet.user?.role;
    // Doctors/nurses/receptionists must not see entered-but-unverified results
    // (verification_status = 'pending' or 'rejected'). We blank the result
    // fields at the SQL level so a verifier mid-review can't leak preliminary
    // values to the doctor. Lab and admin roles always see the full payload.
    const canSeeUnverified = requesterRole === 'lab' || requesterRole === 'admin';
    const resultCol = canSeeUnverified
      ? 'lo.result'
      : `CASE WHEN lo.verification_status IN ('pending','rejected') THEN NULL ELSE lo.result END`;
    const resultDocCol = canSeeUnverified
      ? 'lo.result_document_id'
      : `CASE WHEN lo.verification_status IN ('pending','rejected') THEN NULL ELSE lo.result_document_id END`;

    let query = `
      SELECT lo.id,
        lo.patient_id,
        lo.encounter_id,
        lo.ordering_provider,
        lo.entered_by,
        lo.test_name,
        lo.test_code,
        lo.priority,
        lo.notes,
        lo.specimen_id,
        lo.path_no,
        lo.ordered_date as ordered_at,
        lo.collected_date as specimen_collected_at,
        lo.result_date as results_available_at,
        lo.result_date as completed_at,
        ${resultCol} as results,
        ${resultDocCol} as result_document_id,
        pd.document_name as result_document_name,
        pd.file_type as result_document_file_type,
        lo.verification_status,
        lo.assigned_reviewer_id,
        lo.verified_by,
        lo.verified_at,
        lo.verification_notes,
        lo.rejection_reason,
        lo.rejection_count,
        u_reviewer.first_name || ' ' || u_reviewer.last_name as assigned_reviewer_name,
        u_verifier.first_name || ' ' || u_verifier.last_name as verified_by_name,
        lo.created_at,
        lo.updated_at,
        CASE
          WHEN lo.status = 'ordered' THEN 'pending'
          WHEN lo.status = 'collected' THEN 'pending'
          WHEN lo.status = 'in-progress' THEN 'in_progress'
          ELSE lo.status
        END as status,
        u.first_name || ' ' || u.last_name as ordering_provider_name,
        u_entered.first_name || ' ' || u_entered.last_name as entered_by_name,
        e.encounter_number,
        p.patient_number,
        p.date_of_birth as patient_dob,
        p.gender as patient_gender,
        p.allergies as patient_allergies,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        e.clinic as encounter_clinic
      FROM lab_orders lo
      LEFT JOIN users u ON lo.ordering_provider = u.id
      LEFT JOIN users u_entered ON lo.entered_by = u_entered.id
      LEFT JOIN users u_reviewer ON lo.assigned_reviewer_id = u_reviewer.id
      LEFT JOIN users u_verifier ON lo.verified_by = u_verifier.id
      LEFT JOIN encounters e ON lo.encounter_id = e.id
      LEFT JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN patient_documents pd ON lo.result_document_id = pd.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND lo.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (encounter_id) {
      query += ` AND lo.encounter_id = $${paramCount}`;
      params.push(encounter_id);
      paramCount++;
    }

    if (status) {
      // Map frontend status to database status for filtering
      let dbStatus = status;
      if (status === 'pending') {
        query += ` AND lo.status IN ('ordered', 'collected')`;
      } else if (status === 'in_progress') {
        query += ` AND lo.status = 'in-progress'`;
      } else {
        query += ` AND lo.status = $${paramCount}`;
        params.push(dbStatus);
        paramCount++;
      }
    }

    if (start_date) {
      // Cast to date to ensure comparison starts from beginning of day
      query += ` AND lo.ordered_date >= $${paramCount}::date`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      // Add end of day to include all records from the end date
      query += ` AND lo.ordered_date <= $${paramCount}::date + interval '1 day' - interval '1 second'`;
      params.push(end_date);
      paramCount++;
    }

    if (priority) {
      query += ` AND lo.priority = $${paramCount}`;
      params.push(priority);
      paramCount++;
    }

    query += ` ORDER BY lo.ordered_date DESC`;

    const result = await pool.query(query, params);

    res.json({
      lab_orders: result.rows,
    });
  } catch (error) {
    console.error('Get lab orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Auto-create the peer-review columns on first use so the feature degrades
// gracefully if the addLabResultVerification migration has not yet been run
// against this environment (e.g. the code deploys before the migration is
// executed). Idempotent, runs once per process.
let labVerificationSchemaEnsured = false;
const ensureLabVerificationSchema = async (): Promise<void> => {
  if (labVerificationSchemaEnsured) return;
  try {
    await pool.query(`
      ALTER TABLE lab_orders
        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20)
          DEFAULT 'not_required'
          CHECK (verification_status IN ('not_required', 'pending', 'verified', 'rejected')),
        ADD COLUMN IF NOT EXISTS assigned_reviewer_id INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verification_notes TEXT,
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS path_no VARCHAR(10)
    `);
    await pool.query(`
      UPDATE lab_orders SET verification_status = 'not_required'
       WHERE verification_status IS NULL
    `);
    labVerificationSchemaEnsured = true;
  } catch (err) {
    // Don't permanently flip the flag — let the next call retry.
    console.error('Failed to ensure lab verification schema:', err);
  }
};

// Auto-create the audit table on first use so the feature works even
// before the addLabResultAudit migration is run against this environment.
let labResultAuditEnsured = false;
const ensureLabResultAudit = async (): Promise<void> => {
  if (labResultAuditEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_result_audit (
      id SERIAL PRIMARY KEY,
      lab_order_id INTEGER NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
      edited_by INTEGER NOT NULL REFERENCES users(id),
      edit_type VARCHAR(40) NOT NULL,
      old_result TEXT,
      new_result TEXT,
      old_document_id INTEGER,
      new_document_id INTEGER,
      reason TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_result_audit_order
      ON lab_result_audit(lab_order_id, created_at DESC)
  `);
  labResultAuditEnsured = true;
};

// Side effects that fire when a lab order reaches the 'completed' state:
// critical-value alerts, automatic billing, doctor notification, and
// auto-routing the patient back to the nurse when all labs are done.
//
// Pulled out into a helper so it can be invoked from both the legacy update
// path (grandfathered results going straight to completed) and the new
// verifyLabResult endpoint. Idempotent — uses ON CONFLICT DO NOTHING and a
// double-billing guard, so calling it twice on the same order is safe.
const runLabCompletionSideEffects = async (
  orderId: number,
  order: any
): Promise<void> => {
  // 1. Critical-result alerts
  //
  // Two shapes are possible in lab_orders.result:
  //   - JSON {parameter_code: value, ...} from the structured entry modal
  //   - Free text (legacy / non-templated tests like "5.4 mmol/L Normal")
  //
  // For the JSON case we look up critical thresholds per parameter in
  // lab_test_parameters and fire an alert for every parameter that is out
  // of critical range. For the free-text case we fall back to the legacy
  // single-number parse against lab_test_catalog.
  if (order.result) {
    try {
      // Try to parse as structured JSON first.
      let structured: Record<string, string> | null = null;
      const trimmed = (order.result || '').trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            structured = parsed as Record<string, string>;
          }
        } catch {
          // Not valid JSON — fall through to legacy path
        }
      }

      if (structured) {
        // Resolve the order to its template, then check every parameter.
        const tmpl = await pool.query(
          `SELECT id FROM lab_test_catalog
            WHERE test_code = $1 OR test_name = $2
            LIMIT 1`,
          [order.test_code, order.test_name],
        );
        if (tmpl.rows.length > 0) {
          const params = await pool.query(
            `SELECT parameter_name, parameter_code, critical_low, critical_high
               FROM lab_test_parameters
              WHERE lab_test_id = $1 AND value_type = 'numeric'`,
            [tmpl.rows[0].id],
          );
          for (const p of params.rows) {
            const key = p.parameter_code || p.parameter_name;
            const raw = structured[key];
            if (raw == null || raw === '') continue;
            const v = parseFloat(String(raw));
            if (Number.isNaN(v)) continue;

            let alertType: string | null = null;
            if (p.critical_low != null && v < parseFloat(p.critical_low)) {
              alertType = 'critical_low';
            } else if (p.critical_high != null && v > parseFloat(p.critical_high)) {
              alertType = 'critical_high';
            }
            if (alertType) {
              await pool.query(
                `INSERT INTO critical_result_alerts
                   (lab_order_id, ordering_provider_id, alert_type, result_value)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [orderId, order.ordering_provider, alertType, `${p.parameter_name}: ${raw}`],
              );
            }
          }
        }
      } else {
        // Legacy single-number path
        const catalogResult = await pool.query(
          `SELECT * FROM lab_test_catalog
           WHERE test_code = $1 OR test_name ILIKE $2
           LIMIT 1`,
          [order.test_code, order.test_name],
        );

        if (catalogResult.rows.length > 0) {
          const catalog = catalogResult.rows[0];
          const resultValue = parseFloat(order.result);

          if (!isNaN(resultValue)) {
            let alertType: string | null = null;
            if (catalog.critical_low !== null && resultValue < catalog.critical_low) {
              alertType = 'critical_low';
            } else if (catalog.critical_high !== null && resultValue > catalog.critical_high) {
              alertType = 'critical_high';
            }

            if (alertType) {
              await pool.query(
                `INSERT INTO critical_result_alerts
                   (lab_order_id, ordering_provider_id, alert_type, result_value)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [orderId, order.ordering_provider, alertType, order.result],
              );
            }
          }
        }
      }
    } catch (criticalError) {
      console.error('Error checking critical result:', criticalError);
    }
  }

  // 2. Billing — use resolvePrice for correct payer-aware pricing
  try {
    // Lab pricing priority:
    // 1. lab_test_catalog (authoritative — updated lab price list)
    // 2. charge_master (fallback — general billing charges)
    const testName = (order.test_name || '').trim();
    const keywords = testName.split(/\s+/).filter((w: string) => w.length > 2).slice(0, 3)
      .map((k: string) => k.replace(/s$/i, ''));
    const keywordPattern = keywords.length > 0 ? keywords.map((k: string) => `(?=.*${k})`).join('') : testName;

    // Try lab_test_catalog first (the updated lab price list)
    let catalogMatch: any = null;
    try {
      const catalogResult = await pool.query(
        `SELECT id, test_code, test_name, base_price FROM lab_test_catalog
         WHERE is_active = true
         AND (
           test_code = $1
           OR test_name ILIKE $2
           OR $3 ILIKE '%' || test_name || '%'
           OR test_name ~* $4
         )
         ORDER BY
           CASE WHEN test_code = $1 THEN 1
                WHEN test_name ILIKE $2 THEN 2
                ELSE 3 END
         LIMIT 1`,
        [order.test_code, `%${testName}%`, testName, keywordPattern]
      );
      catalogMatch = catalogResult.rows[0];
    } catch { /* lab_test_catalog might not exist in all environments */ }

    // Fall back to charge_master if not found in catalog
    const chargeResult = catalogMatch ? { rows: [] } : await pool.query(
      `SELECT id, service_name, service_code, price FROM charge_master
       WHERE category = 'lab' AND is_active = true
       AND (
         service_code = $1
         OR service_name ILIKE $2
         OR $3 ILIKE '%' || service_name || '%'
         OR service_name ~* $4
       )
       ORDER BY
         CASE WHEN service_code = $1 THEN 1
              WHEN service_name ILIKE $2 THEN 2
              ELSE 3 END
       LIMIT 1`,
      [order.test_code, `%${testName}%`, testName, keywordPattern]
    );

    // Use catalog match (authoritative) or charge_master fallback
    const charge = chargeResult.rows[0];
    const labSource = catalogMatch || charge;
    const chargeDescription = catalogMatch ? catalogMatch.test_name : (charge ? charge.service_name : order.test_name);
    const chargeMasterId = charge ? charge.id : null;
    // Price: catalog base_price takes priority over charge_master price
    const directLabPrice = catalogMatch ? parseFloat(catalogMatch.base_price) : null;

    const invoiceResult = await pool.query(
      `SELECT id FROM invoices WHERE encounter_id = $1 LIMIT 1`,
      [order.encounter_id]
    );

    if (invoiceResult.rows.length > 0) {
      const invoiceId = invoiceResult.rows[0].id;

      // Resolve price: catalog price > payer-resolved price > charge_master price
      let labPrice: number;
      if (directLabPrice != null) {
        // Use lab_test_catalog price (the authoritative lab price list)
        labPrice = directLabPrice;
      } else if (charge) {
        // Fall back to charge_master with payer-aware price resolution
        const { resolvePrice } = require('../services/priceResolutionService');
        const resolved = await resolvePrice(charge.id, invoiceId);
        labPrice = resolved.unitPrice;
      } else {
        // No match anywhere — log warning
        console.warn(`⚠️ Lab billing: No match for test "${order.test_name}" (code: ${order.test_code}) in lab_test_catalog or charge_master.`);
        labPrice = 0;
      }

      const existingItem = await pool.query(
        `SELECT id FROM invoice_items
         WHERE invoice_id = $1 AND description = $2`,
        [invoiceId, `Lab: ${chargeDescription}`]
      );

      if (existingItem.rows.length === 0) {
        await pool.query(
          `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category)
           VALUES ($1, $2, $3, 1, $4, $4, 'lab')`,
          [invoiceId, chargeMasterId, `Lab: ${chargeDescription}`, labPrice]
        );
        await pool.query(
          `UPDATE invoices
           SET subtotal = subtotal + $2,
               total_amount = total_amount + $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [invoiceId, labPrice]
        );
      }
    }
  } catch (billingError) {
    console.error('Error billing completed lab order:', billingError);
  }

  // 3. Notify doctor + auto-route patient back to nurse when all labs done
  try {
    await notificationService.notifyLabComplete(orderId);

    const pendingOrders = await pool.query(
      `SELECT COUNT(*) FROM lab_orders
       WHERE encounter_id = $1 AND status NOT IN ('completed', 'cancelled')`,
      [order.encounter_id]
    );

    if (parseInt(pendingOrders.rows[0].count) === 0) {
      await notificationService.autoRouteToNurse(order.encounter_id, 'lab');
    }
  } catch (notifyError) {
    console.error('Error notifying lab completion:', notifyError);
  }
};

export const updateLabOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureLabVerificationSchema();
    await ensureLabResultAudit();
    const authReq = req as any;
    const userId = authReq.user?.id;
    const id = req.params.id as string;
    const updateData = { ...req.body };
    const reason: string | undefined = updateData.reason;
    delete updateData.reason; // never goes into the lab_orders row
    const assignedReviewerIdRaw = updateData.assigned_reviewer_id;
    // Strip from the generic UPDATE payload — we set it explicitly below only
    // when this update is a first-time result entry (or a resubmit after a
    // rejection). Otherwise this column should not be touched.
    delete updateData.assigned_reviewer_id;

    // Read the existing row BEFORE updating so we can detect changes and
    // log to the audit trail. Required when a 'completed' result is being
    // edited (paper-trail requirement).
    const beforeResult = await pool.query(
      `SELECT id, status, result, result_document_id, entered_by,
              verification_status, rejection_count
         FROM lab_orders WHERE id = $1`,
      [id]
    );
    if (beforeResult.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }
    const before = beforeResult.rows[0];
    const wasCompleted = before.status === 'completed';

    // Map frontend status values to database status values
    if (updateData.status) {
      const statusMap: { [key: string]: string } = {
        'pending': 'ordered',
        'in_progress': 'in-progress',
        'completed': 'completed',
        'cancelled': 'cancelled',
      };
      updateData.status = statusMap[updateData.status] || updateData.status;
    }

    // Map frontend field names to database field names
    if (updateData.specimen_collected_at !== undefined) {
      updateData.collected_date = updateData.specimen_collected_at;
      delete updateData.specimen_collected_at;
    }
    if (updateData.results_available_at !== undefined) {
      updateData.result_date = updateData.results_available_at;
      delete updateData.results_available_at;
    }
    if (updateData.results !== undefined) {
      updateData.result = updateData.results;
      delete updateData.results;
    }

    // Detect a first-time result entry (or a resubmit after rejection).
    // Either the result text or the attached PDF is being set, and the row
    // is NOT already verified. This is the trigger for the peer-review flow:
    // the lab tech must assign a reviewer and the order stays in-progress
    // (verification_status='pending') until that reviewer approves.
    const settingResultText =
      updateData.result !== undefined &&
      (updateData.result || '').trim() !== '' &&
      (updateData.result || '').trim() !== (before.result || '').trim();
    const settingResultDoc =
      updateData.result_document_id !== undefined &&
      updateData.result_document_id !== null &&
      updateData.result_document_id !== before.result_document_id;
    const enteringResult = settingResultText || settingResultDoc;
    const alreadyVerified = before.verification_status === 'verified';
    const triggersVerificationFlow = enteringResult && !alreadyVerified;

    if (triggersVerificationFlow) {
      // If skip_verification is explicitly set, bypass peer review and auto-complete
      if (updateData.skip_verification === true) {
        delete updateData.skip_verification;
        updateData.status = 'completed';
        updateData.verification_status = 'not_required';
        updateData.result_date = new Date().toISOString();
        updateData.entered_by = userId;
      } else {
      // Reviewer must be supplied, must be a real lab user, and cannot be the
      // person entering the result (self-review is blocked).
      const reviewerId = parseInt(assignedReviewerIdRaw, 10);
      if (!reviewerId || Number.isNaN(reviewerId)) {
        res.status(400).json({
          error: 'A reviewer must be assigned before submitting a lab result for verification.',
        });
        return;
      }
      const entryUserId = before.entered_by || userId;
      if (reviewerId === entryUserId) {
        res.status(400).json({
          error: 'You cannot assign yourself as the reviewer. Please pick another lab tech.',
        });
        return;
      }
      const reviewerCheck = await pool.query(
        `SELECT id, role, is_active FROM users WHERE id = $1`,
        [reviewerId]
      );
      if (reviewerCheck.rows.length === 0) {
        res.status(400).json({ error: 'Assigned reviewer not found.' });
        return;
      }
      const reviewer = reviewerCheck.rows[0];
      if (!reviewer.is_active) {
        res.status(400).json({ error: 'Assigned reviewer is not an active user.' });
        return;
      }
      if (reviewer.role !== 'lab') {
        res.status(400).json({
          error: 'Assigned reviewer must be a lab tech.',
        });
        return;
      }

      // Force the order into the pending-verification state. The completion
      // transition (status='completed', billing, critical alerts, doctor
      // notification, auto-route to nurse) is owned by verifyLabResult and
      // must not fire here.
      updateData.status = 'in-progress';
      updateData.verification_status = 'pending';
      updateData.assigned_reviewer_id = reviewerId;
      updateData.verified_by = null;
      updateData.verified_at = null;
      updateData.verification_notes = null;
      updateData.rejection_reason = null;
      if (before.verification_status === 'rejected') {
        updateData.rejection_count = (before.rejection_count || 0) + 1;
      }
      // Don't write a result_date until the result is actually verified.
      delete updateData.result_date;
      } // end else (peer-review path)
    }

    // If completing, set result_date to now. Reachable only when the order
    // is already verified (i.e., editing a completed result that has gone
    // through verification) or when grandfathered (verification_status =
    // 'not_required').
    if (
      updateData.status === 'completed' &&
      !updateData.result_date &&
      !triggersVerificationFlow
    ) {
      updateData.result_date = new Date().toISOString();
    }

    // Paper trail enforcement: if the row was already completed and the
    // result text is being changed, require a reason.
    const resultTextChanged =
      wasCompleted &&
      updateData.result !== undefined &&
      (updateData.result || '').trim() !== (before.result || '').trim();
    if (resultTextChanged && (!reason || !reason.trim())) {
      res.status(400).json({
        error: 'A reason is required when editing a completed result. Please supply a reason.',
      });
      return;
    }

    const { setClause, values } = buildSafeUpdateClause('lab_orders', updateData, 2);

    const result = await pool.query(
      `UPDATE lab_orders SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }

    const updatedOrder = result.rows[0];

    // Log to audit trail if a completed result's text changed.
    // (File replacement is logged in documentsController when the new
    // document is uploaded.)
    if (resultTextChanged && userId) {
      try {
        await pool.query(
          `INSERT INTO lab_result_audit
             (lab_order_id, edited_by, edit_type, old_result, new_result, reason)
           VALUES ($1, $2, 'result_text_change', $3, $4, $5)`,
          [id, userId, before.result || null, updateData.result || null, reason || 'No reason given']
        );
      } catch (auditErr) {
        // Non-blocking — the update itself succeeded
        console.error('Failed to write lab result audit:', auditErr);
      }
    }

    // Audit log
    await auditService.log({
      userId: authReq.user?.id,
      action: 'update',
      entityType: 'lab_order',
      entityId: parseInt(id),
      details: updateData
    });

    // Side effects only fire when the order is actually transitioning to
    // 'completed'. The verification flow keeps status at 'in-progress', so
    // critical alerts / billing / doctor notification are deferred to
    // verifyLabResult. Grandfathered rows (verification_status='not_required')
    // and legacy callers still finalize here.
    if (updateData.status === 'completed' && !triggersVerificationFlow) {
      await runLabCompletionSideEffects(parseInt(id), updatedOrder);
    }

    res.json({
      message: triggersVerificationFlow
        ? 'Result submitted for verification.'
        : 'Lab order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Update lab order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Clear a completed result and send the order back to in-progress. Requires
// a reason; logged to the audit trail. Used when the lab tech realises they
// attached the wrong file or entered values against the wrong order.
export const deleteLabResult = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureLabResultAudit();
    const authReq = req as any;
    const userId = authReq.user?.id;
    const id = req.params.id as string;
    const reason: string | undefined = req.body?.reason;

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'A reason is required to clear a completed result.' });
      return;
    }

    const beforeResult = await pool.query(
      `SELECT id, status, result, result_document_id FROM lab_orders WHERE id = $1`,
      [id]
    );
    if (beforeResult.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }
    const before = beforeResult.rows[0];
    if (before.status !== 'completed') {
      res.status(400).json({ error: 'Only completed orders can have their results cleared.' });
      return;
    }

    // Clear result fields and revert status. The previous patient_documents
    // row stays in place (referenced by the audit log for paper trail) — we
    // just stop pointing at it from this lab order.
    await pool.query(
      `UPDATE lab_orders
          SET result = NULL,
              result_document_id = NULL,
              result_date = NULL,
              status = 'in-progress',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id]
    );

    try {
      await pool.query(
        `INSERT INTO lab_result_audit
           (lab_order_id, edited_by, edit_type, old_result, new_result, old_document_id, new_document_id, reason)
         VALUES ($1, $2, 'delete', $3, NULL, $4, NULL, $5)`,
        [id, userId, before.result || null, before.result_document_id || null, reason.trim()]
      );
    } catch (auditErr) {
      console.error('Failed to write lab result audit (delete):', auditErr);
    }

    res.json({ message: 'Result cleared. Order is back in-progress.' });
  } catch (error) {
    console.error('Delete lab result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Audit history for a single lab order. Returns every recorded edit (text
// change, file replace, delete) so the doctor can see exactly what the
// lab tech changed and why.
export const getLabResultAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureLabResultAudit();
    const id = req.params.id as string;
    const result = await pool.query(
      `SELECT a.id, a.lab_order_id, a.edit_type, a.old_result, a.new_result,
              a.old_document_id, a.new_document_id, a.reason, a.created_at,
              u.first_name || ' ' || u.last_name AS edited_by_name,
              u.role AS edited_by_role
         FROM lab_result_audit a
         JOIN users u ON a.edited_by = u.id
        WHERE a.lab_order_id = $1
        ORDER BY a.created_at DESC`,
      [id]
    );
    res.json({ audit: result.rows });
  } catch (error) {
    // If the table doesn't exist yet (migration not run), return empty
    // history instead of erroring out the whole row.
    console.error('Get lab result audit error:', error);
    res.json({ audit: [] });
  }
};

// Peer-review verification: approve a result that has been entered and is
// sitting at verification_status='pending'. Verifier must be a lab user and
// must not be the same person who entered the result (self-verification is
// blocked). On approval the order transitions to 'completed' and the usual
// side effects (critical alerts, billing, doctor notification, auto-route)
// run from runLabCompletionSideEffects.
export const verifyLabResult = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureLabVerificationSchema();
    await ensureLabResultAudit();
    const authReq = req as any;
    const userId = authReq.user?.id;
    const userRole = authReq.user?.role;
    const id = parseInt(req.params.id as string, 10);
    const notes: string | undefined = req.body?.notes;

    if (userRole !== 'lab' && userRole !== 'admin') {
      res.status(403).json({ error: 'Only lab users can verify lab results.' });
      return;
    }

    const beforeResult = await pool.query(
      `SELECT id, entered_by, verification_status FROM lab_orders WHERE id = $1`,
      [id]
    );
    if (beforeResult.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }
    const before = beforeResult.rows[0];

    if (before.verification_status !== 'pending') {
      res.status(400).json({
        error: `Cannot verify a result whose status is '${before.verification_status}'. Only pending results can be verified.`,
      });
      return;
    }
    if (before.entered_by === userId) {
      res.status(403).json({
        error: 'You cannot verify your own result. Another lab tech must review it.',
      });
      return;
    }

    const updated = await pool.query(
      `UPDATE lab_orders
          SET verification_status = 'verified',
              verified_by = $2,
              verified_at = CURRENT_TIMESTAMP,
              verification_notes = $3,
              status = 'completed',
              result_date = CURRENT_TIMESTAMP,
              rejection_reason = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
      [id, userId, notes || null]
    );

    const order = updated.rows[0];

    // Audit: record the approval so the paper trail shows who verified.
    try {
      await pool.query(
        `INSERT INTO lab_result_audit
           (lab_order_id, edited_by, edit_type, old_result, new_result, reason)
         VALUES ($1, $2, 'verification_approved', $3, $3, $4)`,
        [id, userId, order.result || null, notes && notes.trim() ? notes : 'Approved']
      );
    } catch (auditErr) {
      console.error('Failed to write verification audit:', auditErr);
    }

    await auditService.log({
      userId,
      action: 'verify',
      entityType: 'lab_order',
      entityId: id,
      details: { notes: notes || null },
    });

    // Fire the completion side effects now that the result is verified and
    // visible to the doctor.
    await runLabCompletionSideEffects(id, order);

    res.json({
      message: 'Result verified. Doctor will be notified.',
      order,
    });
  } catch (error) {
    console.error('Verify lab result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Peer-review rejection: send a pending result back to the entry tech with
// a required reason. The result is preserved (so the entry tech can see what
// they had submitted and edit it), but status returns to 'in-progress' and
// the order is hidden from the doctor until the entry tech resubmits and a
// reviewer approves.
export const rejectLabResult = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureLabVerificationSchema();
    await ensureLabResultAudit();
    const authReq = req as any;
    const userId = authReq.user?.id;
    const userRole = authReq.user?.role;
    const id = parseInt(req.params.id as string, 10);
    const rejectionReason: string | undefined = req.body?.reason;

    if (userRole !== 'lab' && userRole !== 'admin') {
      res.status(403).json({ error: 'Only lab users can reject lab results.' });
      return;
    }
    if (!rejectionReason || !rejectionReason.trim()) {
      res.status(400).json({ error: 'A reason is required when rejecting a result.' });
      return;
    }

    const beforeResult = await pool.query(
      `SELECT id, entered_by, verification_status, result FROM lab_orders WHERE id = $1`,
      [id]
    );
    if (beforeResult.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }
    const before = beforeResult.rows[0];

    if (before.verification_status !== 'pending') {
      res.status(400).json({
        error: `Cannot reject a result whose status is '${before.verification_status}'. Only pending results can be rejected.`,
      });
      return;
    }
    if (before.entered_by === userId) {
      res.status(403).json({
        error: 'You cannot reject your own result. Another lab tech must review it.',
      });
      return;
    }

    const updated = await pool.query(
      `UPDATE lab_orders
          SET verification_status = 'rejected',
              rejection_reason = $2,
              status = 'in-progress',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
      [id, rejectionReason.trim()]
    );
    const order = updated.rows[0];

    try {
      await pool.query(
        `INSERT INTO lab_result_audit
           (lab_order_id, edited_by, edit_type, old_result, new_result, reason)
         VALUES ($1, $2, 'verification_rejected', $3, $3, $4)`,
        [id, userId, before.result || null, rejectionReason.trim()]
      );
    } catch (auditErr) {
      console.error('Failed to write rejection audit:', auditErr);
    }

    await auditService.log({
      userId,
      action: 'reject',
      entityType: 'lab_order',
      entityId: id,
      details: { reason: rejectionReason.trim() },
    });

    // Notify the entry tech that their result was kicked back. Uses the
    // generic in-app notification path so it appears alongside other lab
    // alerts in their dashboard.
    if (before.entered_by) {
      try {
        await notificationService.send({
          userId: before.entered_by,
          type: 'lab_result_rejected',
          title: 'Lab result needs your attention',
          message: `Your ${order.test_name} result was sent back: ${rejectionReason.trim()}`,
          entityType: 'lab_order',
          entityId: id,
        });
      } catch (notifyErr) {
        console.error('Failed to notify entry tech of rejection:', notifyErr);
      }
    }

    res.json({
      message: 'Result returned to the entry tech.',
      order,
    });
  } catch (error) {
    console.error('Reject lab result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Pending-verification queue: lab orders waiting for a peer review. The
// queue is shared (assignment is a hint, not a lock), so any lab tech other
// than the entry tech sees every pending row. We surface the assigned
// reviewer so the team can self-organise without enforcing a hard lock.
export const getPendingVerificationQueue = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await ensureLabVerificationSchema();
    const authReq = req as any;
    const userId = authReq.user?.id;
    const userRole = authReq.user?.role;

    if (userRole !== 'lab' && userRole !== 'admin') {
      res.status(403).json({ error: 'Only lab users can view the verification queue.' });
      return;
    }

    // Exclude rows the caller entered themselves — they cannot self-verify,
    // so showing them would just be noise. Admins see everything.
    const excludeOwn = userRole === 'lab';

    const queue = await pool.query(
      `SELECT lo.id, lo.patient_id, lo.encounter_id, lo.test_name, lo.test_code,
              lo.priority, lo.status,
              lo.result, lo.result as results,
              lo.result_document_id, lo.notes, lo.path_no,
              lo.ordered_date, lo.ordered_date as ordered_at,
              lo.collected_date as specimen_collected_at,
              lo.result_date as results_available_at,
              lo.verification_status, lo.assigned_reviewer_id, lo.entered_by,
              lo.rejection_count, lo.rejection_reason, lo.updated_at,
              pd.document_name as result_document_name,
              pd.file_type as result_document_file_type,
              u_entered.first_name || ' ' || u_entered.last_name AS entered_by_name,
              u_reviewer.first_name || ' ' || u_reviewer.last_name AS assigned_reviewer_name,
              u_patient.first_name || ' ' || u_patient.last_name AS patient_name,
              p.patient_number, p.date_of_birth AS patient_dob, p.gender AS patient_gender
         FROM lab_orders lo
         LEFT JOIN users u_entered ON lo.entered_by = u_entered.id
         LEFT JOIN users u_reviewer ON lo.assigned_reviewer_id = u_reviewer.id
         LEFT JOIN patients p ON lo.patient_id = p.id
         LEFT JOIN users u_patient ON p.user_id = u_patient.id
         LEFT JOIN patient_documents pd ON lo.result_document_id = pd.id
        WHERE lo.verification_status = 'pending'
          ${excludeOwn ? 'AND (lo.entered_by IS NULL OR lo.entered_by <> $1)' : ''}
        ORDER BY
          CASE WHEN lo.priority = 'stat' THEN 0
               WHEN lo.priority = 'urgent' THEN 1
               ELSE 2 END,
          CASE WHEN lo.assigned_reviewer_id = $1 THEN 0 ELSE 1 END,
          lo.updated_at DESC`,
      excludeOwn ? [userId] : [userId]
    );

    res.json({ pending: queue.rows });
  } catch (error) {
    console.error('Get pending verification queue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Imaging Orders
export const createImagingOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const currentUserId = authReq.user?.id;
    const currentUserRole = authReq.user?.role;

    const { patient_id, encounter_id, imaging_type, study_type, body_part, priority, clinical_indication, notes, ordering_provider_id, scheduled_time } = req.body;

    // Determine the ordering provider:
    // - If nurse provides ordering_provider_id, use that (ordering on behalf of doctor)
    // - Otherwise, use current user (doctor ordering for themselves)
    let orderingProvider = currentUserId;
    if (currentUserRole === 'nurse' && ordering_provider_id) {
      orderingProvider = ordering_provider_id;
    }

    // Support both imaging_type (doctor) and study_type (nurse form)
    const studyType = imaging_type || study_type;

    // Prevent duplicate: same imaging type + body part for the same encounter.
    // Scheduled orders are exempt.
    if (priority !== 'scheduled') {
      const dupCheck = await pool.query(
        `SELECT id FROM imaging_orders
         WHERE encounter_id = $1
           AND LOWER(imaging_type) = LOWER($2)
           AND COALESCE(LOWER(body_part), '') = COALESCE(LOWER($3), '')
           AND status != 'cancelled'
         LIMIT 1`,
        [encounter_id, studyType, body_part]
      );
      if (dupCheck.rows.length > 0) {
        res.status(409).json({ error: `${studyType}${body_part ? ' (' + body_part + ')' : ''} has already been ordered for this encounter.` });
        return;
      }
    }

    const parsedTime = scheduled_time ? new Date(scheduled_time) : null;
    const scheduledFor = (priority === 'scheduled' && parsedTime && !isNaN(parsedTime.getTime())) ? parsedTime : null;

    const result = await pool.query(
      `INSERT INTO imaging_orders (
        patient_id, encounter_id, ordering_provider, imaging_type, body_part, priority, clinical_indication, notes, scheduled_for
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [patient_id, encounter_id, orderingProvider, studyType, body_part, priority || 'routine', clinical_indication, notes, scheduledFor]
    );

    const order = result.rows[0];

    // For walk-in/OTC patients (ordered by imaging tech), bill immediately
    if (currentUserRole === 'imaging') {
      try {
        let invoiceRow = await pool.query('SELECT id FROM invoices WHERE encounter_id = $1', [encounter_id]);
        if (invoiceRow.rows.length > 0) {
          const invoiceId = invoiceRow.rows[0].id;
          const chargeResult = await pool.query(
            "SELECT id, price FROM charge_master WHERE LOWER(service_name) = LOWER($1) AND category = 'imaging' AND is_active = true LIMIT 1",
            [studyType]
          );
          if (chargeResult.rows.length > 0) {
            const charge = chargeResult.rows[0];
            const { resolvePrice } = require('../services/priceResolutionService');
            const resolved = await resolvePrice(charge.id, invoiceId);
            const billingPrice = resolved.isExcluded ? 0 : resolved.unitPrice;
            const label = `${studyType}${body_part ? ' (' + body_part + ')' : ''}`;
            await pool.query(
              'INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category) VALUES ($1, $2, $3, 1, $4, $4, $5)',
              [invoiceId, charge.id, label, billingPrice, 'imaging']
            );
            const itemsTotal = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
            await pool.query('UPDATE invoices SET subtotal = $1, total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [parseFloat(itemsTotal.rows[0].total), invoiceId]);
          }
        }
      } catch (billingErr) {
        console.error('Walk-in imaging billing on order creation failed (non-fatal):', billingErr);
      }
    }

    // Create a walk-in imaging appointment for scheduled orders
    if (priority === 'scheduled') {
      const appointmentDate = scheduledFor || new Date();
      const ptResult = await pool.query(
        `SELECT u.first_name || ' ' || u.last_name as patient_name
         FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
        [patient_id]
      );
      const patientName = ptResult.rows[0]?.patient_name || 'Unknown';
      const label = `${studyType}${body_part ? ' (' + body_part + ')' : ''}`;
      await pool.query(
        `INSERT INTO appointments (patient_id, patient_name, appointment_date, duration_minutes,
          appointment_type, status, reason, created_by)
         VALUES ($1, $2, $3, 30, 'walk-in imaging', 'scheduled', $4, $5)`,
        [patient_id, patientName, appointmentDate, `Imaging: ${label}`, currentUserId]
      );
    }

    // Audit log
    await auditService.log({
      userId: currentUserId,
      action: 'create',
      entityType: 'imaging_order',
      entityId: order.id,
      details: { imaging_type: studyType, body_part, priority, patient_id }
    });

    // Send STAT notification if high priority
    if (priority === 'stat' || priority === 'urgent') {
      await notificationService.notifyStatOrder('imaging', order.id, 'imaging');
    }

    // Notify assigned nurse about new order
    await notificationService.notifyNurseOrderCreated('imaging', order.id);

    res.status(201).json({
      message: 'Imaging order created successfully',
      order,
    });
  } catch (error) {
    console.error('Create imaging order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getImagingOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, status } = req.query;

    let query = `
      SELECT io.*,
        u.first_name || ' ' || u.last_name as ordering_provider_name,
        e.encounter_number,
        p.patient_number,
        p.allergies as patient_allergies,
        pu.first_name || ' ' || pu.last_name as patient_name
      FROM imaging_orders io
      LEFT JOIN users u ON io.ordering_provider = u.id
      LEFT JOIN encounters e ON io.encounter_id = e.id
      LEFT JOIN patients p ON io.patient_id = p.id
      LEFT JOIN users pu ON p.user_id = pu.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND io.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (encounter_id) {
      query += ` AND io.encounter_id = $${paramCount}`;
      params.push(encounter_id);
      paramCount++;
    }

    if (status) {
      query += ` AND io.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY io.ordered_date DESC`;

    const result = await pool.query(query, params);

    res.json({
      imaging_orders: result.rows,
    });
  } catch (error) {
    console.error('Get imaging orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateImagingOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const updateData = req.body;

    const { setClause, values } = buildSafeUpdateClause('imaging_orders', updateData, 2);

    const result = await pool.query(
      `UPDATE imaging_orders SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Imaging order not found' });
      return;
    }

    const updatedOrder = result.rows[0];

    // Audit log
    const authReq = req as any;
    await auditService.log({
      userId: authReq.user?.id,
      action: 'update',
      entityType: 'imaging_order',
      entityId: parseInt(id),
      details: updateData
    });

    // When imaging order is completed: bill the study and send notifications
    if (updateData.status === 'completed') {
      // Bill the completed imaging order
      try {
        const chargeResult = await pool.query(
          `SELECT id, service_name, price FROM charge_master
           WHERE (service_name ILIKE $1 OR service_name ILIKE $2)
           AND category = 'imaging' AND is_active = true
           ORDER BY
             CASE WHEN service_name ILIKE $1 THEN 1 ELSE 2 END
           LIMIT 1`,
          [`%${updatedOrder.imaging_type}%${updatedOrder.body_part}%`, `%${updatedOrder.imaging_type}%`]
        );

        const charge = chargeResult.rows[0];
        let imagingPrice = 150.00;
        if (charge) {
          imagingPrice = parseFloat(charge.price);
        } else {
          const fallbackPrices: Record<string, number> = {
            'X-Ray': 80.00,
            'CT Scan': 350.00,
            'MRI': 800.00,
            'Ultrasound': 150.00,
            'Mammogram': 200.00,
            'Fluoroscopy': 250.00,
          };
          imagingPrice = fallbackPrices[updatedOrder.imaging_type] || 150.00;
        }

        const chargeDescription = charge ? charge.service_name : `${updatedOrder.imaging_type} - ${updatedOrder.body_part}`;
        const chargeMasterId = charge ? charge.id : null;

        const invoiceResult = await pool.query(
          `SELECT id FROM invoices WHERE encounter_id = $1 LIMIT 1`,
          [updatedOrder.encounter_id]
        );

        if (invoiceResult.rows.length > 0) {
          const invoiceId = invoiceResult.rows[0].id;

          // Guard against double-billing
          const existingItem = await pool.query(
            `SELECT id FROM invoice_items
             WHERE invoice_id = $1 AND description = $2`,
            [invoiceId, `Imaging: ${chargeDescription}`]
          );

          if (existingItem.rows.length === 0) {
            await pool.query(
              `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category)
               VALUES ($1, $2, $3, 1, $4, $4, 'imaging')`,
              [invoiceId, chargeMasterId, `Imaging: ${chargeDescription}`, imagingPrice]
            );

            await pool.query(
              `UPDATE invoices
               SET subtotal = subtotal + $2,
                   total_amount = total_amount + $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [invoiceId, imagingPrice]
            );
          }
        }
      } catch (billingError) {
        console.error('Error billing completed imaging order:', billingError);
      }

      await notificationService.notifyImagingComplete(parseInt(id));

      // Check if all imaging orders for this encounter are complete
      const pendingOrders = await pool.query(
        `SELECT COUNT(*) FROM imaging_orders
         WHERE encounter_id = $1 AND status NOT IN ('completed', 'cancelled')`,
        [updatedOrder.encounter_id]
      );

      // If no more pending imaging orders, auto-route patient back to nurse
      if (parseInt(pendingOrders.rows[0].count) === 0) {
        await notificationService.autoRouteToNurse(updatedOrder.encounter_id, 'imaging');
      }
    }

    res.json({
      message: 'Imaging order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Update imaging order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Pharmacy Orders
export const createPharmacyOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const ordering_provider = authReq.user?.id;

    const {
      patient_id,
      encounter_id,
      medication_name,
      dosage,
      frequency,
      route,
      quantity,
      refills,
      days_supply,
      priority,
      notes,
      inventory_id,
    } = req.body;

    // Prevent duplicate: same medication for the same encounter
    const dupCheck = await pool.query(
      `SELECT id FROM pharmacy_orders
       WHERE encounter_id = $1
         AND LOWER(medication_name) = LOWER($2)
         AND status != 'cancelled'
       LIMIT 1`,
      [encounter_id, medication_name]
    );
    if (dupCheck.rows.length > 0) {
      res.status(409).json({ error: `${medication_name} has already been ordered for this encounter.` });
      return;
    }

    const result = await pool.query(
      `INSERT INTO pharmacy_orders (
        patient_id, encounter_id, ordering_provider, medication_name,
        dosage, frequency, route, quantity, refills, days_supply, priority, notes, inventory_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        patient_id,
        encounter_id,
        ordering_provider,
        medication_name,
        dosage,
        frequency,
        route,
        quantity,
        refills || 0,
        days_supply || null,
        priority || 'routine',
        notes,
        inventory_id || null,
      ]
    );

    // NOTE: Pharmacy billing happens at DISPENSE time, not at order creation
    // This prevents double-charging. See updatePharmacyOrder for billing logic.

    const order = result.rows[0];

    // Audit log
    await auditService.log({
      userId: ordering_provider,
      action: 'create',
      entityType: 'pharmacy_order',
      entityId: order.id,
      details: { medication_name, dosage, frequency, priority, patient_id }
    });

    // Send STAT notification if high priority
    if (priority === 'stat' || priority === 'urgent') {
      await notificationService.notifyStatOrder('pharmacy', order.id, 'pharmacy');
    }

    // Notify assigned nurse about new order
    await notificationService.notifyNurseOrderCreated('pharmacy', order.id);

    // Notify pharmacy staff about new order
    await notificationService.notifyPharmacyNewOrder(order.id);

    res.status(201).json({
      message: 'Pharmacy order created successfully',
      order,
    });
  } catch (error) {
    console.error('Create pharmacy order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPharmacyOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, status } = req.query;

    let query = `
      SELECT po.*,
        u.first_name || ' ' || u.last_name as provider_name,
        e.encounter_number,
        e.chief_complaint,
        p.patient_number,
        p.allergies as patient_allergies,
        pu.first_name || ' ' || pu.last_name as patient_name,
        du.first_name || ' ' || du.last_name as dispensed_by_name,
        pi.quantity_on_hand as inventory_quantity,
        pi.selling_price as inventory_price,
        pi.medication_name as inventory_medication_name,
        pi.unit as inventory_unit,
        COALESCE(
          (SELECT pps.payer_type FROM patient_payer_sources pps
           WHERE pps.patient_id = p.id AND pps.is_primary = true LIMIT 1),
          'self_pay'
        ) as payer_type,
        COALESCE(
          (SELECT CASE
            WHEN pps.payer_type = 'corporate' THEN cc.name
            WHEN pps.payer_type = 'insurance' THEN ip.name
            ELSE 'Self Pay'
          END
          FROM patient_payer_sources pps
          LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
          LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
          WHERE pps.patient_id = p.id AND pps.is_primary = true LIMIT 1),
          'Self Pay'
        ) as payer_name,
        COALESCE(
          (SELECT d.diagnosis_code || ' - ' || d.diagnosis_description
           FROM diagnoses d
           WHERE d.encounter_id = po.encounter_id AND d.type = 'primary'
           LIMIT 1),
          (SELECT d.diagnosis_code || ' - ' || d.diagnosis_description
           FROM diagnoses d
           WHERE d.encounter_id = po.encounter_id
           ORDER BY d.created_at
           LIMIT 1)
        ) as primary_diagnosis,
        EXISTS(
          SELECT 1 FROM department_routing dr
          WHERE dr.encounter_id = po.encounter_id
            AND dr.department = 'pharmacy'
            AND dr.status = 'completed'
        ) as routed_back_to_nurse
      FROM pharmacy_orders po
      LEFT JOIN users u ON po.ordering_provider = u.id
      LEFT JOIN encounters e ON po.encounter_id = e.id
      LEFT JOIN patients p ON po.patient_id = p.id
      LEFT JOIN users pu ON p.user_id = pu.id
      LEFT JOIN users du ON po.dispensed_by = du.id
      LEFT JOIN pharmacy_inventory pi ON po.inventory_id = pi.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND po.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (encounter_id) {
      query += ` AND po.encounter_id = $${paramCount}`;
      params.push(encounter_id);
      paramCount++;
    }

    if (status) {
      // Support comma-separated status values
      const statuses = (status as string).split(',').map(s => s.trim());
      query += ` AND po.status IN (${statuses.map((_, i) => `$${paramCount + i}`).join(', ')})`;
      params.push(...statuses);
      paramCount += statuses.length;
    }

    query += ` ORDER BY po.ordered_date DESC`;

    const result = await pool.query(query, params);

    res.json({
      orders: result.rows,
      pharmacy_orders: result.rows, // Keep for backwards compatibility
    });
  } catch (error) {
    console.error('Get pharmacy orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePharmacyOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const updateData = req.body;
    const authReq = req as any;

    // Prevent editing dispensed orders (only returns are allowed via separate endpoint)
    const currentOrder = await pool.query('SELECT status FROM pharmacy_orders WHERE id = $1', [id]);
    if (currentOrder.rows.length > 0 && currentOrder.rows[0].status === 'dispensed') {
      res.status(403).json({ error: 'Cannot edit a dispensed order. Use the return process instead.' });
      return;
    }

    // If dispensing, track who dispensed
    if (updateData.status === 'dispensed' && authReq.user?.id) {
      updateData.dispensed_by = authReq.user.id;
    }

    // If marking as ready, track who prepared it
    if (updateData.status === 'ready' && authReq.user?.id) {
      updateData.prepared_by = authReq.user.id;
    }

    const { setClause, values } = buildSafeUpdateClause('pharmacy_orders', updateData, 2);

    const result = await pool.query(
      `UPDATE pharmacy_orders SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Pharmacy order not found' });
      return;
    }

    const updatedOrder = result.rows[0];

    // Audit log
    await auditService.log({
      userId: authReq.user?.id,
      action: 'update',
      entityType: 'pharmacy_order',
      entityId: parseInt(id),
      details: updateData
    });

    // Notify pharmacists when a pharmacy tech modifies an order (beyond dispensing)
    if (authReq.user?.role === 'pharmacy_tech' && updateData.status !== 'dispensed') {
      const changedFields = Object.keys(updateData).filter(k => k !== 'updated_at').join(', ');
      await notificationService.notifyPharmacistOfTechAction(
        authReq.user.id,
        'Order Modified',
        `Modified order #${id} (${updatedOrder.medication_name}): ${changedFields}`,
        'pharmacy_order',
        parseInt(id)
      );
    }

    // Sync department_routing status with pharmacy order status
    if (updateData.status) {
      const routingStatus = updateData.status === 'dispensed' ? 'completed' :
                           updateData.status === 'ready' ? 'in-progress' :
                           updateData.status === 'in_progress' ? 'in-progress' : 'pending';

      await pool.query(
        `UPDATE department_routing
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE encounter_id = $2 AND department = 'pharmacy' AND status != 'completed'`,
        [routingStatus, updatedOrder.encounter_id]
      );
    }

    // Notify nurses when medication is READY for pickup
    if (updateData.status === 'ready') {
      await notificationService.notifyPharmacyReady(parseInt(id));

      // Check for drug interactions with patient's current medications
      if (updatedOrder.patient_id && updatedOrder.medication_name) {
        try {
          const interactions = await drugInteractionService.checkInteractions(
            updatedOrder.patient_id,
            updatedOrder.medication_name
          );

          // If there are interactions, notify pharmacist and optionally the ordering doctor
          for (const interaction of interactions) {
            if (interaction.severity === 'severe' || interaction.severity === 'contraindicated') {
              await notificationService.notifyDrugInteraction(parseInt(id), {
                severity: interaction.severity,
                drugs: [interaction.drug1, interaction.drug2],
                description: interaction.description,
              });

              // Log the interaction alert
              await pool.query(
                `INSERT INTO medication_alerts (pharmacy_order_id, patient_id, alert_type, severity, details, created_by)
                 VALUES ($1, $2, 'drug_interaction', $3, $4, $5)
                 ON CONFLICT DO NOTHING`,
                [
                  parseInt(id),
                  updatedOrder.patient_id,
                  interaction.severity,
                  JSON.stringify(interaction),
                  authReq.user?.id
                ]
              );
            }
          }
        } catch (interactionError) {
          console.error('Error checking drug interactions:', interactionError);
          // Don't fail the ready status if interaction check fails
        }
      }
    }

    // Send notification when pharmacy order is dispensed
    if (updateData.status === 'dispensed') {
      try {
        await notificationService.notifyPharmacyDispensed(parseInt(id));
      } catch (notifyError) {
        console.error('Error sending dispense notification (non-blocking):', notifyError);
      }

      const quantity = parseInt(updatedOrder.quantity) || 1;

      // Add medication cost to patient invoice AND deduct from inventory using FEFO
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get medication from inventory - prefer inventory_id FK, fallback to name match
        let inventoryResult;
        if (updatedOrder.inventory_id) {
          inventoryResult = await client.query(
            `SELECT id, selling_price, quantity_on_hand FROM pharmacy_inventory
             WHERE id = $1`,
            [updatedOrder.inventory_id]
          );
        } else {
          // Fallback: try matching by name (for legacy orders without inventory_id)
          inventoryResult = await client.query(
            `SELECT id, selling_price, quantity_on_hand FROM pharmacy_inventory
             WHERE medication_name ILIKE $1 AND is_active = true LIMIT 1`,
            [updatedOrder.medication_name]
          );
        }

        if (inventoryResult.rows.length > 0) {
          const inventoryItem = inventoryResult.rows[0];
          const unitPrice = parseFloat(inventoryItem.selling_price);
          const totalPrice = unitPrice * quantity;

          // Use FEFO (First Expired, First Out) to dispense from batches
          const dispenseResult = await dispenseFromBatches(
            client,
            inventoryItem.id,
            quantity,
            authReq.user?.id
          );

          // Record inventory transaction for the dispense
          const batchInfo = dispenseResult.dispensedBatches
            .map(b => `${b.batch_number}(${b.quantity_dispensed})`)
            .join(', ');

          await client.query(
            `INSERT INTO inventory_transactions
              (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
             VALUES ($1, 'dispense', $2, 'pharmacy_order', $3, $4, $5)`,
            [
              inventoryItem.id,
              -quantity,
              parseInt(id),
              `Dispensed for ${updatedOrder.patient_name || 'patient'}. Price: ${unitPrice}. Batches: ${batchInfo}`,
              authReq.user?.id
            ]
          );

          // Get or create invoice for the encounter
          const invoiceResult = await client.query(
            `SELECT id FROM invoices WHERE encounter_id = $1 LIMIT 1`,
            [updatedOrder.encounter_id]
          );

          if (invoiceResult.rows.length > 0) {
            const invoiceId = invoiceResult.rows[0].id;

            // Add medication as invoice item (use substitute name if provided)
            const medDescription = updatedOrder.substitute_medication
              ? `${updatedOrder.substitute_medication} (${updatedOrder.dosage}) [sub for: ${updatedOrder.medication_name}]`
              : `${updatedOrder.medication_name} (${updatedOrder.dosage})`;
            await client.query(
              `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category)
               VALUES ($1, $2, $3, $4, $5, 'medication')`,
              [invoiceId, medDescription, quantity, unitPrice, totalPrice]
            );

            // Update invoice total
            await client.query(
              `UPDATE invoices SET
                total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM invoice_items WHERE invoice_id = $1),
                updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [invoiceId]
            );
          }

          // Insert into medications table so it appears in patient's Active Medications
          const daysSupply = parseInt(updatedOrder.days_supply) || 0;
          const endDate = daysSupply > 0 ? new Date(Date.now() + daysSupply * 86400000).toISOString().split('T')[0] : null;
          await client.query(
            `INSERT INTO medications (patient_id, medication_name, dosage, frequency, route, start_date, end_date, prescribing_doctor, status, notes)
             VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, 'active', $8)`,
            [
              updatedOrder.patient_id,
              updatedOrder.substitute_medication || updatedOrder.medication_name,
              updatedOrder.dosage,
              updatedOrder.frequency,
              updatedOrder.route,
              endDate,
              updatedOrder.ordering_provider,
              `Pharmacy order #${id}. Qty: ${quantity}${updatedOrder.refills ? `. Refills: ${updatedOrder.refills}` : ''}`
            ]
          );

          await client.query('COMMIT');
        } else {
          // Medication not in inventory — still create active medication and commit
          console.warn(`Medication not found in inventory: ${updatedOrder.medication_name}`);

          // Still insert into medications table so it appears in Active Medications
          const daysSupplyNoInv = parseInt(updatedOrder.days_supply) || 0;
          const endDateNoInv = daysSupplyNoInv > 0 ? new Date(Date.now() + daysSupplyNoInv * 86400000).toISOString().split('T')[0] : null;
          await client.query(
            `INSERT INTO medications (patient_id, medication_name, dosage, frequency, route, start_date, end_date, prescribing_doctor, status, notes)
             VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, 'active', $8)`,
            [
              updatedOrder.patient_id,
              updatedOrder.substitute_medication || updatedOrder.medication_name,
              updatedOrder.dosage,
              updatedOrder.frequency,
              updatedOrder.route,
              endDateNoInv,
              updatedOrder.ordering_provider,
              `Pharmacy order #${id}. Qty: ${quantity} (not linked to inventory)`
            ]
          );

          await client.query('COMMIT');
        }
      } catch (invoiceError) {
        await client.query('ROLLBACK');
        console.error('Error processing dispense (invoice/inventory):', invoiceError);
        // Don't fail the dispense if invoice/inventory update fails, but log it
      } finally {
        client.release();
      }

      // Check if all pharmacy orders for this encounter are complete
      try {
        const pendingOrders = await pool.query(
          `SELECT COUNT(*) FROM pharmacy_orders
           WHERE encounter_id = $1 AND status NOT IN ('dispensed', 'cancelled')`,
          [updatedOrder.encounter_id]
        );

        // If no more pending pharmacy orders, auto-route patient back to nurse
        if (parseInt(pendingOrders.rows[0].count) === 0) {
          await notificationService.autoRouteToNurse(updatedOrder.encounter_id, 'pharmacy');

          // Check if ALL orders (lab, imaging, pharmacy) are complete for discharge
          await notificationService.notifyReadyForDischarge(updatedOrder.encounter_id);
        }
      } catch (routeError) {
        console.error('Error auto-routing after dispense (non-blocking):', routeError);
      }
    }

    res.json({
      message: 'Pharmacy order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Update pharmacy order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Process a drug return — restores inventory and adjusts invoice
export const processReturn = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const id = req.params.id as string;
    const { return_quantity, return_reason } = req.body;
    const authReq = req as any;
    const userId = authReq.user?.id;

    await client.query('BEGIN');

    const original = await client.query('SELECT * FROM pharmacy_orders WHERE id = $1', [id]);
    if (original.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    const order = original.rows[0];

    if (order.status !== 'dispensed') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Only dispensed orders can be returned' });
      return;
    }

    const qty = parseInt(return_quantity);
    const originalQty = parseInt(order.quantity);
    if (!qty || qty <= 0 || qty > originalQty) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `Return quantity must be between 1 and ${originalQty}` });
      return;
    }

    // Full return → 'returned', partial return → stays 'dispensed'
    const newStatus = qty === originalQty ? 'returned' : 'dispensed';

    await client.query(
      `UPDATE pharmacy_orders SET status = $2, return_quantity = COALESCE(return_quantity, 0) + $3,
       return_reason = $4, returned_at = CURRENT_TIMESTAMP, returned_by = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, newStatus, qty, return_reason, userId]
    );

    // Restore inventory
    if (order.inventory_id) {
      await client.query(
        `UPDATE pharmacy_inventory SET quantity_on_hand = quantity_on_hand + $2 WHERE id = $1`,
        [order.inventory_id, qty]
      );

      await client.query(
        `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
         VALUES ($1, 'return', $2, 'pharmacy_order', $3, $4, $5)`,
        [order.inventory_id, qty, parseInt(id), `Return: ${return_reason}`, userId]
      );
    }

    // Adjust invoice if possible
    try {
      const invoiceResult = await client.query(
        `SELECT id FROM invoices WHERE encounter_id = $1 LIMIT 1`,
        [order.encounter_id]
      );
      if (invoiceResult.rows.length > 0) {
        const invoiceId = invoiceResult.rows[0].id;
        const unitPrice = order.inventory_id
          ? (await client.query('SELECT selling_price FROM pharmacy_inventory WHERE id = $1', [order.inventory_id])).rows[0]?.selling_price || 0
          : 0;
        const refundAmount = parseFloat(unitPrice) * qty;

        if (refundAmount > 0) {
          await client.query(
            `UPDATE invoices SET subtotal = GREATEST(0, subtotal - $2),
             total_amount = GREATEST(0, total_amount - $2), updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [invoiceId, refundAmount]
          );
        }
      }
    } catch (invoiceError) {
      console.error('Error adjusting invoice for return:', invoiceError);
    }

    await client.query('COMMIT');

    await auditService.log({
      userId,
      action: 'update' as const,
      entityType: 'pharmacy_order',
      entityId: parseInt(id),
      details: { action: 'return', return_quantity: qty, return_reason }
    });

    res.json({ message: 'Return processed successfully', return_quantity: qty, new_status: newStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Process return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Process a refill - creates a new order from an existing prescription and decrements refills
export const processRefill = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const id = req.params.id as string; // Original order ID
    const authReq = req as any;
    const userId = authReq.user?.id;

    await client.query('BEGIN');

    // Get the original order
    const originalResult = await client.query(
      `SELECT * FROM pharmacy_orders WHERE id = $1`,
      [id]
    );

    if (originalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Original prescription not found' });
      return;
    }

    const original = originalResult.rows[0];

    // Check if refills are available
    if (original.refills <= 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'No refills remaining for this prescription' });
      return;
    }

    // Create a new order as the refill (copies the prescription)
    const newOrderResult = await client.query(
      `INSERT INTO pharmacy_orders (
        patient_id, encounter_id, ordering_provider, medication_name,
        dosage, frequency, route, quantity, refills, days_supply, priority,
        status, parent_order_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        original.patient_id,
        original.encounter_id,
        original.ordering_provider,
        original.medication_name,
        original.dosage,
        original.frequency,
        original.route,
        original.quantity,
        0, // Refill order has no refills of its own
        original.days_supply,
        'routine', // Refills are typically routine priority
        'ordered',
        parseInt(id), // Link to parent order
        `Refill of prescription #${id}`,
      ]
    );

    // Decrement refills on the original order
    await client.query(
      `UPDATE pharmacy_orders
       SET refills = refills - 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    const newOrder = newOrderResult.rows[0];

    // Get patient info for the response
    const patientInfo = await pool.query(
      `SELECT u.first_name, u.last_name, p.patient_number
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [original.patient_id]
    );

    // Audit log
    await auditService.log({
      userId,
      action: 'create',
      entityType: 'pharmacy_order_refill',
      entityId: newOrder.id,
      details: {
        parent_order_id: parseInt(id),
        medication: original.medication_name,
        refills_remaining: original.refills - 1,
      }
    });

    // Notify pharmacists when a pharmacy tech processes a refill
    if (authReq.user?.role === 'pharmacy_tech') {
      const patientName = patientInfo.rows[0]
        ? `${patientInfo.rows[0].first_name} ${patientInfo.rows[0].last_name}`
        : 'Unknown';
      await notificationService.notifyPharmacistOfTechAction(
        userId,
        'Refill Processed',
        `Processed refill for ${original.medication_name} — Patient: ${patientName} (${original.refills - 1} refills remaining)`,
        'pharmacy_order',
        newOrder.id
      );
    }

    res.json({
      message: 'Refill processed successfully',
      new_order: {
        ...newOrder,
        patient_name: patientInfo.rows[0] ?
          `${patientInfo.rows[0].first_name} ${patientInfo.rows[0].last_name}` : null,
        patient_number: patientInfo.rows[0]?.patient_number,
      },
      original_order_id: parseInt(id),
      refills_remaining: original.refills - 1,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Process refill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Get all orders for an encounter
export const getAllEncounterOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const [labOrders, imagingOrders, pharmacyOrders] = await Promise.all([
      pool.query(
        `SELECT lo.id,
          lo.patient_id,
          lo.encounter_id,
          lo.ordering_provider,
          lo.test_name,
          lo.test_code,
          lo.priority,
          lo.notes,
          lo.ordered_date,
          lo.ordered_date as ordered_at,
          lo.collected_date as specimen_collected_at,
          lo.result_date as results_available_at,
          lo.result_date as completed_at,
          lo.result as results,
          lo.created_at,
          lo.updated_at,
          CASE
            WHEN lo.status = 'ordered' THEN 'pending'
            WHEN lo.status = 'collected' THEN 'pending'
            WHEN lo.status = 'in-progress' THEN 'in_progress'
            ELSE lo.status
          END as status,
          u.first_name || ' ' || u.last_name as ordering_provider_name
         FROM lab_orders lo
         LEFT JOIN users u ON lo.ordering_provider = u.id
         WHERE lo.encounter_id = $1
         ORDER BY lo.ordered_date DESC`,
        [encounter_id]
      ),
      pool.query(
        // Alias imaging columns to match lab_orders' shape (ordered_at,
        // completed_at, results) so the frontend can treat both order
        // types uniformly. Without these aliases the imaging results tab
        // would show "Invalid Date" and never render findings.
        `SELECT io.id,
           io.patient_id,
           io.encounter_id,
           io.ordering_provider,
           io.imaging_type,
           io.body_part,
           io.priority,
           io.status,
           io.notes,
           io.clinical_indication,
           io.ordered_date,
           io.ordered_date as ordered_at,
           io.scheduled_date,
           io.completed_date,
           io.completed_date as completed_at,
           io.findings,
           io.findings as results,
           io.created_at,
           io.updated_at,
           u.first_name || ' ' || u.last_name as ordering_provider_name
         FROM imaging_orders io
         LEFT JOIN users u ON io.ordering_provider = u.id
         WHERE io.encounter_id = $1
         ORDER BY io.ordered_date DESC`,
        [encounter_id]
      ),
      pool.query(
        `SELECT po.*, u.first_name || ' ' || u.last_name as ordering_provider_name
         FROM pharmacy_orders po
         LEFT JOIN users u ON po.ordering_provider = u.id
         WHERE po.encounter_id = $1
         ORDER BY po.ordered_date DESC`,
        [encounter_id]
      ),
    ]);

    res.json({
      lab_orders: labOrders.rows,
      imaging_orders: imagingOrders.rows,
      pharmacy_orders: pharmacyOrders.rows,
    });
  } catch (error) {
    console.error('Get all encounter orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get doctor alerts - recently completed results for the doctor's orders
export const getDoctorAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const doctorId = authReq.user?.id;

    // Lab results completed in the last 7 days for this doctor's orders.
    // Patient name lives on the users table (patients.user_id), and room info
    // comes from the rooms table via encounters.room_id.
    const labAlerts = await pool.query(
      `SELECT lo.id, lo.patient_id, lo.encounter_id, lo.test_name, lo.test_code,
              lo.priority, lo.status, lo.ordered_date, lo.result_date, lo.result,
              lo.result_document_id, lo.path_no,
              pd.document_name AS result_document_name,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number,
              r.room_number
         FROM lab_orders lo
         LEFT JOIN patients p ON lo.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN encounters e ON lo.encounter_id = e.id
         LEFT JOIN rooms r ON e.room_id = r.id
         LEFT JOIN patient_documents pd ON lo.result_document_id = pd.id
        WHERE lo.ordering_provider = $1
          AND lo.status = 'completed'
          AND lo.verification_status IN ('verified', 'not_required')
          AND lo.result_date >= NOW() - INTERVAL '7 days'
          AND lo.doctor_reviewed_at IS NULL
        ORDER BY lo.result_date DESC
        LIMIT 20`,
      [doctorId]
    );

    // Imaging results completed in the last 7 days for this doctor's orders.
    const imagingAlerts = await pool.query(
      `SELECT io.id, io.patient_id, io.encounter_id, io.imaging_type, io.body_part,
              io.priority, io.status, io.ordered_date, io.completed_date, io.findings,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number,
              r.room_number
         FROM imaging_orders io
         LEFT JOIN patients p ON io.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN encounters e ON io.encounter_id = e.id
         LEFT JOIN rooms r ON e.room_id = r.id
        WHERE io.ordering_provider = $1
          AND io.status = 'completed'
          AND io.completed_date >= NOW() - INTERVAL '7 days'
        ORDER BY io.completed_date DESC
        LIMIT 20`,
      [doctorId]
    );

    // Pharmacy orders that are ready / dispensed in the last 7 days.
    const pharmacyAlerts = await pool.query(
      `SELECT po.id, po.patient_id, po.encounter_id, po.medication_name, po.dosage,
              po.frequency, po.status, po.ordered_date, po.dispensed_date, po.updated_at,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number,
              r.room_number
         FROM pharmacy_orders po
         LEFT JOIN patients p ON po.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN encounters e ON po.encounter_id = e.id
         LEFT JOIN rooms r ON e.room_id = r.id
        WHERE po.ordering_provider = $1
          AND po.status IN ('ready', 'dispensed')
          AND po.updated_at >= NOW() - INTERVAL '7 days'
        ORDER BY po.updated_at DESC
        LIMIT 20`,
      [doctorId]
    );

    res.json({
      lab_alerts: labAlerts.rows,
      imaging_alerts: imagingAlerts.rows,
      pharmacy_alerts: pharmacyAlerts.rows,
      total_alerts:
        labAlerts.rows.length + imagingAlerts.rows.length + pharmacyAlerts.rows.length,
    });
  } catch (error) {
    console.error('Get doctor alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Doctor reviews/signs off a lab result so it disappears from alerts
export const doctorReviewLabResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const doctorId = authReq.user?.id;
    const labOrderId = parseInt(req.params.id as string, 10);

    if (isNaN(labOrderId)) {
      res.status(400).json({ error: 'Invalid lab order ID' });
      return;
    }

    const result = await pool.query(
      `UPDATE lab_orders
         SET doctor_reviewed_by = $1,
             doctor_reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND ordering_provider = $1
         AND status = 'completed'
       RETURNING id`,
      [doctorId, labOrderId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found or not yours to review' });
      return;
    }

    res.json({ message: 'Lab result reviewed successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Doctor review lab result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get delinquent items: unsigned notes + pending orders for the doctor
export const getDoctorDelinquent = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const doctorId = authReq.user?.id;

    // Unsigned encounters (SOAP not signed) from the last 30 days
    const unsignedNotes = await pool.query(
      `SELECT e.id, e.encounter_number, e.patient_id, e.encounter_date,
              e.chief_complaint, e.status,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number
         FROM encounters e
         LEFT JOIN patients p ON e.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
        WHERE e.provider_id = $1
          AND e.soap_signed = false
          AND e.status IN ('completed', 'discharged', 'with_doctor', 'ready_for_doctor')
          AND e.encounter_date >= NOW() - INTERVAL '30 days'
        ORDER BY e.encounter_date DESC
        LIMIT 30`,
      [doctorId]
    );

    // Pending lab orders (not yet completed)
    const pendingLabs = await pool.query(
      `SELECT lo.id, lo.patient_id, lo.encounter_id, lo.test_name,
              lo.status, lo.priority, lo.ordered_date,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number
         FROM lab_orders lo
         LEFT JOIN patients p ON lo.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
        WHERE lo.ordering_provider = $1
          AND lo.status IN ('ordered', 'collected', 'in-progress')
          AND lo.ordered_date >= NOW() - INTERVAL '14 days'
        ORDER BY lo.ordered_date DESC
        LIMIT 20`,
      [doctorId]
    );

    // Pending imaging orders
    const pendingImaging = await pool.query(
      `SELECT io.id, io.patient_id, io.encounter_id, io.imaging_type,
              io.body_part, io.status, io.priority, io.ordered_date,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number
         FROM imaging_orders io
         LEFT JOIN patients p ON io.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
        WHERE io.ordering_provider = $1
          AND io.status IN ('ordered', 'in-progress')
          AND io.ordered_date >= NOW() - INTERVAL '14 days'
        ORDER BY io.ordered_date DESC
        LIMIT 20`,
      [doctorId]
    );

    // Pending pharmacy orders (not yet dispensed)
    const pendingRx = await pool.query(
      `SELECT po.id, po.patient_id, po.encounter_id, po.medication_name,
              po.status, po.priority, po.ordered_date,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number
         FROM pharmacy_orders po
         LEFT JOIN patients p ON po.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
        WHERE po.ordering_provider = $1
          AND po.status IN ('ordered', 'approved')
          AND po.ordered_date >= NOW() - INTERVAL '14 days'
        ORDER BY po.ordered_date DESC
        LIMIT 20`,
      [doctorId]
    );

    res.json({
      unsigned_notes: unsignedNotes.rows,
      pending_labs: pendingLabs.rows,
      pending_imaging: pendingImaging.rows,
      pending_rx: pendingRx.rows,
    });
  } catch (error) {
    console.error('Get doctor delinquent error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get critical result alerts
export const getCriticalResultAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { unacknowledged_only, doctor_id } = req.query;
    const authReq = req as any;

    let query = `
      SELECT
        cra.*,
        lo.test_name,
        lo.test_code,
        lo.priority,
        lo.result as result_text,
        lo.patient_id,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        p.patient_number,
        u_provider.first_name || ' ' || u_provider.last_name as ordering_provider_name,
        u_ack.first_name || ' ' || u_ack.last_name as acknowledged_by_name,
        e.encounter_number,
        e.room_number
      FROM critical_result_alerts cra
      JOIN lab_orders lo ON cra.lab_order_id = lo.id
      JOIN patients p ON lo.patient_id = p.id
      JOIN users u_patient ON p.user_id = u_patient.id
      JOIN users u_provider ON cra.ordering_provider_id = u_provider.id
      LEFT JOIN users u_ack ON cra.acknowledged_by = u_ack.id
      LEFT JOIN encounters e ON lo.encounter_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (unacknowledged_only === 'true') {
      query += ` AND cra.is_acknowledged = false`;
    }

    if (doctor_id) {
      query += ` AND cra.ordering_provider_id = $${paramIndex}`;
      params.push(doctor_id);
      paramIndex++;
    }

    query += ` ORDER BY cra.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      alerts: result.rows,
      total: result.rows.length,
      unacknowledged: result.rows.filter((a: any) => !a.is_acknowledged).length
    });
  } catch (error) {
    console.error('Get critical result alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Acknowledge a critical result alert
export const acknowledgeCriticalResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const authReq = req as any;
    const userId = authReq.user?.id;

    const result = await pool.query(
      `UPDATE critical_result_alerts SET
        is_acknowledged = true,
        acknowledged_by = $1,
        acknowledged_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [userId, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Critical alert not found' });
      return;
    }

    res.json({
      message: 'Critical result acknowledged successfully',
      alert: result.rows[0]
    });
  } catch (error) {
    console.error('Acknowledge critical result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a critical result alert (called when lab enters critical result)
export const createCriticalResultAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { lab_order_id, alert_type, result_value } = req.body;

    // Get the ordering provider from the lab order
    const orderResult = await pool.query(
      `SELECT ordering_provider FROM lab_orders WHERE id = $1`,
      [lab_order_id]
    );

    if (orderResult.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }

    const ordering_provider_id = orderResult.rows[0].ordering_provider;

    const result = await pool.query(
      `INSERT INTO critical_result_alerts
       (lab_order_id, ordering_provider_id, alert_type, result_value)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [lab_order_id, ordering_provider_id, alert_type, result_value]
    );

    res.status(201).json({
      message: 'Critical result alert created successfully',
      alert: result.rows[0]
    });
  } catch (error) {
    console.error('Create critical result alert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Dispense medications for walk-in patient (OTC)
export const dispenseWalkInOrder = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const authReq = req as any;
    const dispensed_by = authReq.user?.id;

    const { patient_id, encounter_id, routing_id, medications } = req.body;

    // Parse medications if it's a string (from FormData)
    const medicationList = typeof medications === 'string' ? JSON.parse(medications) : medications;

    if (!patient_id || !encounter_id || !routing_id) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!medicationList || medicationList.length === 0) {
      res.status(400).json({ error: 'No medications provided' });
      return;
    }

    await client.query('BEGIN');

    const createdOrders: any[] = [];
    let totalAmount = 0;

    // Process each medication
    for (const med of medicationList) {
      // Verify stock availability
      const stockCheck = await client.query(
        `SELECT id, medication_name, quantity_on_hand, selling_price
         FROM pharmacy_inventory WHERE id = $1`,
        [med.inventory_id]
      );

      if (stockCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `Medication not found: ${med.medication_name}` });
        return;
      }

      const inventoryItem = stockCheck.rows[0];
      if (inventoryItem.quantity_on_hand < med.quantity) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Insufficient stock for ${inventoryItem.medication_name}. Available: ${inventoryItem.quantity_on_hand}`
        });
        return;
      }

      // Create pharmacy order for this medication (already dispensed)
      const orderResult = await client.query(
        `INSERT INTO pharmacy_orders (
          patient_id, encounter_id, ordering_provider, medication_name,
          dosage, frequency, route, quantity, refills, days_supply, priority, notes, status, dispensed_by, dispensed_date
        ) VALUES ($1, $2, $3, $4, $5, $6, 'oral', $7, $8, $9, 'routine', $10, 'dispensed', $11, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          patient_id,
          encounter_id,
          dispensed_by, // Pharmacist is the ordering provider for OTC
          inventoryItem.medication_name,
          med.dosage || '',
          med.frequency || '',
          med.quantity,
          med.refills || 0,
          med.duration_days || null,
          [med.duration_days ? `${med.duration_days} days` : '', med.instructions].filter(Boolean).join(' - ') || 'OTC Walk-in',
          dispensed_by
        ]
      );

      createdOrders.push(orderResult.rows[0]);

      // Dispense from batches (FEFO)
      await dispenseFromBatches(client, med.inventory_id, med.quantity, dispensed_by);

      // Calculate amount
      const itemTotal = (med.unit_price || inventoryItem.selling_price) * med.quantity;
      totalAmount += itemTotal;
    }

    // Get or create invoice for this encounter
    let invoiceId: number;
    const invoiceCheck = await client.query(
      `SELECT id FROM invoices WHERE encounter_id = $1`,
      [encounter_id]
    );

    if (invoiceCheck.rows.length === 0) {
      // Create invoice for OTC purchase
      const invoiceResult = await client.query(
        `INSERT INTO invoices (encounter_id, patient_id, subtotal, total_amount, status)
         VALUES ($1, $2, 0, 0, 'pending')
         RETURNING id`,
        [encounter_id, patient_id]
      );
      invoiceId = invoiceResult.rows[0].id;
    } else {
      invoiceId = invoiceCheck.rows[0].id;
    }

    // Add each medication as an invoice line item
    for (const order of createdOrders) {
      // Match the original medication entry back to this order by name.
      // (Previously the || m.inventory_id always evaluated true, so every
      // line item got the first medication's price.)
      const med = medicationList.find((m: any) => m.medication_name === order.medication_name);
      const unitPrice = med?.unit_price || 0;
      const quantity = order.quantity;
      const itemTotal = unitPrice * quantity;

      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category)
         VALUES ($1, $2, $3, $4, $5, 'medication')`,
        [invoiceId, `${order.medication_name}${order.dosage ? ` (${order.dosage})` : ''}`, quantity, unitPrice, itemTotal]
      );
    }

    // Update invoice totals
    await client.query(
      `UPDATE invoices SET
        subtotal = (SELECT COALESCE(SUM(total_price), 0) FROM invoice_items WHERE invoice_id = $1),
        total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM invoice_items WHERE invoice_id = $1),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [invoiceId]
    );

    // Update pharmacy routing status to completed
    await client.query(
      `UPDATE department_routing
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [routing_id]
    );

    // Route patient to receptionist for checkout
    await client.query(
      `INSERT INTO department_routing (encounter_id, patient_id, department, priority, notes, routed_by, status)
       VALUES ($1, $2, 'receptionist', 'routine', 'Ready for checkout - OTC purchase complete', $3, 'pending')`,
      [encounter_id, patient_id, dispensed_by]
    );

    // Get patient info for notification
    const patientInfo = await client.query(
      `SELECT u.first_name || ' ' || u.last_name as patient_name, p.patient_number
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [patient_id]
    );

    // Send notification to receptionist
    if (patientInfo.rows.length > 0) {
      const { patient_name, patient_number } = patientInfo.rows[0];
      await notificationService.notifyReadyForCheckout(patient_name, patient_number, encounter_id);
    }

    // Audit log
    await auditService.log({
      userId: dispensed_by,
      action: 'dispense',
      entityType: 'pharmacy_order',
      entityId: createdOrders[0]?.id,
      details: {
        type: 'walk_in',
        patient_id,
        encounter_id,
        medications: medicationList.map((m: any) => ({ name: m.medication_name, qty: m.quantity })),
        total_amount: totalAmount
      }
    });

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Walk-in order completed successfully',
      orders: createdOrders,
      total_amount: totalAmount,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Dispense walk-in order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};
