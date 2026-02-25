import pool from '../database/db';

export interface BillingItem {
  description: string;
  quantity: number;
  unitPrice: number;
  category: string;
}

export const billingService = {
  /**
   * Auto-generate invoice when encounter completes
   */
  async generateEncounterInvoice(encounterId: number): Promise<{ invoiceId: number; total: number } | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get encounter details
      const encounterResult = await client.query(
        `SELECT e.*, p.id as patient_id, p.patient_number
         FROM encounters e
         JOIN patients p ON e.patient_id = p.id
         WHERE e.id = $1`,
        [encounterId]
      );

      if (encounterResult.rows.length === 0) {
        return null;
      }

      const encounter = encounterResult.rows[0];
      const items: BillingItem[] = [];

      // 1. Consultation fee based on encounter type
      const consultationFees: Record<string, number> = {
        'walk-in': 75,
        'appointment': 50,
        'follow-up': 40,
        'emergency': 150,
      };
      items.push({
        description: `${encounter.encounter_type || 'walk-in'} Consultation`,
        quantity: 1,
        unitPrice: consultationFees[encounter.encounter_type] || 75,
        category: 'consultation',
      });

      // 2. Lab orders
      const labResult = await client.query(
        `SELECT lo.*, cm.price, cm.description as charge_desc
         FROM lab_orders lo
         LEFT JOIN charge_master cm ON cm.code = lo.test_code OR cm.description ILIKE '%' || lo.test_name || '%'
         WHERE lo.encounter_id = $1 AND lo.status = 'completed'`,
        [encounterId]
      );

      for (const lab of labResult.rows) {
        items.push({
          description: `Lab: ${lab.test_name}`,
          quantity: 1,
          unitPrice: lab.price || 25, // Default lab price if not in charge master
          category: 'laboratory',
        });
      }

      // 3. Imaging orders
      const imagingResult = await client.query(
        `SELECT io.*, cm.price, cm.description as charge_desc
         FROM imaging_orders io
         LEFT JOIN charge_master cm ON cm.description ILIKE '%' || io.imaging_type || '%'
         WHERE io.encounter_id = $1 AND io.status = 'completed'`,
        [encounterId]
      );

      const imagingPrices: Record<string, number> = {
        'X-Ray': 50,
        'CT Scan': 250,
        'MRI': 500,
        'Ultrasound': 100,
        'Mammogram': 150,
      };

      for (const imaging of imagingResult.rows) {
        items.push({
          description: `Imaging: ${imaging.imaging_type} - ${imaging.body_part}`,
          quantity: 1,
          unitPrice: imaging.price || imagingPrices[imaging.imaging_type] || 75,
          category: 'imaging',
        });
      }

      // 4. Pharmacy orders
      const pharmacyResult = await client.query(
        `SELECT po.*, cm.price, cm.description as charge_desc
         FROM pharmacy_orders po
         LEFT JOIN charge_master cm ON cm.description ILIKE '%' || po.medication_name || '%'
         WHERE po.encounter_id = $1 AND po.status = 'dispensed'`,
        [encounterId]
      );

      for (const med of pharmacyResult.rows) {
        items.push({
          description: `Medication: ${med.medication_name} ${med.dosage}`,
          quantity: med.quantity || 1,
          unitPrice: med.price || 10, // Default medication price
          category: 'pharmacy',
        });
      }

      // 5. Procedures (from clinical notes if any procedural notes)
      const procedureResult = await client.query(
        `SELECT * FROM clinical_notes
         WHERE encounter_id = $1 AND note_type = 'doctor_procedural'`,
        [encounterId]
      );

      for (const proc of procedureResult.rows) {
        items.push({
          description: 'Procedure performed',
          quantity: 1,
          unitPrice: 100, // Default procedure price
          category: 'procedure',
        });
      }

      // Calculate total
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

      // Check if invoice already exists
      const existingInvoice = await client.query(
        `SELECT id FROM invoices WHERE encounter_id = $1`,
        [encounterId]
      );

      let invoiceId: number;

      if (existingInvoice.rows.length > 0) {
        invoiceId = existingInvoice.rows[0].id;
        // Update existing invoice
        await client.query(
          `UPDATE invoices SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
          [total, invoiceId]
        );
        // Clear existing items
        await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
      } else {
        // Generate invoice number
        const invoiceCountResult = await client.query('SELECT COUNT(*) FROM invoices');
        const invoiceNumber = `INV${String(parseInt(invoiceCountResult.rows[0].count) + 1).padStart(6, '0')}`;

        // Create invoice
        const invoiceResult = await client.query(
          `INSERT INTO invoices (patient_id, encounter_id, invoice_number, total_amount, status)
           VALUES ($1, $2, $3, $4, 'pending')
           RETURNING id`,
          [encounter.patient_id, encounterId, invoiceNumber, total]
        );
        invoiceId = invoiceResult.rows[0].id;
      }

      // Insert invoice items
      for (const item of items) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [invoiceId, item.description, item.quantity, item.unitPrice, item.quantity * item.unitPrice, item.category]
        );
      }

      await client.query('COMMIT');

      console.log(`Generated invoice ${invoiceId} for encounter ${encounterId}: $${total}`);
      return { invoiceId, total };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to generate invoice:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Get invoice summary for an encounter
   */
  async getEncounterBilling(encounterId: number): Promise<any> {
    const result = await pool.query(
      `SELECT i.*,
              json_agg(json_build_object(
                'id', ii.id,
                'description', ii.description,
                'quantity', ii.quantity,
                'unit_price', ii.unit_price,
                'total_price', ii.total_price,
                'category', ii.category
              )) as items
       FROM invoices i
       LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
       WHERE i.encounter_id = $1
       GROUP BY i.id`,
      [encounterId]
    );
    return result.rows[0] || null;
  },
};

export default billingService;
