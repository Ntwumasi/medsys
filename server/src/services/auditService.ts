import pool from '../database/db';

export interface AuditLogEntry {
  userId: number;
  action: 'create' | 'read' | 'update' | 'delete' | 'sign' | 'dispense' | 'complete' | 'cancel';
  entityType: string;
  entityId?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  details?: Record<string, unknown>; // Generic details field for simpler logging
  ipAddress?: string;
  userAgent?: string;
}

export const auditService = {
  /**
   * Log a clinical action to the audit trail
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Use details as newValues if provided (convenience shorthand)
      const newValues = entry.newValues || entry.details;

      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.userId,
          entry.action,
          entry.entityType,
          entry.entityId || null,
          entry.oldValues ? JSON.stringify(entry.oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          entry.ipAddress || null,
          entry.userAgent || null,
        ]
      );
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Don't throw - audit logging should not break the main operation
    }
  },

  /**
   * Get audit logs for a specific entity
   */
  async getEntityLogs(entityType: string, entityId: number, limit = 50): Promise<any[]> {
    const result = await pool.query(
      `SELECT al.*, u.first_name || ' ' || u.last_name as user_name, u.role as user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = $1 AND al.entity_id = $2
       ORDER BY al.created_at DESC
       LIMIT $3`,
      [entityType, entityId, limit]
    );
    return result.rows;
  },

  /**
   * Get audit logs for a specific user
   */
  async getUserLogs(userId: number, limit = 100): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  /**
   * Get recent audit logs (for admin dashboard)
   */
  async getRecentLogs(limit = 100): Promise<any[]> {
    const result = await pool.query(
      `SELECT al.*, u.first_name || ' ' || u.last_name as user_name, u.role as user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },
};

export default auditService;
