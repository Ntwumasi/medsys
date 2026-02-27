import { Request, Response } from 'express';
import pool from '../database/db';

// Route patient to department
export const routePatientToDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const routed_by = authReq.user?.id;

    const { encounter_id, patient_id, department, priority, notes } = req.body;

    if (!encounter_id || !patient_id || !department) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Validate department
    const validDepartments = ['lab', 'pharmacy', 'imaging', 'receptionist'];
    if (!validDepartments.includes(department)) {
      res.status(400).json({ error: 'Invalid department' });
      return;
    }

    // Create routing entry
    const result = await pool.query(
      `INSERT INTO department_routing (
        encounter_id, patient_id, department, priority, notes, routed_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [encounter_id, patient_id, department, priority || 'routine', notes, routed_by]
    );

    // Update encounter routing status
    await pool.query(
      `UPDATE encounters
       SET routing_status = 'pending_routing', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [encounter_id]
    );

    // Mark doctor notifications as read for this encounter (nurse completed the task)
    await pool.query(
      `UPDATE alerts
       SET is_read = true
       WHERE encounter_id = $1
         AND alert_type = 'patient_ready'
         AND is_read = false`,
      [encounter_id]
    );

    res.status(201).json({
      message: `Patient routed to ${department} successfully`,
      routing: result.rows[0],
    });
  } catch (error) {
    console.error('Route patient to department error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get department queue
export const getDepartmentQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department } = req.params;
    const { status } = req.query;

    let query = `
      SELECT dr.*,
        p.patient_number,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        e.encounter_number,
        e.chief_complaint,
        r.room_number,
        u_routed.first_name || ' ' || u_routed.last_name as routed_by_name
      FROM department_routing dr
      LEFT JOIN patients p ON dr.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN encounters e ON dr.encounter_id = e.id
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN users u_routed ON dr.routed_by = u_routed.id
      WHERE dr.department = $1
    `;

    const params: any[] = [department];

    if (status) {
      query += ' AND dr.status = $2';
      params.push(status);
    } else {
      query += ' AND dr.status IN ($2, $3)';
      params.push('pending', 'in-progress');
    }

    query += ' ORDER BY dr.priority DESC, dr.routed_at ASC';

    const result = await pool.query(query, params);

    res.json({
      department,
      queue: result.rows,
    });
  } catch (error) {
    console.error('Get department queue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update routing status
export const updateRoutingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    let updateFields = 'status = $1, updated_at = CURRENT_TIMESTAMP';
    const params: any[] = [status];

    if (status === 'in-progress') {
      updateFields += ', started_at = CURRENT_TIMESTAMP';
    } else if (status === 'completed') {
      updateFields += ', completed_at = CURRENT_TIMESTAMP';
    }

    const result = await pool.query(
      `UPDATE department_routing
       SET ${updateFields}
       WHERE id = $2
       RETURNING *`,
      [...params, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Routing entry not found' });
      return;
    }

    // Check if all department routings for this encounter are completed
    const routing = result.rows[0];
    const checkResult = await pool.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM department_routing
       WHERE encounter_id = $1`,
      [routing.encounter_id]
    );

    const { total, completed } = checkResult.rows[0];

    // If all routings are complete, update encounter status
    if (parseInt(total) === parseInt(completed)) {
      await pool.query(
        `UPDATE encounters
         SET routing_status = 'routing_complete', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [routing.encounter_id]
      );
    }

    res.json({
      message: 'Routing status updated successfully',
      routing: result.rows[0],
    });
  } catch (error) {
    console.error('Update routing status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get patient routing history
export const getPatientRoutingHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const result = await pool.query(
      `SELECT dr.*,
        u_routed.first_name || ' ' || u_routed.last_name as routed_by_name
       FROM department_routing dr
       LEFT JOIN users u_routed ON dr.routed_by = u_routed.id
       WHERE dr.encounter_id = $1
       ORDER BY dr.routed_at ASC`,
      [encounter_id]
    );

    res.json({
      routings: result.rows,
    });
  } catch (error) {
    console.error('Get patient routing history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Cancel routing
export const cancelRouting = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE department_routing
       SET status = 'cancelled',
           notes = CASE
             WHEN notes IS NULL THEN $1
             ELSE notes || ' | Cancelled: ' || $1
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reason || 'No reason provided', id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Routing entry not found' });
      return;
    }

    res.json({
      message: 'Routing cancelled successfully',
      routing: result.rows[0],
    });
  } catch (error) {
    console.error('Cancel routing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
