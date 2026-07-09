import pool from '../db';

/**
 * Remove erroneous consultation / registration fees that were auto-added to
 * pharmacy OTC (over-the-counter) walk-in invoices, and backfill is_otc so it
 * can never recur.
 *
 * Background: check-in (workflowController.checkInPatient) and the encounter
 * completion billing sync (billingService.syncEncounterInvoice) add a
 * consultation — and, for new patients, a registration — fee UNLESS the
 * encounter's `clinic` string matches a hard-coded department-walk-in list.
 * Before the pharmacy walk-in flow reliably tagged `clinic =
 * 'Pharmacy (OTC/Walk-in)'`, and any time that string drifted (blank / legacy /
 * a real clinic), an OTC sale wrongly picked up a consult fee — commonly the
 * GHS 75 clinic rate — surfacing as a second charge on the invoice list.
 *
 * The head pharmacist confirmed OTC sales must NOT carry a consultation fee, so
 * this strips those lines from OTC encounters' invoices and recomputes the
 * invoice totals.
 *
 * Safety: idempotent, runs in one transaction, and only touches UNPAID invoices.
 * Any OTC invoice that already took a payment is left untouched and reported so
 * it can be handled manually — removing a charge from a settled invoice would
 * create an overpayment / credit that must be reconciled deliberately.
 */
export async function removeOtcConsultationFees() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Encounters that are unambiguously pharmacy OTC / walk-in sales. Identified
    // by more than the clinic string (which is exactly what drifted): the is_otc
    // flag, the clinic name, the "OTC Purchase" chief complaint set by the
    // pharmacy walk-in flow, or a pharmacy walk-in routing row.
    const otcEncounterFilter = `
      e.is_otc = true
      OR e.clinic = 'Pharmacy (OTC/Walk-in)'
      OR LOWER(TRIM(COALESCE(e.chief_complaint, ''))) = 'otc purchase'
      OR EXISTS (
        SELECT 1 FROM department_routing dr
        WHERE dr.encounter_id = e.id AND dr.department = 'pharmacy' AND dr.is_walk_in = true
      )
    `;

    // Backfill is_otc so future billing never re-adds a fee to these encounters.
    const flagged = await client.query(
      `UPDATE encounters e SET is_otc = true
       WHERE (${otcEncounterFilter}) AND COALESCE(e.is_otc, false) = false`
    );
    console.log(`Backfilled is_otc=true on ${flagged.rowCount} OTC encounter(s).`);

    // Candidate consult/registration lines on OTC encounters' invoices. Match by
    // category AND by description (legacy rows predating the category column may
    // have a null/'general' category) — safe because the scope is already
    // restricted to OTC encounters, whose invoices only ever hold drug lines.
    const candidates = await client.query(
      `SELECT ii.id AS item_id, ii.invoice_id, ii.total_price, ii.description,
              inv.status, COALESCE(inv.amount_paid, 0) AS amount_paid,
              inv.invoice_number
       FROM invoice_items ii
       JOIN invoices inv ON inv.id = ii.invoice_id
       JOIN encounters e ON e.id = inv.encounter_id
       WHERE (${otcEncounterFilter})
         AND (
           ii.category IN ('consultation', 'registration')
           OR ii.description ILIKE '%consultation%'
           OR ii.description ILIKE '%registration%'
         )`
    );

    const isSettled = (r: any) =>
      parseFloat(r.amount_paid) > 0 || r.status === 'paid' || r.status === 'cancelled';
    const settled = candidates.rows.filter(isSettled);
    const removable = candidates.rows.filter((r) => !isSettled(r));

    if (settled.length > 0) {
      console.warn(
        `SKIPPED ${settled.length} consult/registration line(s) on PAID/settled OTC ` +
        `invoice(s) — left untouched to avoid creating overpayments. Review manually:`
      );
      for (const r of settled) {
        console.warn(
          `  - invoice ${r.invoice_number} (${r.status}, paid GHS ${r.amount_paid}): ` +
          `"${r.description}" GHS ${r.total_price}`
        );
      }
    }

    if (removable.length === 0) {
      console.log('No removable OTC consult/registration fees found — nothing to delete.');
      await client.query('COMMIT');
      return;
    }

    const removableIds = removable.map((r) => r.item_id);
    const affectedInvoiceIds = [...new Set(removable.map((r) => r.invoice_id))];

    const del = await client.query(
      `DELETE FROM invoice_items WHERE id = ANY($1::int[])`,
      [removableIds]
    );
    console.log(
      `Deleted ${del.rowCount} erroneous consult/registration line(s) from ` +
      `${affectedInvoiceIds.length} unpaid OTC invoice(s).`
    );

    // Recompute each affected invoice total from its remaining items (preserve tax).
    await client.query(
      `UPDATE invoices inv SET
         subtotal = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = inv.id), 0),
         total_amount = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = inv.id), 0)
                        + COALESCE(inv.tax, 0),
         updated_at = CURRENT_TIMESTAMP
       WHERE inv.id = ANY($1::int[])`,
      [affectedInvoiceIds]
    );
    console.log(`Recomputed totals for ${affectedInvoiceIds.length} invoice(s).`);

    await client.query('COMMIT');
    console.log('removeOtcConsultationFees migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('removeOtcConsultationFees migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  removeOtcConsultationFees()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
