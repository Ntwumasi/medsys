import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import notificationService from '../services/notificationService';
import jwt from 'jsonwebtoken';

const router = Router();

// SSE endpoint for real-time notifications
// Note: EventSource doesn't support custom headers, so we accept token via query param
router.get('/stream', (req: Request, res: Response) => {
  // Try to get token from query param (for EventSource) or header
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  let userId: number;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    userId = decoded.id || decoded.userId;
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to notification stream' })}\n\n`);

  // Add connection to service
  notificationService.addConnection(userId, res);

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    notificationService.removeConnection(userId, res);
  });
});

// Get unread notifications
router.get('/unread', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const notifications = await notificationService.getUnread(userId);
    res.json({ notifications, count: notifications.length });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notifications as read
router.post('/read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { notificationIds } = req.body;
    await notificationService.markAsRead(userId, notificationIds);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Mark all notifications as read
router.post('/read-all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    await notificationService.markAsRead(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

export default router;
