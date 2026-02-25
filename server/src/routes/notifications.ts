import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import notificationService from '../services/notificationService';

const router = Router();

// SSE endpoint for real-time notifications
router.get('/stream', authenticateToken, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

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
