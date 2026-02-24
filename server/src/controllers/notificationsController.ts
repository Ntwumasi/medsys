import { Request, Response } from 'express';
import pool from '../database/db';

// Get notifications for the logged-in user
export const getUserNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { limit = 50, unread_only = 'false' } = req.query;

    let query = `
      SELECT id, type, message, metadata, is_read, created_at
      FROM user_notifications
      WHERE user_id = $1
    `;

    if (unread_only === 'true') {
      query += ` AND is_read = false`;
    }

    query += ` ORDER BY created_at DESC LIMIT $2`;

    const result = await pool.query(query, [userId, parseInt(limit as string)]);

    // Also get unread count
    const countResult = await pool.query(
      `SELECT COUNT(*) as unread_count FROM user_notifications WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    res.json({
      notifications: result.rows,
      unread_count: parseInt(countResult.rows[0].unread_count)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// Create a notification for a user
export const createNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, type = 'info', message, metadata = {} } = req.body;

    if (!user_id || !message) {
      res.status(400).json({ error: 'user_id and message are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO user_notifications (user_id, type, message, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, type, message, JSON.stringify(metadata)]
    );

    res.json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
};

// Create notification for the currently logged in user (self-notification)
export const createSelfNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { type = 'info', message, metadata = {} } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO user_notifications (user_id, type, message, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, type, message, JSON.stringify(metadata)]
    );

    res.json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Create self notification error:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
};

// Mark a notification as read
export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const result = await pool.query(
      `UPDATE user_notifications
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

// Mark all notifications as read for the user
export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    await pool.query(
      `UPDATE user_notifications
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
};

// Delete a notification
export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM user_notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

// Clear all notifications for the user
export const clearAllNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    await pool.query(
      `DELETE FROM user_notifications WHERE user_id = $1`,
      [userId]
    );

    res.json({ message: 'All notifications cleared' });
  } catch (error) {
    console.error('Clear all notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
};

// Helper function to create a notification (for internal use in other controllers)
export const createNotificationInternal = async (
  userId: number,
  type: 'info' | 'success' | 'warning' | 'error',
  message: string,
  metadata: Record<string, any> = {}
): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO user_notifications (user_id, type, message, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userId, type, message, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('Create notification internal error:', error);
    // Don't throw - notifications shouldn't break main functionality
  }
};
