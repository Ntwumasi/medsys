/**
 * Auto-checkout Service
 *
 * When a post-paid patient's invoice is fully settled, this service
 * automatically discharges the encounter — releasing the room, clearing
 * alerts, and logging the action. This removes the manual step the
 * receptionist would otherwise have to perform after payment.
 *
 * Only triggers when:
 *  - The invoice's encounter is NOT already discharged
 *  - There are no pending department routing items (lab/imaging/pharmacy
 *    still in progress) — we don't want to prematurely discharge someone
 *    who still needs services
 */

import pool from '../database/db';
import auditService from './auditService';
import notificationService from './notificationService';

/**
 * Attempt auto-checkout for the encounter linked to this invoice.
 * Call this after recording a payment that brings the invoice to 'paid'.
 *
 * Safe to call even if the encounter is already discharged (no-op).
 * Uses its own transaction internally.
 */
export async function autoCheckoutIfFullyPaid(
  invoiceId: number,
  triggeredByUserId: number
): Promise<{ didCheckout: boolean; reason?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get the invoice + linked encounter
    const invoiceResult = await client.query(
      `SELECT i.id, i.encounter_id, i.total_amount, i.amount_paid, i.status
         FROM invoices i
        WHERE i.id = $1`,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { didCheckout: false, reason: 'invoice_not_found' };
    }

    const invoice = invoiceResult.rows[0];

    // Only proceed if the invoice is fully paid
    if (invoice.status !== 'paid') {
      await client.query('ROLLBACK');
      return { didCheckout: false, reason: 'not_fully_paid' };
    }

    if (!invoice.encounter_id) {
      await client.query('ROLLBACK');
      return { didCheckout: false, reason: 'no_encounter_linked' };
    }

    // 2. Check encounter status — skip if already discharged
    const encounterResult = await client.query(
      `SELECT e.id, e.status, e.room_id, e.patient_id,
              u.first_name || ' ' || u.last_name AS patient_name,
              p.patient_number
         FROM encounters e
         LEFT JOIN patients p ON e.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
        WHERE e.id = $1`,
      [invoice.encounter_id]
    );

    if (encounterResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { didCheckout: false, reason: 'encounter_not_found' };
    }

    const encounter = encounterResult.rows[0];

    if (encounter.status === 'discharged') {
      await client.query('ROLLBACK');
      return { didCheckout: false, reason: 'already_discharged' };
    }

    // 3. Check for pending department routing — don't discharge prematurely
    const pendingRouting = await client.query(
      `SELECT id FROM department_routing
        WHERE encounter_id = $1
          AND status IN ('pending', 'in_progress')`,
      [invoice.encounter_id]
    );

    if (pendingRouting.rows.length > 0) {
      await client.query('ROLLBACK');
      return { didCheckout: false, reason: 'pending_department_routing' };
    }

    // 4. Perform checkout — mirrors workflowController.checkoutPatient
    const { room_id, patient_id, patient_name, patient_number } = encounter;

    // Release room
    if (room_id) {
      await client.query(
        `UPDATE rooms SET is_available = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [room_id]
      );
    }

    // Discharge encounter
    await client.query(
      `UPDATE encounters
          SET status = 'discharged',
              room_id = NULL,
              discharged_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [invoice.encounter_id]
    );

    // Clear alerts
    await client.query(
      `UPDATE alerts SET is_read = true, read_at = CURRENT_TIMESTAMP
        WHERE encounter_id = $1 AND is_read = false`,
      [invoice.encounter_id]
    );

    // Audit log
    await auditService.log({
      userId: triggeredByUserId,
      action: 'checkout' as const,
      entityType: 'encounter',
      entityId: invoice.encounter_id,
      details: {
        patient_id,
        patient_name,
        patient_number,
        trigger: 'payment_settled',
        invoice_id: invoiceId,
      },
    });

    await client.query('COMMIT');

    // Notify receptionists (fire-and-forget, after commit)
    notificationService
      .notifyPatientCheckedOut(patient_name || '', patient_number || '')
      .catch((err: unknown) =>
        console.error('Auto-checkout notification error:', err)
      );

    console.log(
      `Auto-checkout: encounter ${invoice.encounter_id} discharged after invoice ${invoiceId} paid in full`
    );

    return { didCheckout: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Auto-checkout error:', error);
    return { didCheckout: false, reason: 'internal_error' };
  } finally {
    client.release();
  }
}

export default { autoCheckoutIfFullyPaid };
