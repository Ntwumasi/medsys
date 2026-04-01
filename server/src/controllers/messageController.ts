import { Request, Response } from 'express';
import pool from '../database/db';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
}

// Send a new message
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const senderId = authReq.user?.id;
  const { recipient_id, subject, body } = req.body;

  try {
    if (!senderId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!recipient_id || !body) {
      res.status(400).json({ error: 'Recipient and message body are required' });
      return;
    }

    if (recipient_id === senderId) {
      res.status(400).json({ error: 'Cannot send message to yourself' });
      return;
    }

    // Verify recipient exists
    const recipientCheck = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND is_active = true',
      [recipient_id]
    );

    if (recipientCheck.rows.length === 0) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    // Insert message
    const result = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, subject, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_id, recipient_id, subject, body, read_at, created_at`,
      [senderId, recipient_id, subject || null, body]
    );

    const message = result.rows[0];

    // Get sender info for response
    const senderResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [senderId]
    );

    res.status(201).json({
      message: 'Message sent successfully',
      data: {
        ...message,
        sender_name: `${senderResult.rows[0].first_name} ${senderResult.rows[0].last_name}`,
        recipient_name: `${recipientCheck.rows[0].first_name} ${recipientCheck.rows[0].last_name}`,
      },
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get inbox - conversations grouped by other user
export const getInbox = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get conversations with latest message and unread count
    const result = await pool.query(`
      WITH conversations AS (
        SELECT
          CASE
            WHEN sender_id = $1 THEN recipient_id
            ELSE sender_id
          END AS other_user_id,
          id,
          sender_id,
          recipient_id,
          subject,
          body,
          read_at,
          created_at
        FROM messages
        WHERE sender_id = $1 OR recipient_id = $1
      ),
      latest_messages AS (
        SELECT DISTINCT ON (other_user_id)
          other_user_id,
          id as message_id,
          sender_id,
          subject,
          body,
          read_at,
          created_at
        FROM conversations
        ORDER BY other_user_id, created_at DESC
      ),
      unread_counts AS (
        SELECT
          sender_id as other_user_id,
          COUNT(*) as unread_count
        FROM messages
        WHERE recipient_id = $1 AND read_at IS NULL
        GROUP BY sender_id
      )
      SELECT
        lm.*,
        COALESCE(uc.unread_count, 0) as unread_count,
        u.first_name,
        u.last_name,
        u.role
      FROM latest_messages lm
      JOIN users u ON u.id = lm.other_user_id
      LEFT JOIN unread_counts uc ON uc.other_user_id = lm.other_user_id
      ORDER BY lm.created_at DESC
    `, [userId]);

    res.json({
      conversations: result.rows.map(row => ({
        other_user_id: row.other_user_id,
        other_user_name: `${row.first_name} ${row.last_name}`,
        other_user_role: row.role,
        last_message_id: row.message_id,
        last_message_subject: row.subject,
        last_message_preview: row.body.length > 100 ? row.body.substring(0, 100) + '...' : row.body,
        last_message_sender_id: row.sender_id,
        last_message_at: row.created_at,
        unread_count: parseInt(row.unread_count),
      })),
    });
  } catch (error) {
    console.error('Get inbox error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get message thread with another user
export const getThread = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const { otherUserId } = req.params;

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const otherUserIdNum = parseInt(otherUserId);
    if (isNaN(otherUserIdNum)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Get other user info
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, role FROM users WHERE id = $1',
      [otherUserIdNum]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const otherUser = userResult.rows[0];

    // Get messages between the two users
    const messagesResult = await pool.query(`
      SELECT
        m.id,
        m.sender_id,
        m.recipient_id,
        m.subject,
        m.body,
        m.read_at,
        m.created_at,
        s.first_name as sender_first_name,
        s.last_name as sender_last_name
      FROM messages m
      JOIN users s ON s.id = m.sender_id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2)
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at ASC
    `, [userId, otherUserIdNum]);

    // Mark unread messages as read
    await pool.query(`
      UPDATE messages
      SET read_at = CURRENT_TIMESTAMP
      WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL
    `, [userId, otherUserIdNum]);

    res.json({
      other_user: {
        id: otherUser.id,
        name: `${otherUser.first_name} ${otherUser.last_name}`,
        role: otherUser.role,
      },
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        sender_id: msg.sender_id,
        sender_name: `${msg.sender_first_name} ${msg.sender_last_name}`,
        is_mine: msg.sender_id === userId,
        subject: msg.subject,
        body: msg.body,
        read_at: msg.read_at,
        created_at: msg.created_at,
      })),
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get unread message count
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await pool.query(
      'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND read_at IS NULL',
      [userId]
    );

    res.json({ unread_count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Mark message as read
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const { messageId } = req.params;

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await pool.query(
      `UPDATE messages
       SET read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL
       RETURNING id`,
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Message not found or already read' });
      return;
    }

    res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get list of users that can be messaged (all active staff, not patients)
export const getMessageableUsers = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await pool.query(`
      SELECT id, first_name, last_name, role, username
      FROM users
      WHERE is_active = true
        AND role != 'patient'
        AND id != $1
      ORDER BY first_name, last_name
    `, [userId]);

    res.json({
      users: result.rows.map(user => ({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        username: user.username,
      })),
    });
  } catch (error) {
    console.error('Get messageable users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a message (only sender can delete, soft delete by hiding)
export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const { messageId } = req.params;

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // For now, actually delete the message (only if user is sender or recipient)
    const result = await pool.query(
      `DELETE FROM messages
       WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)
       RETURNING id`,
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
