import { Request, Response } from 'express';
import pool from '../database/db';
import notificationService from '../services/notificationService';
import auditService from '../services/auditService';

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
      priority,
      notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO pharmacy_orders (
        patient_id, encounter_id, ordering_provider, medication_name,
        dosage, frequency, route, quantity, refills, priority, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        p.patient_number,
        p.allergies as patient_allergies,
        pu.first_name || ' ' || pu.last_name as patient_name
      FROM pharmacy_orders po
      LEFT JOIN users u ON po.ordering_provider = u.id
      LEFT JOIN encounters e ON po.encounter_id = e.id
      LEFT JOIN patients p ON po.patient_id = p.id
      LEFT JOIN users pu ON p.user_id = pu.id
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
    const authReq = req as any;
    await auditService.log({
      userId: authReq.user?.id,
      action: 'update',
      entityType: 'pharmacy_order',
      entityId: parseInt(id),
      details: updateData
    });

    // Send notification when pharmacy order is dispensed
    if (updateData.status === 'dispensed') {
      await notificationService.notifyPharmacyDispensed(parseInt(id));

      // Check if all pharmacy orders for this encounter are complete
      const pendingOrders = await pool.query(
        `SELECT COUNT(*) FROM pharmacy_orders
         WHERE encounter_id = $1 AND status NOT IN ('dispensed', 'cancelled')`,
        [updatedOrder.encounter_id]
      );

      // If no more pending pharmacy orders, auto-route patient back to nurse
      if (parseInt(pendingOrders.rows[0].count) === 0) {
        await notificationService.autoRouteToNurse(updatedOrder.encounter_id, 'pharmacy');
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
