import { Request, Response } from 'express';
import pool from '../database/db';
import notificationService from '../services/notificationService';
import auditService from '../services/auditService';
import drugInteractionService from '../services/drugInteractionService';
import { aiService } from '../services/aiService';
import { dispenseFromBatches } from './inventoryController';
import { buildSafeUpdateClause } from '../utils/sqlSecurity';
import { resolveEncounterInvoiceId, getOrCreateEncounterInvoice } from '../services/invoiceResolver';

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
      // Normalise whitespace/case so "bue & cr", "bue  & cr" and "BUE & Cr" all
      // collide — a plain LOWER()-equality missed these and let near-identical
      // duplicates through (lab reported two "bue & cr" orders for one patient).
      const dupCheck = await pool.query(
        `SELECT id FROM lab_orders
         WHERE encounter_id = $1
           AND (
             LOWER(TRIM(REGEXP_REPLACE(test_name, '\\s+', ' ', 'g')))
               = LOWER(TRIM(REGEXP_REPLACE($2, '\\s+', ' ', 'g')))
             OR ($3::text IS NOT NULL AND test_code IS NOT NULL AND LOWER(test_code) = LOWER($3::text))
           )
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

    // Capture the catalog test_code so billing is exact (no fuzzy match).
    // Use the code the UI sent; else adopt a high-confidence (exact-name) catalog
    // match. Lower-confidence free-text is resolved via AI in resolveLabTestCode.
    let resolvedCode: string | null = test_code || null;
    if (!resolvedCode && test_name) {
      resolvedCode = await resolveLabTestCode(test_name);
    }

    const result = await pool.query(
      `INSERT INTO lab_orders (
        patient_id, encounter_id, ordering_provider, entered_by, test_name, test_code, priority, notes, path_no, scheduled_for
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [patient_id, encounter_id, orderingProvider, enteredBy, test_name, resolvedCode, priority || 'routine', notes, pathNo, scheduledFor]
    );

    const order = result.rows[0];

    // For walk-in/OTC patients (ordered by lab tech), bill immediately at order
    // creation so the patient can pay and leave without waiting for results.
    // For doctor/nurse-ordered tests, billing still happens on completion.
    if (currentUserRole === 'lab') {
      try {
        const invoiceId = await resolveEncounterInvoiceId(encounter_id, pool);
        if (invoiceId) {
          // Price from the lab catalog (single source of truth), by code then name.
          const labItem = await resolveLabCatalogItem(resolvedCode, test_name);
          if (labItem.match) {
            const price = Number(labItem.match.base_price);
            // A matched-but-unpriced (base_price 0) test must still be flagged so
            // it isn't billed silently free at the walk-in counter.
            const desc = price > 0 ? `Lab: ${labItem.match.test_name}` : `Lab: ${labItem.match.test_name} [PRICE PENDING]`;
            const exists = await pool.query('SELECT id FROM invoice_items WHERE invoice_id = $1 AND description = $2', [invoiceId, desc]);
            if (exists.rows.length === 0) {
              await pool.query(
                'INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category, reference_type, reference_id) VALUES ($1, NULL, $2, 1, $3, $3, $4, $5, $6)',
                [invoiceId, desc, price, 'lab', 'lab_order', order.id]
              );
              const itemsTotal = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
              await pool.query('UPDATE invoices SET subtotal = $1, total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [parseFloat(itemsTotal.rows[0].total), invoiceId]);
            }
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
// Resolve a typed lab test (and optional code) to a lab_test_catalog row.
// Priority: exact test_code > exact (case-insensitive) name > fuzzy keyword.
// Single source of truth for lab pricing — charge_master is no longer used.
export async function resolveLabCatalogItem(
  testCode: string | null | undefined,
  testName: string | null | undefined
): Promise<{ match: any | null; matchType: 'code' | 'name' | 'fuzzy' | 'none' }> {
  const name = (testName || '').trim();
  const keywords = name.split(/\s+/).filter((w) => w.length > 2).slice(0, 3).map((k) => k.replace(/s$/i, ''));
  const keywordPattern = keywords.length > 0 ? keywords.map((k) => `(?=.*${k})`).join('') : name;
  try {
    const r = await pool.query(
      `SELECT id, test_code, test_name, base_price,
         CASE WHEN test_code = $1 THEN 'code'
              WHEN test_name ILIKE $2 THEN 'name'
              ELSE 'fuzzy' END AS match_type
       FROM lab_test_catalog
       WHERE is_active = true
         AND ( test_code = $1 OR test_name ILIKE $2 OR test_name ILIKE $3 OR $2 ILIKE '%' || test_name || '%' OR test_name ~* $4 )
       ORDER BY CASE WHEN test_code = $1 THEN 1 WHEN test_name ILIKE $2 THEN 2 ELSE 3 END
       LIMIT 1`,
      [testCode || '', name, `%${name}%`, keywordPattern]
    );
    const row = r.rows[0];
    if (!row) return { match: null, matchType: 'none' };
    return { match: row, matchType: row.match_type };
  } catch {
    return { match: null, matchType: 'none' };
  }
}

// Resolve a free-typed lab test name to a catalog test_code at order time, so
// billing is exact. Exact code/name match wins; otherwise an AI pass picks the
// best catalog code (effortless for doctors). Returns null if nothing confident
// — billing then falls back to fuzzy + flags for review.
async function resolveLabTestCode(testName: string): Promise<string | null> {
  const exact = await resolveLabCatalogItem(null, testName);
  if (exact.match && (exact.matchType === 'code' || exact.matchType === 'name')) {
    return exact.match.test_code;
  }
  try {
    if (aiService.isAvailable && aiService.isAvailable()) {
      const candidates = (await pool.query(
        'SELECT test_code, test_name FROM lab_test_catalog WHERE is_active = true'
      )).rows;
      return await aiService.mapTestNameToCatalog(testName, candidates);
    }
  } catch (e) {
    console.error('resolveLabTestCode AI mapping failed (non-fatal):', e);
  }
  return null;
}

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

  // 2. Billing — lab_test_catalog is the single source of truth; bill by code.
  try {
    const labItem = await resolveLabCatalogItem(order.test_code, order.test_name);
    const chargeDescription = labItem.match ? labItem.match.test_name : (order.test_name || 'Lab test');
    const labPrice = labItem.match ? Number(labItem.match.base_price) : 0;
    // Flag the line [PRICE PENDING] whenever it would bill at 0 — whether from no
    // catalog match OR a matched row whose base_price is still 0/unset. Either way
    // it must be VISIBLE for reception to price manually, never a silent free lab.
    const unpriced = !(labPrice > 0);
    const lineDescription = unpriced
      ? `Lab: ${chargeDescription} [PRICE PENDING]`
      : `Lab: ${chargeDescription}`;

    if (labItem.matchType === 'fuzzy') {
      console.warn(`⚠️ Lab billing: fuzzy-matched "${order.test_name}" → "${chargeDescription}" (code ${labItem.match?.test_code}). Review — order had no test_code.`);
    } else if (labItem.matchType === 'none') {
      console.warn(`⚠️ Lab billing: NO catalog match for "${order.test_name}" (code ${order.test_code}). Billed 0 — needs review.`);
    } else if (unpriced) {
      console.warn(`⚠️ Lab billing: catalog test "${chargeDescription}" (code ${labItem.match?.test_code}) has base_price 0 — billed 0 [PRICE PENDING], set its price.`);
    }

    const invoiceId = await resolveEncounterInvoiceId(order.encounter_id, pool);

    if (invoiceId) {
      // Dedup by the canonical catalog name so the same test can't be billed
      // twice under different spellings.
      const existingItem = await pool.query(
        `SELECT id FROM invoice_items WHERE invoice_id = $1 AND description = $2`,
        [invoiceId, lineDescription]
      );

      if (existingItem.rows.length === 0) {
        await pool.query(
          `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category, reference_type, reference_id)
           VALUES ($1, NULL, $2, 1, $3, $3, 'lab', 'lab_order', $4)`,
          [invoiceId, lineDescription, labPrice, orderId]
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
// Shared helper: add an imaging study as a line item on the encounter's invoice.
// Idempotent — guarded against double-billing by description, so it can safely run
// both when a provider orders the study (bill immediately) and again on completion.
// Returns silently if there's no invoice for the encounter yet (completion path will bill later).
const billImagingOrderToInvoice = async (order: any): Promise<void> => {
  try {
    const invoiceId = await resolveEncounterInvoiceId(order.encounter_id, pool);
    if (!invoiceId) return;

    const label = `${order.imaging_type}${order.body_part ? ' (' + order.body_part + ')' : ''}`;
    const description = `Imaging: ${label}`;

    // Guard against double-billing the same study on the same invoice
    const existingItem = await pool.query(
      'SELECT id FROM invoice_items WHERE invoice_id = $1 AND description = $2',
      [invoiceId, description]
    );
    if (existingItem.rows.length > 0) return;

    // Resolve the charge: prefer an exact service_name match, then a fuzzy type+body_part match
    let charge: { id: number; price: string } | null = null;
    const exact = await pool.query(
      "SELECT id, price FROM charge_master WHERE LOWER(service_name) = LOWER($1) AND category = 'imaging' AND is_active = true LIMIT 1",
      [order.imaging_type]
    );
    if (exact.rows.length > 0) {
      charge = exact.rows[0];
    } else {
      const fuzzy = await pool.query(
        `SELECT id, price FROM charge_master
         WHERE (service_name ILIKE $1 OR service_name ILIKE $2)
           AND category = 'imaging' AND is_active = true
         ORDER BY CASE WHEN service_name ILIKE $1 THEN 1 ELSE 2 END
         LIMIT 1`,
        [`%${order.imaging_type}%${order.body_part || ''}%`, `%${order.imaging_type}%`]
      );
      if (fuzzy.rows.length > 0) charge = fuzzy.rows[0];
    }

    let chargeMasterId: number | null = null;
    let billingPrice: number;
    if (charge) {
      chargeMasterId = charge.id;
      const { resolvePrice } = require('../services/priceResolutionService');
      const resolved = await resolvePrice(charge.id, invoiceId);
      billingPrice = resolved.isExcluded ? 0 : resolved.unitPrice;
    } else {
      // No catalog entry — fall back to standard imaging prices
      const fallbackPrices: Record<string, number> = {
        'X-Ray': 80.00,
        'CT Scan': 350.00,
        'MRI': 800.00,
        'Ultrasound': 150.00,
        'Mammogram': 200.00,
        'Fluoroscopy': 250.00,
      };
      billingPrice = fallbackPrices[order.imaging_type] || 150.00;
    }

    // Guard: an imaging study is billed at order time AND again on completion,
    // so dedup on the source order to avoid a duplicate line (this makes the
    // "no-op if already billed" behaviour real).
    const alreadyBilled = await pool.query(
      `SELECT id FROM invoice_items
        WHERE invoice_id = $1 AND reference_type = 'imaging_order' AND reference_id = $2
        LIMIT 1`,
      [invoiceId, order.id]
    );
    if (alreadyBilled.rows.length === 0) {
      await pool.query(
        `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category, reference_type, reference_id)
         VALUES ($1, $2, $3, 1, $4, $4, 'imaging', 'imaging_order', $5)`,
        [invoiceId, chargeMasterId, description, billingPrice, order.id]
      );
      await pool.query(
        `UPDATE invoices
         SET subtotal = subtotal + $2, total_amount = total_amount + $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invoiceId, billingPrice]
      );
    }
  } catch (err) {
    console.error('Imaging billing failed (non-fatal):', err);
  }
};

// Remove a previously-billed imaging study from the encounter's invoice (e.g. on cancellation).
const removeImagingOrderFromInvoice = async (order: any): Promise<void> => {
  try {
    const invoiceId = await resolveEncounterInvoiceId(order.encounter_id, pool);
    if (!invoiceId) return;

    const label = `${order.imaging_type}${order.body_part ? ' (' + order.body_part + ')' : ''}`;
    const description = `Imaging: ${label}`;

    const del = await pool.query(
      'DELETE FROM invoice_items WHERE invoice_id = $1 AND description = $2 RETURNING total_price',
      [invoiceId, description]
    );
    if (del.rows.length > 0) {
      const removed = del.rows.reduce((sum: number, r: any) => sum + parseFloat(r.total_price), 0);
      await pool.query(
        `UPDATE invoices
         SET subtotal = subtotal - $2, total_amount = total_amount - $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invoiceId, removed]
      );
    }
  } catch (err) {
    console.error('Imaging billing reversal failed (non-fatal):', err);
  }
};

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

    // Bill the study to the encounter's invoice as soon as it's ordered, so it
    // shows up for the cashier without waiting for the study to be completed.
    // Scheduled (future) orders are billed when performed, not at booking time.
    if (priority !== 'scheduled') {
      await billImagingOrderToInvoice(order);
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

    // Reverse billing if the order is cancelled (it was billed at order time)
    if (updateData.status === 'cancelled') {
      await removeImagingOrderFromInvoice(updatedOrder);
    }

    // When imaging order is completed: bill the study (no-op if already billed at
    // order time, via the dedup guard) and send notifications
    if (updateData.status === 'completed') {
      await billImagingOrderToInvoice(updatedOrder);

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
      is_long_term,
      priority,
      notes,
      inventory_id,
      allow_duplicate,
    } = req.body;

    // Guard against ACCIDENTAL duplicate orders (e.g. a double-click) — but allow
    // an intentional repeat when the prescriber explicitly confirms it. Some meds
    // are legitimately re-dosed within a single encounter (e.g. a second
    // salbutamol nebule in the sickbay). The doctor UI sends allow_duplicate=true
    // after showing the "already ordered — add it again?" confirmation.
    if (!allow_duplicate) {
      const dupCheck = await pool.query(
        `SELECT id FROM pharmacy_orders
         WHERE encounter_id = $1
           AND LOWER(medication_name) = LOWER($2)
           AND status != 'cancelled'
         LIMIT 1`,
        [encounter_id, medication_name]
      );
      if (dupCheck.rows.length > 0) {
        res.status(409).json({
          error: `${medication_name} has already been ordered for this encounter.`,
          code: 'DUPLICATE_MEDICATION',
        });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO pharmacy_orders (
        patient_id, encounter_id, ordering_provider, medication_name,
        dosage, frequency, route, quantity, refills, days_supply, is_long_term, priority, notes, inventory_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        is_long_term === true,
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
    const { patient_id, encounter_id, status, start_date, end_date, ordered_from, ordered_to } = req.query;

    let query = `
      SELECT po.*,
        u.first_name || ' ' || u.last_name as provider_name,
        e.encounter_number,
        e.chief_complaint,
        p.patient_number,
        p.allergies as patient_allergies,
        pu.first_name || ' ' || pu.last_name as patient_name,
        du.first_name || ' ' || du.last_name as dispensed_by_name,
        COALESCE(pi.quantity_on_hand, pim.quantity_on_hand) as inventory_quantity,
        COALESCE(pi.selling_price, pim.selling_price) as inventory_price,
        COALESCE(pi.medication_name, pim.medication_name) as inventory_medication_name,
        COALESCE(pi.unit, pim.unit) as inventory_unit,
        -- When the doctor typed free-text (no inventory_id), pim is a best-effort
        -- name match so the queue can still show stock/price instead of "Not in
        -- inventory". Surfaced separately so the pharmacist can one-click adopt it
        -- as a substitute (which sets the real inventory_id). Dispense logic is
        -- unchanged — it never auto-picks this fuzzy match.
        pim.id as suggested_inventory_id,
        (pi.id IS NULL AND pim.id IS NOT NULL) as inventory_name_matched,
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
      LEFT JOIN LATERAL (
        SELECT pi2.id, pi2.quantity_on_hand, pi2.selling_price, pi2.medication_name, pi2.unit
        FROM pharmacy_inventory pi2
        WHERE po.inventory_id IS NULL
          AND pi2.is_active = true
          AND (
            pi2.medication_name ILIKE '%' || po.medication_name || '%'
            OR pi2.generic_name ILIKE '%' || po.medication_name || '%'
            OR po.medication_name ILIKE '%' || pi2.medication_name || '%'
          )
          -- Strength guard: never adopt a DIFFERENT strength's stock/price (a
          -- 20mg order must not match the 40mg item). If both names carry a dose
          -- token they must be equal; if either lacks one, fall back to the name
          -- match above. Fixes "esomeprazole 20mg" showing the 40mg price when
          -- only the 40mg pack is stocked.
          AND (
            (regexp_match(lower(po.medication_name),  '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)')) IS NULL
            OR (regexp_match(lower(pi2.medication_name), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)')) IS NULL
            OR (regexp_match(lower(po.medication_name),  '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)'))
             = (regexp_match(lower(pi2.medication_name), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)'))
          )
          -- Ambiguity guard: if the order has NO strength but the stock carries
          -- the same drug in MULTIPLE strengths (e.g. free-text "esomeprazole"
          -- with 10/20/40mg on the shelf), don't silently guess the highest-stock
          -- one — that's exactly how "esomeprazole" surfaced the 40mg price.
          -- Suppress the suggestion so the queue reads "not in inventory" and the
          -- pharmacist explicitly picks the right strength.
          AND (
            (regexp_match(lower(po.medication_name), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)')) IS NOT NULL
            OR NOT EXISTS (
              SELECT 1 FROM pharmacy_inventory pi3
              WHERE pi3.is_active = true AND pi3.id <> pi2.id
                AND (
                  pi3.medication_name ILIKE '%' || po.medication_name || '%'
                  OR pi3.generic_name ILIKE '%' || po.medication_name || '%'
                  OR po.medication_name ILIKE '%' || pi3.medication_name || '%'
                )
                AND (regexp_match(lower(pi3.medication_name), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)'))
                    IS DISTINCT FROM
                    (regexp_match(lower(pi2.medication_name), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)'))
            )
          )
        ORDER BY
          CASE WHEN pi2.medication_name ILIKE po.medication_name THEN 0
               WHEN pi2.medication_name ILIKE po.medication_name || '%' THEN 1
               ELSE 2 END,
          pi2.quantity_on_hand DESC
        LIMIT 1
      ) pim ON true
      WHERE 1=1
        -- Manual refill reminders live in pharmacy_orders as status='dispensed'
        -- only to drive the refills calendar; they are not real orders/dispenses
        -- and must never surface in the pharmacy queues (incl. Dispensed).
        AND po.is_manual_reminder IS NOT TRUE
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

    // Filter by dispense date (inclusive, by calendar day). Drives the
    // "Dispensed Today" card and the Order History date range, both of which
    // previously passed these params but were silently ignored here.
    if (start_date) {
      query += ` AND po.dispensed_date::date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND po.dispensed_date::date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    // Filter by ORDER date (inclusive, by calendar day). Drives the pharmacy
    // queue's "today only" default + date-range search — pending orders have no
    // dispensed_date, so the dispensed-date filter above can't scope them.
    if (ordered_from) {
      query += ` AND po.ordered_date::date >= $${paramCount}`;
      params.push(ordered_from);
      paramCount++;
    }

    if (ordered_to) {
      query += ` AND po.ordered_date::date <= $${paramCount}`;
      params.push(ordered_to);
      paramCount++;
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

// Per-order activity timeline: who did what to a pharmacy order, and when.
// Merges audit_logs (status changes, edits, substitutions, returns) with
// inventory_transactions (the actual stock movements at dispense/return time)
// into one chronological feed so pharmacists can "view the action".
export const getPharmacyOrderActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }

    const [auditRes, txRes] = await Promise.all([
      pool.query(
        `SELECT al.id, al.action, al.new_values, al.old_values, al.created_at,
                u.first_name || ' ' || u.last_name AS user_name, u.role AS user_role
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.entity_type = 'pharmacy_order' AND al.entity_id = $1
         ORDER BY al.created_at ASC`,
        [id]
      ),
      pool.query(
        `SELECT it.id, it.transaction_type, it.quantity, it.notes, it.created_at,
                u.first_name || ' ' || u.last_name AS user_name, u.role AS user_role
         FROM inventory_transactions it
         LEFT JOIN users u ON it.performed_by = u.id
         WHERE it.reference_type = 'pharmacy_order' AND it.reference_id = $1
         ORDER BY it.created_at ASC`,
        [id]
      ),
    ]);

    const events = [
      ...auditRes.rows.map((r: any) => ({
        source: 'audit' as const,
        id: `a${r.id}`,
        action: r.action,
        // new_values carries the status/fields the actor set (see updatePharmacyOrder)
        details: r.new_values || r.old_values || null,
        user_name: r.user_name || 'System',
        user_role: r.user_role || null,
        created_at: r.created_at,
      })),
      ...txRes.rows.map((r: any) => ({
        source: 'inventory' as const,
        id: `t${r.id}`,
        action: r.transaction_type, // 'dispense' | 'return' | 'adjustment' | ...
        quantity: r.quantity,
        details: r.notes || null,
        user_name: r.user_name || 'System',
        user_role: r.user_role || null,
        created_at: r.created_at,
      })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    res.json({ activity: events });
  } catch (error) {
    console.error('Get pharmacy order activity error:', error);
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

    // Idempotency guard: when dispensing, make the ready→dispensed flip atomic so
    // ONLY the request that actually performs it proceeds to bill + deduct stock.
    // A concurrent double-submit (slow connection) or a re-dispense finds 0 rows
    // and returns without billing again — this is what produced phantom/duplicate
    // medication lines on the invoice (patient charged for meds never dispensed).
    const dispensingNow = updateData.status === 'dispensed';
    const result = await pool.query(
      `UPDATE pharmacy_orders SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1${dispensingNow ? " AND status <> 'dispensed'" : ''}
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query('SELECT * FROM pharmacy_orders WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Pharmacy order not found' });
        return;
      }
      // Already dispensed (concurrent/duplicate dispense) — do NOT re-bill.
      res.json({ message: 'Order already dispensed', order: existing.rows[0] });
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

    // Sync department_routing status with pharmacy order status. Skip 'cancelled'
    // — a cancellation shouldn't drag the encounter's pharmacy routing back to
    // 'pending' (other orders for the encounter may still be in progress).
    if (updateData.status && updateData.status !== 'cancelled') {
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

    // Tell the pharmacy when an order is pulled so they stop preparing it.
    if (updateData.status === 'cancelled') {
      try {
        await notificationService.notifyPharmacyOrderCancelled(parseInt(id));
      } catch (notifyError) {
        console.error('Error sending cancel notification (non-blocking):', notifyError);
      }
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
        let inventoryResult: { rows: Array<{ id: number; selling_price: string; quantity_on_hand: number; pack_size: string; medication_name?: string }> } = { rows: [] };
        if (updatedOrder.inventory_id) {
          inventoryResult = await client.query(
            `SELECT id, selling_price, quantity_on_hand, pack_size, medication_name FROM pharmacy_inventory
             WHERE id = $1`,
            [updatedOrder.inventory_id]
          );
        } else {
          // No inventory link (free-text order, or a free-text substitute the
          // pharmacist typed instead of picking the autocomplete). Match by name,
          // preferring the SUBSTITUTE actually dispensed over the doctor's
          // original med — otherwise a substituted med is never found in
          // inventory, so it's neither stock-deducted nor billed (Irene's report).
          const nameCandidates = [updatedOrder.substitute_medication, updatedOrder.medication_name]
            .map((n: unknown) => (n ? String(n).trim() : ''))
            .filter((n: string) => n.length > 0);
          for (const name of nameCandidates) {
            inventoryResult = await client.query(
              `SELECT id, selling_price, quantity_on_hand, pack_size, medication_name FROM pharmacy_inventory
               WHERE medication_name ILIKE $1 AND is_active = true LIMIT 1`,
              [name]
            );
            if (inventoryResult.rows.length > 0) break;
          }
        }

        // Substitute price guard: a free-text substitute leaves inventory_id on
        // the doctor's ORIGINAL med, which billed the wrong price (Irene: Augmentin
        // dispensed but billed at Amoksiklav's price). When a substitute is
        // recorded and the linked item is a DIFFERENT medication, re-resolve (and
        // re-price + re-deduct) from the substitute itself.
        const subName = updatedOrder.substitute_medication ? String(updatedOrder.substitute_medication).trim() : '';
        if (subName) {
          const linkedName = (inventoryResult.rows[0]?.medication_name || '').trim().toLowerCase();
          if (linkedName !== subName.toLowerCase()) {
            let subMatch = await client.query(
              `SELECT id, selling_price, quantity_on_hand, pack_size, medication_name FROM pharmacy_inventory
               WHERE medication_name ILIKE $1 AND is_active = true LIMIT 1`,
              [subName]
            );
            if (subMatch.rows.length === 0) {
              // Looser contains match, but never across a different strength
              // (a 20mg substitute must not adopt the 40mg item's price).
              subMatch = await client.query(
                `SELECT id, selling_price, quantity_on_hand, pack_size, medication_name FROM pharmacy_inventory
                 WHERE is_active = true
                   AND (medication_name ILIKE '%'||$1||'%' OR $1 ILIKE '%'||medication_name||'%')
                   AND (
                     (regexp_match(lower($1), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)')) IS NULL
                     OR (regexp_match(lower(medication_name), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)')) IS NULL
                     OR (regexp_match(lower($1), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)'))
                      = (regexp_match(lower(medication_name), '([0-9]+([.][0-9]+)?)[ ]*(mcg|mg|ml|iu|g|%)'))
                   )
                 LIMIT 1`,
                [subName]
              );
            }
            if (subMatch.rows.length > 0) inventoryResult = subMatch;
          }
        }

        if (inventoryResult.rows.length > 0) {
          const inventoryItem = inventoryResult.rows[0];
          // selling_price is the price of the unit the item is stocked and sold
          // in (pack / tablet / bottle — the same unit as `unit` and
          // quantity_on_hand). Bill it straight: unit price = selling_price,
          // line total = selling_price × quantity. Selling a partial pack ("per
          // tab") is rare and handled as a manual price edit on the invoice.
          const sellingPrice = parseFloat(inventoryItem.selling_price);
          // Guard: a null/blank/zero selling price would make total_price NaN and
          // silently corrupt the whole invoice total. Refuse rather than bill NaN.
          if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
            throw new Error(`No valid selling price set for "${inventoryItem.medication_name || updatedOrder.medication_name}" (got: ${inventoryItem.selling_price}). Set a price in inventory before dispensing.`);
          }
          const unitPrice = Math.round(sellingPrice * 100) / 100;
          const totalPrice = Math.round(sellingPrice * quantity * 100) / 100;

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

          // Get or create the invoice for the encounter. Previously billing was
          // skipped entirely when no invoice existed yet (e.g. a med dispensed
          // before reception opened billing), silently losing the charge. Mirror
          // the nurse-procedure flow and create the invoice if it's missing so a
          // dispensed med is ALWAYS billed.
          const invoiceId = await getOrCreateEncounterInvoice(updatedOrder.encounter_id, client);

          // Add medication as invoice item. Show the med actually dispensed (the
          // substitute when present); the "[sub for: …]" note is kept off the
          // patient invoice per Irene — the substitution is still in the order
          // activity log and audit trail.
          const medDescription = updatedOrder.substitute_medication
            ? `${updatedOrder.substitute_medication} (${updatedOrder.dosage})`
            : `${updatedOrder.medication_name} (${updatedOrder.dosage})`;
          await client.query(
            `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category, reference_type, reference_id)
             VALUES ($1, $2, $3, $4, $5, 'medication', 'pharmacy_order', $6)`,
            [invoiceId, medDescription, quantity, unitPrice, totalPrice, parseInt(id)]
          );

          // Update invoice total. Recompute subtotal too — previously only
          // total_amount was updated, leaving a stale subtotal on receipts/exports.
          await client.query(
            `UPDATE invoices SET
              subtotal = (SELECT COALESCE(SUM(total_price), 0) FROM invoice_items WHERE invoice_id = $1),
              total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM invoice_items WHERE invoice_id = $1),
              updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [invoiceId]
          );

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
        // The status was flipped to 'dispensed' (committed) BEFORE this
        // transaction; billing + stock deduction just rolled back. Previously
        // this was swallowed and the handler returned success — silently
        // leaving the patient un-charged and stock not deducted while the
        // pharmacist saw "dispensed". Instead revert the order to 'ready' so it
        // isn't falsely marked dispensed, and surface the error so the cause
        // (e.g. a missing selling price) can be fixed and the dispense retried.
        await pool.query(
          `UPDATE pharmacy_orders
             SET status = 'ready', dispensed_by = NULL, dispensed_date = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );
        res.status(400).json({
          error: `Could not complete dispensing: ${invoiceError instanceof Error ? invoiceError.message : 'billing/inventory update failed'}. The order was returned to "ready" — resolve the issue and dispense again.`,
        });
        return;
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
    // Cap against what's still outstanding, not the original — partial returns
    // are cumulative (return_quantity accrues, quantity never changes), so a
    // second return must only allow the remaining amount.
    const alreadyReturned = parseInt(order.return_quantity) || 0;
    const remaining = originalQty - alreadyReturned;
    if (!qty || qty <= 0 || qty > remaining) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `Return quantity must be between 1 and ${remaining}` });
      return;
    }

    // Returning everything still outstanding → 'returned', otherwise stays 'dispensed'
    const newStatus = qty === remaining ? 'returned' : 'dispensed';

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

    // Adjust the invoice. Previously this only decremented the invoice totals,
    // leaving the line item showing the original quantity (the "front desk still
    // shows x14 after returning 13" report). Reduce the matching line item's
    // quantity/total, then recompute the invoice total from its items.
    //
    // NOTE: this block must NOT be wrapped in a swallowing try/catch. Any query
    // error here aborts the surrounding transaction, after which COMMIT silently
    // performs a ROLLBACK — so catching+ignoring an error would unwind the whole
    // return (status, return_quantity, inventory restore) while still returning
    // "success" to the client. That false-success masked a broken UPDATE for two
    // weeks. Let errors propagate to the outer catch (ROLLBACK + 500) instead.
    const invoiceId = await resolveEncounterInvoiceId(order.encounter_id, client);
    if (invoiceId) {
      // Rebuild the exact description the dispense step wrote, so we update the
      // right medication line (substitute-aware). Kept in sync with the dispense
      // format above (no "[sub for: …]" suffix).
      const medDescription = order.substitute_medication
        ? `${order.substitute_medication} (${order.dosage})`
        : `${order.medication_name} (${order.dosage})`;

      // Match the line by the SOURCE order first (reference_type/reference_id) —
      // robust even if it was billed under a different description (substitute,
      // charge_master name, safety-net) — and fall back to the description.
      const itemRes = await client.query(
        `SELECT id, quantity, unit_price FROM invoice_items
          WHERE invoice_id = $1 AND category = 'medication'
            AND ((reference_type = 'pharmacy_order' AND reference_id = $2) OR description = $3)
          ORDER BY (reference_type = 'pharmacy_order' AND reference_id = $2) DESC, id DESC
          LIMIT 1`,
        [invoiceId, parseInt(id), medDescription]
      );

      if (itemRes.rows.length > 0) {
        const item = itemRes.rows[0];
        const newQty = parseInt(item.quantity) - qty;
        if (newQty > 0) {
          // $2 is cast to int explicitly: it's used both in `quantity = $2`
          // (integer column) and `unit_price * $2` (numeric). Without the cast
          // Postgres deduces conflicting types for the one parameter and throws
          // 42P08 "inconsistent types deduced for parameter $2".
          await client.query(
            `UPDATE invoice_items
                SET quantity = $2::int, total_price = unit_price * $2::int
              WHERE id = $1`,
            [item.id, newQty]
          );
        } else {
          // Whole line returned — drop it.
          await client.query(`DELETE FROM invoice_items WHERE id = $1`, [item.id]);
        }
      } else {
        console.warn(`Return: no matching invoice item for "${medDescription}" on invoice ${invoiceId}`);
      }

      // Recompute the invoice total from its items (same approach as dispense).
      await client.query(
        `UPDATE invoices SET
           subtotal = (SELECT COALESCE(SUM(total_price), 0) FROM invoice_items WHERE invoice_id = $1),
           total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM invoice_items WHERE invoice_id = $1),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invoiceId]
      );

      // If the return dropped the total below what was already paid, the patient
      // overpaid — record a refund and settle the invoice at the new total so
      // the ledger stays consistent. Previously the return left status='paid'
      // with amount_paid > total_amount and NO trace of money owed back.
      const invAfter = await client.query(
        `SELECT total_amount, amount_paid FROM invoices WHERE id = $1`,
        [invoiceId]
      );
      const newTotal = parseFloat(invAfter.rows[0].total_amount || 0);
      const paid = parseFloat(invAfter.rows[0].amount_paid || 0);
      if (paid > newTotal) {
        const refund = Math.round((paid - newTotal) * 100) / 100;
        await client.query(
          `INSERT INTO payments (invoice_id, payment_date, amount, payment_method, notes, created_by, created_at)
           VALUES ($1, CURRENT_DATE, $2, 'refund', $3, $4, CURRENT_TIMESTAMP)`,
          [invoiceId, -refund, `Refund for returned medication (order #${id}): ${return_reason || 'no reason given'}`, userId]
        );
        await client.query(
          `UPDATE invoices
             SET amount_paid = $2,
                 status = CASE WHEN total_amount > 0 AND $2 >= total_amount THEN 'paid'
                               WHEN $2 > 0 THEN 'partial'
                               ELSE 'pending' END,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [invoiceId, newTotal]
        );
      }
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

    // A refill must bill onto the patient's CURRENT visit so the dispensed
    // medication shows on the front-desk invoice. Copying the original
    // prescription's encounter_id (often a long-closed past visit) stranded the
    // charge on that old invoice — the med appeared on pharmacy's Dispensed tab
    // but never reached reception (Irene's report). Resolve today's open
    // encounter; if the patient has none, open a Pharmacy (OTC/Walk-in) visit so
    // the sale still bills and reaches checkout (is_otc → no consultation fee).
    let billingEncounterId: number;
    const openEnc = await client.query(
      `SELECT id FROM encounters
        WHERE patient_id = $1
          AND DATE(checked_in_at) = CURRENT_DATE
          AND status NOT IN ('completed', 'discharged', 'cancelled')
        ORDER BY id DESC LIMIT 1`,
      [original.patient_id]
    );
    if (openEnc.rows.length > 0) {
      billingEncounterId = openEnc.rows[0].id;
    } else {
      const walkIn = await client.query(
        `INSERT INTO encounters (
           patient_id, provider_id, encounter_date, encounter_type, chief_complaint,
           status, checked_in_at, triage_time, triage_priority, clinic, is_otc
         ) VALUES ($1, NULL, CURRENT_TIMESTAMP, 'walk-in', 'OTC Purchase',
           'in-progress', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'green',
           'Pharmacy (OTC/Walk-in)', true)
         RETURNING id`,
        [original.patient_id]
      );
      billingEncounterId = walkIn.rows[0].id;
      // Surface the auto-created visit in the reception queue as a pharmacy walk-in.
      await client.query(
        `INSERT INTO department_routing (
           encounter_id, patient_id, department, priority, notes, routed_by, is_walk_in
         ) VALUES ($1, $2, 'pharmacy', 'routine', 'Medication refill walk-in', $3, true)`,
        [billingEncounterId, original.patient_id, userId]
      );
    }

    // Create a new order as the refill (copies the prescription)
    const newOrderResult = await client.query(
      `INSERT INTO pharmacy_orders (
        patient_id, encounter_id, ordering_provider, medication_name,
        dosage, frequency, route, quantity, refills, days_supply, is_long_term, priority,
        status, parent_order_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        original.patient_id,
        billingEncounterId,
        original.ordering_provider,
        original.medication_name,
        original.dosage,
        original.frequency,
        original.route,
        original.quantity,
        0, // Refill order has no refills of its own
        original.days_supply,
        // Carry the long-term flag forward so a chronic med keeps cycling on the
        // refills calendar (the calendar gate is is_long_term OR refills>0, and a
        // refill order deliberately has 0 refills of its own).
        original.is_long_term === true,
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
          AND po.is_manual_reminder IS NOT TRUE
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

    // Guard against double-billing from a retried/duplicated submit (common on a
    // slow connection: the request times out client-side but still lands, and
    // the pharmacist resubmits). Lock the pharmacy routing row; if it has already
    // been served, bail before creating any orders/invoice items. A concurrent
    // second request blocks on this lock until the first commits, then sees
    // 'completed' and exits — so the OTC bill can never be pushed twice.
    const routingLock = await client.query(
      `SELECT status FROM department_routing WHERE id = $1 FOR UPDATE`,
      [routing_id]
    );
    if (routingLock.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Walk-in routing not found' });
      return;
    }
    if (routingLock.rows[0].status === 'completed') {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'This walk-in has already been served. Refresh the queue to see the latest status.' });
      return;
    }

    const createdOrders: any[] = [];
    let totalAmount = 0;

    // Process each medication
    for (const med of medicationList) {
      // Verify stock availability
      const stockCheck = await client.query(
        `SELECT id, medication_name, quantity_on_hand, selling_price, pack_size
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

      // selling_price is the price of the unit the item is stocked and sold in
      // (pack / tablet / bottle); bill it as-is × quantity — the clinic sells
      // by the pack it stocks. Per-tab sales are a rare manual invoice
      // adjustment. Computed server-side from inventory rather than trusting
      // the client's unit_price.
      const sellingPrice = parseFloat(inventoryItem.selling_price);
      // Guard: refuse to bill a NaN/zero price (would corrupt the invoice total).
      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
        throw new Error(`No valid selling price set for "${inventoryItem.medication_name}" (got: ${inventoryItem.selling_price}). Set a price in inventory before dispensing.`);
      }
      const perUnitPrice = Math.round(sellingPrice * 100) / 100;
      orderResult.rows[0]._billUnitPrice = perUnitPrice;
      createdOrders.push(orderResult.rows[0]);

      // Dispense from batches (FEFO)
      await dispenseFromBatches(client, med.inventory_id, med.quantity, dispensed_by);

      // Calculate amount
      const itemTotal = Math.round(perUnitPrice * med.quantity * 100) / 100;
      totalAmount += itemTotal;
    }

    // Get or create the encounter's (possibly shared) invoice for this OTC sale.
    const invoiceId = await getOrCreateEncounterInvoice(encounter_id, client);

    // Add each medication as an invoice line item
    for (const order of createdOrders) {
      // Match the original medication entry back to this order by name.
      // (Previously the || m.inventory_id always evaluated true, so every
      // line item got the first medication's price.)
      // Use the per-unit price computed from inventory above (pack-size aware),
      // falling back to the client value only if it's somehow missing.
      const med = medicationList.find((m: any) => m.medication_name === order.medication_name);
      const unitPrice = order._billUnitPrice ?? med?.unit_price ?? 0;
      const quantity = order.quantity;
      const itemTotal = Math.round(unitPrice * quantity * 100) / 100;

      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, 'medication', 'pharmacy_order', $6)`,
        [invoiceId, `${order.medication_name}${order.dosage ? ` (${order.dosage})` : ''}`, quantity, unitPrice, itemTotal, order.id]
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
    // Surface the reason (e.g. missing selling price) so the pharmacist can fix
    // it, instead of a generic "Internal server error".
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to dispense walk-in order' });
  } finally {
    client.release();
  }
};
