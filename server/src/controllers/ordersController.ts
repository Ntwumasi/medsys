import { Request, Response } from 'express';
import pool from '../database/db';
import notificationService from '../services/notificationService';
import auditService from '../services/auditService';
import drugInteractionService from '../services/drugInteractionService';
import { dispenseFromBatches } from './inventoryController';

// Lab Orders
export const createLabOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const currentUserId = authReq.user?.id;
    const currentUserRole = authReq.user?.role;

    const { patient_id, encounter_id, test_name, test_code, priority, notes, ordering_provider_id } = req.body;

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

    const result = await pool.query(
      `INSERT INTO lab_orders (
        patient_id, encounter_id, ordering_provider, entered_by, test_name, test_code, priority, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [patient_id, encounter_id, orderingProvider, enteredBy, test_name, test_code, priority || 'routine', notes]
    );

    // Update billing
    await pool.query(
      `UPDATE invoices
       SET subtotal = subtotal + 75.00,
           total_amount = total_amount + 75.00
       WHERE encounter_id = $1`,
      [encounter_id]
    );

    const order = result.rows[0];

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
    const { patient_id, encounter_id, status, start_date, end_date, priority } = req.query;

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
        u.first_name || ' ' || u.last_name as ordering_provider_name,
        u_entered.first_name || ' ' || u_entered.last_name as entered_by_name,
        e.encounter_number,
        p.patient_number,
        p.allergies as patient_allergies,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name
      FROM lab_orders lo
      LEFT JOIN users u ON lo.ordering_provider = u.id
      LEFT JOIN users u_entered ON lo.entered_by = u_entered.id
      LEFT JOIN encounters e ON lo.encounter_id = e.id
      LEFT JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
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

export const updateLabOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

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

    // If completing, set result_date to now
    if (updateData.status === 'completed' && !updateData.result_date) {
      updateData.result_date = new Date().toISOString();
    }

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE lab_orders SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }

    const updatedOrder = result.rows[0];

    // Auto-flag critical results when completing a test
    if (updateData.status === 'completed' && updateData.result) {
      try {
        // Get the test catalog entry for reference ranges
        const catalogResult = await pool.query(
          `SELECT * FROM lab_test_catalog
           WHERE test_code = $1 OR test_name ILIKE $2
           LIMIT 1`,
          [updatedOrder.test_code, updatedOrder.test_name]
        );

        if (catalogResult.rows.length > 0) {
          const catalog = catalogResult.rows[0];
          const resultValue = parseFloat(updateData.result);

          // Check if result is a number and if it's outside critical ranges
          if (!isNaN(resultValue)) {
            let alertType = null;

            if (catalog.critical_low !== null && resultValue < catalog.critical_low) {
              alertType = 'critical_low';
            } else if (catalog.critical_high !== null && resultValue > catalog.critical_high) {
              alertType = 'critical_high';
            }

            if (alertType) {
              // Create critical result alert
              await pool.query(
                `INSERT INTO critical_result_alerts
                 (lab_order_id, ordering_provider_id, alert_type, result_value)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [id, updatedOrder.ordering_provider, alertType, updateData.result]
              );
            }
          }
        }
      } catch (criticalError) {
        // Log but don't fail the main update
        console.error('Error checking critical result:', criticalError);
      }
    }

    // Audit log
    const authReq = req as any;
    await auditService.log({
      userId: authReq.user?.id,
      action: 'update',
      entityType: 'lab_order',
      entityId: parseInt(id),
      details: updateData
    });

    // Send notification when lab order is completed
    if (updateData.status === 'completed') {
      await notificationService.notifyLabComplete(parseInt(id));

      // Check if all lab orders for this encounter are complete
      const pendingOrders = await pool.query(
        `SELECT COUNT(*) FROM lab_orders
         WHERE encounter_id = $1 AND status NOT IN ('completed', 'cancelled')`,
        [updatedOrder.encounter_id]
      );

      // If no more pending lab orders, auto-route patient back to nurse
      if (parseInt(pendingOrders.rows[0].count) === 0) {
        await notificationService.autoRouteToNurse(updatedOrder.encounter_id, 'lab');
      }
    }

    res.json({
      message: 'Lab order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Update lab order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Imaging Orders
export const createImagingOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const currentUserId = authReq.user?.id;
    const currentUserRole = authReq.user?.role;

    const { patient_id, encounter_id, imaging_type, study_type, body_part, priority, clinical_indication, notes, ordering_provider_id } = req.body;

    // Determine the ordering provider:
    // - If nurse provides ordering_provider_id, use that (ordering on behalf of doctor)
    // - Otherwise, use current user (doctor ordering for themselves)
    let orderingProvider = currentUserId;
    if (currentUserRole === 'nurse' && ordering_provider_id) {
      orderingProvider = ordering_provider_id;
    }

    // Support both imaging_type (doctor) and study_type (nurse form)
    const studyType = imaging_type || study_type;

    const result = await pool.query(
      `INSERT INTO imaging_orders (
        patient_id, encounter_id, ordering_provider, imaging_type, body_part, priority, clinical_indication, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [patient_id, encounter_id, orderingProvider, studyType, body_part, priority || 'routine', clinical_indication, notes]
    );

    // Update billing
    await pool.query(
      `UPDATE invoices
       SET subtotal = subtotal + 150.00,
           total_amount = total_amount + 150.00
       WHERE encounter_id = $1`,
      [encounter_id]
    );

    const order = result.rows[0];

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
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE imaging_orders SET ${fields}, updated_at = CURRENT_TIMESTAMP
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

    // Send notification when imaging order is completed
    if (updateData.status === 'completed') {
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
    } = req.body;

    const result = await pool.query(
      `INSERT INTO pharmacy_orders (
        patient_id, encounter_id, ordering_provider, medication_name,
        dosage, frequency, route, quantity, refills, days_supply, priority, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      ]
    );

    // Update billing
    await pool.query(
      `UPDATE invoices
       SET subtotal = subtotal + 25.00,
           total_amount = total_amount + 25.00
       WHERE encounter_id = $1`,
      [encounter_id]
    );

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
        ) as primary_diagnosis
      FROM pharmacy_orders po
      LEFT JOIN users u ON po.ordering_provider = u.id
      LEFT JOIN encounters e ON po.encounter_id = e.id
      LEFT JOIN patients p ON po.patient_id = p.id
      LEFT JOIN users pu ON p.user_id = pu.id
      LEFT JOIN users du ON po.dispensed_by = du.id
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
    const { id } = req.params;
    const updateData = req.body;
    const authReq = req as any;

    // If dispensing, track who dispensed
    if (updateData.status === 'dispensed' && authReq.user?.id) {
      updateData.dispensed_by = authReq.user.id;
    }

    // If marking as ready, track who prepared it
    if (updateData.status === 'ready' && authReq.user?.id) {
      updateData.prepared_by = authReq.user.id;
    }

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE pharmacy_orders SET ${fields}, updated_at = CURRENT_TIMESTAMP
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
      await notificationService.notifyPharmacyDispensed(parseInt(id));

      const quantity = parseInt(updatedOrder.quantity) || 1;

      // Add medication cost to patient invoice AND deduct from inventory using FEFO
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get medication from inventory
        const inventoryResult = await client.query(
          `SELECT id, selling_price, quantity_on_hand FROM pharmacy_inventory
           WHERE medication_name ILIKE $1 LIMIT 1`,
          [updatedOrder.medication_name]
        );

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

            // Add medication as invoice item
            await client.query(
              `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category)
               VALUES ($1, $2, $3, $4, $5, 'medication')`,
              [invoiceId, `${updatedOrder.medication_name} (${updatedOrder.dosage})`, quantity, unitPrice, totalPrice]
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

          await client.query('COMMIT');
        } else {
          await client.query('ROLLBACK');
          console.warn(`Medication not found in inventory: ${updatedOrder.medication_name}`);
        }
      } catch (invoiceError) {
        await client.query('ROLLBACK');
        console.error('Error processing dispense (invoice/inventory):', invoiceError);
        // Don't fail the dispense if invoice/inventory update fails, but log it
      } finally {
        client.release();
      }

      // Check if all pharmacy orders for this encounter are complete
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

