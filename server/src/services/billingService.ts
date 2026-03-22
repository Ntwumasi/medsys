import pool from '../database/db';

export interface BillingItem {
  description: string;
  quantity: number;
  unitPrice: number;
  category: string;
  chargeMasterId?: number | null;
  referenceType?: string; // 'lab_order', 'imaging_order', 'pharmacy_order', etc.
  referenceId?: number;
}

export const billingService = {
  /**
   * Recalculate invoice total from invoice_items
   * This ensures the total always matches the sum of items
   */
  async recalculateInvoiceTotal(invoiceId: number): Promise<number> {
    const result = await pool.query(
      `UPDATE invoices
       SET subtotal = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0),
           total_amount = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING total_amount`,
      [invoiceId]
    );
    return parseFloat(result.rows[0]?.total_amount || 0);
  },

  /**
   * Sync invoice items with actual orders - called when encounter completes
   * This does NOT delete existing items - it only adds missing ones
   */
  async syncEncounterInvoice(encounterId: number): Promise<{ invoiceId: number; total: number } | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get encounter and invoice details
      const encounterResult = await client.query(
        `SELECT e.*, p.id as patient_id, p.patient_number, i.id as invoice_id
         FROM encounters e
         JOIN patients p ON e.patient_id = p.id
         LEFT JOIN invoices i ON i.encounter_id = e.id
         WHERE e.id = $1`,
        [encounterId]
      );

      if (encounterResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const encounter = encounterResult.rows[0];
      let invoiceId = encounter.invoice_id;

      // Create invoice if it doesn't exist
      if (!invoiceId) {
        const invoiceCountResult = await client.query('SELECT COUNT(*) FROM invoices');
        const invoiceNumber = `INV${String(parseInt(invoiceCountResult.rows[0].count) + 1).padStart(6, '0')}`;

        const invoiceResult = await client.query(
          `INSERT INTO invoices (patient_id, encounter_id, invoice_number, invoice_date, subtotal, total_amount, status)
           VALUES ($1, $2, $3, CURRENT_DATE, 0, 0, 'pending')
           RETURNING id`,
          [encounter.patient_id, encounterId, invoiceNumber]
        );
        invoiceId = invoiceResult.rows[0].id;
      }

      // Get existing invoice items to avoid duplicates
      const existingItems = await client.query(
        `SELECT description, category FROM invoice_items WHERE invoice_id = $1`,
        [invoiceId]
      );
      const existingDescriptions = new Set(existingItems.rows.map(r => `${r.category}:${r.description}`));

      const newItems: BillingItem[] = [];

      // 1. Check for consultation fee (should already exist from check-in)
      const hasConsultation = existingItems.rows.some(r => r.category === 'consultation');
      if (!hasConsultation) {
        // Look up consultation fee from charge_master
        const consultCode = encounter.encounter_type === 'follow-up' ? 'CONS-FU' :
                           encounter.encounter_type === 'new' ? 'CONS-NEW' : 'CONS-WI';
        const consultResult = await client.query(
          `SELECT id, service_name, price FROM charge_master
           WHERE service_code = $1 AND is_active = true LIMIT 1`,
          [consultCode]
        );

        const consultFee = consultResult.rows[0];
        const consultPrice = consultFee ? parseFloat(consultFee.price) : 80.00;

        newItems.push({
          description: consultFee?.service_name || `${encounter.encounter_type || 'Walk-in'} Consultation`,
          quantity: 1,
          unitPrice: consultPrice,
          category: 'consultation',
          chargeMasterId: consultFee?.id || null,
        });
      }

      // 2. Check lab orders that were completed but not yet billed
      const labResult = await client.query(
        `SELECT lo.id, lo.test_name, lo.test_code,
                cm.id as charge_id, cm.service_name, cm.price
         FROM lab_orders lo
         LEFT JOIN charge_master cm ON (cm.service_code = lo.test_code OR cm.service_name ILIKE '%' || lo.test_name || '%')
           AND cm.category = 'lab' AND cm.is_active = true
         WHERE lo.encounter_id = $1 AND lo.status = 'completed'`,
        [encounterId]
      );

      for (const lab of labResult.rows) {
        const desc = `Lab: ${lab.service_name || lab.test_name}`;
        const key = `lab:${desc}`;
        if (!existingDescriptions.has(key)) {
          newItems.push({
            description: desc,
            quantity: 1,
            unitPrice: lab.price ? parseFloat(lab.price) : 75.00,
            category: 'lab',
            chargeMasterId: lab.charge_id || null,
            referenceType: 'lab_order',
            referenceId: lab.id,
          });
        }
      }

      // 3. Check imaging orders that were completed but not yet billed
      const imagingResult = await client.query(
        `SELECT io.id, io.imaging_type, io.body_part,
                cm.id as charge_id, cm.service_name, cm.price
         FROM imaging_orders io
         LEFT JOIN charge_master cm ON cm.service_name ILIKE '%' || io.imaging_type || '%'
           AND cm.category = 'imaging' AND cm.is_active = true
         WHERE io.encounter_id = $1 AND io.status = 'completed'`,
        [encounterId]
      );

      for (const imaging of imagingResult.rows) {
        const desc = `Imaging: ${imaging.service_name || `${imaging.imaging_type} - ${imaging.body_part}`}`;
        const key = `imaging:${desc}`;
        if (!existingDescriptions.has(key)) {
          const defaultPrices: Record<string, number> = {
            'X-Ray': 80, 'CT Scan': 350, 'MRI': 800, 'Ultrasound': 150
          };
          newItems.push({
            description: desc,
            quantity: 1,
            unitPrice: imaging.price ? parseFloat(imaging.price) : (defaultPrices[imaging.imaging_type] || 150),
            category: 'imaging',
            chargeMasterId: imaging.charge_id || null,
            referenceType: 'imaging_order',
            referenceId: imaging.id,
          });
        }
      }

      // 4. Check pharmacy orders that were dispensed but not yet billed
      // Note: Pharmacy billing should happen at dispense time in ordersController
      // This is a safety check for any that might have been missed
      const pharmacyResult = await client.query(
        `SELECT po.id, po.medication_name, po.dosage, po.quantity,
                pi.selling_price
         FROM pharmacy_orders po
         LEFT JOIN pharmacy_inventory pi ON pi.medication_name ILIKE po.medication_name
         WHERE po.encounter_id = $1 AND po.status = 'dispensed'`,
        [encounterId]
      );

      for (const med of pharmacyResult.rows) {
        const desc = `${med.medication_name} (${med.dosage})`;
        const key = `medication:${desc}`;
        if (!existingDescriptions.has(key)) {
          const unitPrice = med.selling_price ? parseFloat(med.selling_price) : 10.00;
          newItems.push({
            description: desc,
            quantity: parseInt(med.quantity) || 1,
            unitPrice: unitPrice,
            category: 'medication',
            referenceType: 'pharmacy_order',
            referenceId: med.id,
          });
        }
      }

      // 5. Check nurse procedures that were completed but not yet billed
      const procedureResult = await client.query(
        `SELECT np.id, np.procedure_name, np.charge_master_id, np.billed,
                cm.price, cm.service_name
         FROM nurse_procedures np
         LEFT JOIN charge_master cm ON cm.id = np.charge_master_id
         WHERE np.encounter_id = $1 AND np.status = 'completed' AND np.billed = false`,
        [encounterId]
      );

      for (const proc of procedureResult.rows) {
        const desc = `Procedure: ${proc.service_name || proc.procedure_name}`;
        const key = `procedure:${desc}`;
        if (!existingDescriptions.has(key)) {
          newItems.push({
            description: desc,
            quantity: 1,
            unitPrice: proc.price ? parseFloat(proc.price) : 50.00,
            category: 'procedure',
            chargeMasterId: proc.charge_master_id || null,
            referenceType: 'nurse_procedure',
            referenceId: proc.id,
          });
        }
      }

      // Insert new items
      for (const item of newItems) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [invoiceId, item.chargeMasterId, item.description, item.quantity, item.unitPrice, item.quantity * item.unitPrice, item.category]
        );
      }

      // Recalculate invoice total from all items
      const totalResult = await client.query(
        `UPDATE invoices
         SET subtotal = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0),
             total_amount = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING total_amount`,
        [invoiceId]
      );

      const total = parseFloat(totalResult.rows[0]?.total_amount || 0);

      await client.query('COMMIT');

      console.log(`Synced invoice ${invoiceId} for encounter ${encounterId}: Added ${newItems.length} items, Total: GHS ${total.toFixed(2)}`);
      return { invoiceId, total };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to sync invoice:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Legacy method - now calls syncEncounterInvoice
   * Kept for backwards compatibility
   */
  async generateEncounterInvoice(encounterId: number): Promise<{ invoiceId: number; total: number } | null> {
    return this.syncEncounterInvoice(encounterId);
  },

  /**
   * Get invoice summary for an encounter
   */
  async getEncounterBilling(encounterId: number): Promise<any> {
    const result = await pool.query(
      `SELECT i.*,
              json_agg(
                json_build_object(
                  'id', ii.id,
                  'description', ii.description,
                  'quantity', ii.quantity,
                  'unit_price', ii.unit_price,
                  'total_price', ii.total_price,
                  'category', ii.category,
                  'charge_master_id', ii.charge_master_id
                ) ORDER BY ii.category, ii.id
              ) FILTER (WHERE ii.id IS NOT NULL) as items
       FROM invoices i
       LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
       WHERE i.encounter_id = $1
       GROUP BY i.id`,
      [encounterId]
    );
    return result.rows[0] || null;
  },

  /**
   * Add a single charge to an existing invoice
   */
  async addChargeToInvoice(
    invoiceId: number,
    description: string,
    quantity: number,
    unitPrice: number,
    category: string,
    chargeMasterId?: number
  ): Promise<void> {
    await pool.query(
      `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [invoiceId, chargeMasterId || null, description, quantity, unitPrice, quantity * unitPrice, category]
    );

    // Recalculate total
    await this.recalculateInvoiceTotal(invoiceId);
  },

  /**
   * Remove a charge from an invoice
   */
  async removeChargeFromInvoice(invoiceItemId: number): Promise<void> {
    const result = await pool.query(
      `DELETE FROM invoice_items WHERE id = $1 RETURNING invoice_id`,
      [invoiceItemId]
    );

    if (result.rows.length > 0) {
      await this.recalculateInvoiceTotal(result.rows[0].invoice_id);
    }
  },
};

export default billingService;
