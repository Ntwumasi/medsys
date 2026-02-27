import pool from '../database/db';
import { Response } from 'express';

// Store active SSE connections by user ID
const sseConnections: Map<number, Response[]> = new Map();

export interface NotificationPayload {
  userId: number;
  type: 'lab_complete' | 'imaging_complete' | 'pharmacy_dispensed' | 'patient_alert' | 'order_created' | 'encounter_complete' | 'stat_order';
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
}

export const notificationService = {
  /**
   * Add an SSE connection for a user
   */
  addConnection(userId: number, res: Response): void {
    if (!sseConnections.has(userId)) {
      sseConnections.set(userId, []);
    }
    sseConnections.get(userId)!.push(res);
    console.log(`SSE: User ${userId} connected. Total connections: ${sseConnections.get(userId)!.length}`);
  },

  /**
   * Remove an SSE connection for a user
   */
  removeConnection(userId: number, res: Response): void {
    const connections = sseConnections.get(userId);
    if (connections) {
      const index = connections.indexOf(res);
      if (index > -1) {
        connections.splice(index, 1);
      }
      if (connections.length === 0) {
        sseConnections.delete(userId);
      }
      console.log(`SSE: User ${userId} disconnected`);
    }
  },

  /**
   * Send a real-time notification to a user
   */
  async send(notification: NotificationPayload): Promise<void> {
    try {
      // Save to database
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          notification.userId,
          notification.type,
          notification.title,
          notification.message,
          notification.entityType || null,
          notification.entityId || null,
        ]
      );

      // Send via SSE if user is connected
      const connections = sseConnections.get(notification.userId);
      if (connections && connections.length > 0) {
        const data = JSON.stringify({
          type: notification.type,
          title: notification.title,
          message: notification.message,
          entityType: notification.entityType,
          entityId: notification.entityId,
          timestamp: new Date().toISOString(),
        });

        connections.forEach((res) => {
          try {
            res.write(`data: ${data}\n\n`);
          } catch (e) {
            console.error('Failed to send SSE message:', e);
          }
        });
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  },

  /**
   * Send notification to all users with a specific role
   */
  async sendToRole(role: string, notification: Omit<NotificationPayload, 'userId'>): Promise<void> {
    try {
      const result = await pool.query('SELECT id FROM users WHERE role = $1', [role]);
      for (const user of result.rows) {
        await this.send({ ...notification, userId: user.id });
      }
    } catch (error) {
      console.error('Failed to send role notification:', error);
    }
  },

  /**
   * Get unread notifications for a user
   */
  async getUnread(userId: number): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1 AND is_read = FALSE
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Mark notifications as read
   */
  async markAsRead(userId: number, notificationIds?: number[]): Promise<void> {
    if (notificationIds && notificationIds.length > 0) {
      await pool.query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND id = ANY($2)`,
        [userId, notificationIds]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
        [userId]
      );
    }
  },

  /**
   * Notify all doctors when lab results are ready (role-based)
   */
  async notifyLabComplete(orderId: number): Promise<void> {
    const result = await pool.query(
      `SELECT lo.*, p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name
       FROM lab_orders lo
       JOIN patients p ON lo.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE lo.id = $1`,
      [orderId]
    );

    if (result.rows.length > 0) {
      const order = result.rows[0];
      await this.sendToRole('doctor', {
        type: 'lab_complete',
        title: 'Lab Results Ready',
        message: `${order.test_name} results ready for ${order.patient_name} (${order.patient_number})`,
        entityType: 'lab_order',
        entityId: orderId,
      });
    }
  },

  /**
   * Notify all doctors when imaging results are ready (role-based)
   */
  async notifyImagingComplete(orderId: number): Promise<void> {
    const result = await pool.query(
      `SELECT io.*, p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name
       FROM imaging_orders io
       JOIN patients p ON io.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE io.id = $1`,
      [orderId]
    );

    if (result.rows.length > 0) {
      const order = result.rows[0];
      await this.sendToRole('doctor', {
        type: 'imaging_complete',
        title: 'Imaging Results Ready',
        message: `${order.imaging_type} (${order.body_part || 'N/A'}) results ready for ${order.patient_name}`,
        entityType: 'imaging_order',
        entityId: orderId,
      });
    }
  },

  /**
   * Notify nurses and doctors when medication is dispensed (role-based)
   */
  async notifyPharmacyDispensed(orderId: number): Promise<void> {
    const result = await pool.query(
      `SELECT po.*, p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name
       FROM pharmacy_orders po
       JOIN patients p ON po.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE po.id = $1`,
      [orderId]
    );

    if (result.rows.length > 0) {
      const order = result.rows[0];
      // Notify all nurses that medication is ready for pickup
      await this.sendToRole('nurse', {
        type: 'pharmacy_dispensed',
        title: 'Medication Ready',
        message: `${order.medication_name} dispensed for ${order.patient_name} (${order.patient_number})`,
        entityType: 'pharmacy_order',
        entityId: orderId,
      });

      // Notify all doctors that medication has been dispensed
      await this.sendToRole('doctor', {
        type: 'pharmacy_dispensed',
        title: 'Medication Dispensed',
        message: `${order.medication_name} dispensed for ${order.patient_name} (${order.patient_number})`,
        entityType: 'pharmacy_order',
        entityId: orderId,
      });
    }
  },

  /**
   * Notify all nurses when an order is created (role-based)
   */
  async notifyNurseOrderCreated(orderType: 'lab' | 'imaging' | 'pharmacy', orderId: number): Promise<void> {
    const tableMap: Record<string, string> = {
      lab: 'lab_orders',
      imaging: 'imaging_orders',
      pharmacy: 'pharmacy_orders',
    };

    const table = tableMap[orderType];
    if (!table) return;

    try {
      const result = await pool.query(
        `SELECT o.*, p.patient_number,
                u.first_name || ' ' || u.last_name as patient_name
         FROM ${table} o
         JOIN patients p ON o.patient_id = p.id
         JOIN users u ON p.user_id = u.id
         WHERE o.id = $1`,
        [orderId]
      );

      if (result.rows.length > 0) {
        const order = result.rows[0];
        const orderName = orderType === 'lab' ? order.test_name :
                         orderType === 'imaging' ? `${order.imaging_type || order.study_type} ${order.body_part || ''}`.trim() :
                         order.medication_name;

        // Notify all nurses about new order
        await this.sendToRole('nurse', {
          type: 'order_created',
          title: `New ${orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order`,
          message: `${orderName} ordered for ${order.patient_name} (${order.patient_number})`,
          entityType: `${orderType}_order`,
          entityId: orderId,
        });
      }
    } catch (error) {
      console.error(`Failed to notify nurses of ${orderType} order:`, error);
    }
  },

  /**
   * Auto-route patient back to nurse when department completes work (role-based)
   */
  async autoRouteToNurse(encounterId: number, fromDepartment: string): Promise<void> {
    try {
      // Mark the current department routing as completed
      await pool.query(
        `UPDATE department_routing
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE encounter_id = $1 AND department = $2 AND status = 'pending'`,
        [encounterId, fromDepartment]
      );

      // Get encounter info for notification
      const encounterResult = await pool.query(
        `SELECT p.patient_number, u.first_name || ' ' || u.last_name as patient_name
         FROM encounters e
         JOIN patients p ON e.patient_id = p.id
         JOIN users u ON p.user_id = u.id
         WHERE e.id = $1`,
        [encounterId]
      );

      if (encounterResult.rows.length > 0) {
        const encounter = encounterResult.rows[0];
        const departmentNames: Record<string, string> = {
          lab: 'Lab',
          imaging: 'Imaging',
          pharmacy: 'Pharmacy',
        };

        // Notify all nurses that patient is returning
        await this.sendToRole('nurse', {
          type: 'patient_alert',
          title: 'Patient Returning',
          message: `${encounter.patient_name} (${encounter.patient_number}) completed ${departmentNames[fromDepartment] || fromDepartment}`,
          entityType: 'encounter',
          entityId: encounterId,
        });
      }
    } catch (error) {
      console.error('Failed to auto-route to nurse:', error);
    }
  },

  /**
   * Notify all nurses when a patient checks in (role-based)
   */
  async notifyPatientCheckedIn(patientName: string, patientNumber: string, encounterId: number): Promise<void> {
    try {
      await this.sendToRole('nurse', {
        type: 'patient_alert',
        title: 'New Patient Checked In',
        message: `${patientName} (${patientNumber}) has checked in`,
        entityType: 'encounter',
        entityId: encounterId,
      });
    } catch (error) {
      console.error('Failed to notify patient check-in:', error);
    }
  },

  /**
   * Notify all receptionists when a patient is ready for checkout (role-based)
   */
  async notifyReadyForCheckout(patientName: string, patientNumber: string, encounterId: number): Promise<void> {
    try {
      await this.sendToRole('receptionist', {
        type: 'patient_alert',
        title: 'Patient Ready for Checkout',
        message: `${patientName} (${patientNumber}) is ready for checkout`,
        entityType: 'encounter',
        entityId: encounterId,
      });
    } catch (error) {
      console.error('Failed to notify ready for checkout:', error);
    }
  },

  /**
   * Notify all receptionists when a patient has been checked out (role-based)
   */
  async notifyPatientCheckedOut(patientName: string, patientNumber: string): Promise<void> {
    try {
      await this.sendToRole('receptionist', {
        type: 'patient_alert',
        title: 'Patient Checked Out',
        message: `${patientName} (${patientNumber}) has been checked out`,
        entityType: 'patient',
        entityId: 0,
      });
    } catch (error) {
      console.error('Failed to notify patient checkout:', error);
    }
  },

  /**
   * Notify about STAT orders
   */
  async notifyStatOrder(orderType: string, orderId: number, targetRole: string): Promise<void> {
    const tableMap: Record<string, string> = {
      lab: 'lab_orders',
      imaging: 'imaging_orders',
      pharmacy: 'pharmacy_orders',
    };

    const table = tableMap[orderType];
    if (!table) return;

    const result = await pool.query(
      `SELECT o.*, p.patient_number, u.first_name || ' ' || u.last_name as patient_name
       FROM ${table} o
       JOIN patients p ON o.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (result.rows.length > 0) {
      const order = result.rows[0];
      const orderName = orderType === 'lab' ? order.test_name :
                       orderType === 'imaging' ? `${order.imaging_type} ${order.body_part}` :
                       order.medication_name;

      await this.sendToRole(targetRole, {
        type: 'stat_order',
        title: '🚨 STAT Order',
        message: `STAT ${orderType} order: ${orderName} for ${order.patient_name} (${order.patient_number})`,
        entityType: `${orderType}_order`,
        entityId: orderId,
      });
    }
  },
};

export default notificationService;