// Process a refill - creates a new order from an existing prescription and decrements refills
export const processRefill = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { id } = req.params; // Original order ID
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
        `SELECT io.*, u.first_name || ' ' || u.last_name as ordering_provider_name
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

    // Get lab orders with completed status or results in the last 48 hours
    const labAlerts = await pool.query(
      `SELECT lo.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        e.room_number
       FROM lab_orders lo
       LEFT JOIN patients p ON lo.patient_id = p.id
       LEFT JOIN encounters e ON lo.encounter_id = e.id
       WHERE lo.ordering_provider = $1
         AND lo.status = 'completed'
         AND lo.completed_date >= NOW() - INTERVAL '48 hours'
       ORDER BY lo.completed_date DESC
       LIMIT 20`,
      [doctorId]
    );

    // Get imaging orders with completed status or results in the last 48 hours
    const imagingAlerts = await pool.query(
      `SELECT io.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        e.room_number
       FROM imaging_orders io
       LEFT JOIN patients p ON io.patient_id = p.id
       LEFT JOIN encounters e ON io.encounter_id = e.id
       WHERE io.ordering_provider = $1
         AND io.status = 'completed'
         AND io.completed_date >= NOW() - INTERVAL '48 hours'
       ORDER BY io.completed_date DESC
       LIMIT 20`,
      [doctorId]
    );

    // Get pharmacy orders that are ready/dispensed in the last 48 hours
    const pharmacyAlerts = await pool.query(
      `SELECT po.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        e.room_number
       FROM pharmacy_orders po
       LEFT JOIN patients p ON po.patient_id = p.id
       LEFT JOIN encounters e ON po.encounter_id = e.id
       WHERE po.ordering_provider = $1
         AND po.status IN ('ready', 'dispensed')
         AND po.updated_at >= NOW() - INTERVAL '48 hours'
       ORDER BY po.updated_at DESC
       LIMIT 20`,
      [doctorId]
    );

    res.json({
      lab_alerts: labAlerts.rows,
      imaging_alerts: imagingAlerts.rows,
      pharmacy_alerts: pharmacyAlerts.rows,
      total_alerts: labAlerts.rows.length + imagingAlerts.rows.length + pharmacyAlerts.rows.length,
    });
  } catch (error) {
    console.error('Get doctor alerts error:', error);
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
    const { id } = req.params;
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
          dosage, frequency, route, quantity, priority, notes, status, dispensed_by, dispensed_date
        ) VALUES ($1, $2, $3, $4, $5, $6, 'oral', $7, 'routine', $8, 'dispensed', $9, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          patient_id,
          encounter_id,
          dispensed_by, // Pharmacist is the ordering provider for OTC
          inventoryItem.medication_name,
          med.dosage || '',
          med.frequency || '',
          med.quantity,
          med.instructions || 'OTC Walk-in',
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
      const med = medicationList.find((m: any) => m.medication_name === order.medication_name || m.inventory_id);
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
