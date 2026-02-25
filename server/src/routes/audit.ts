import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import auditService from '../services/auditService';

const router = Router();

// Get audit logs for an entity (requires admin role)
router.get('/entity/:type/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const { limit } = req.query;

    const logs = await auditService.getEntityLogs(type, parseInt(id), parseInt(limit as string) || 50);
    res.json({ logs });
  } catch (error) {
    console.error('Error getting entity audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Get audit logs for current user
router.get('/my-activity', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { limit } = req.query;

    const logs = await auditService.getUserLogs(userId, parseInt(limit as string) || 100);
    res.json({ logs });
  } catch (error) {
    console.error('Error getting user audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Get recent audit logs (admin only)
router.get('/recent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { limit } = req.query;
    const logs = await auditService.getRecentLogs(parseInt(limit as string) || 100);
    res.json({ logs });
  } catch (error) {
    console.error('Error getting recent audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

export default router;
