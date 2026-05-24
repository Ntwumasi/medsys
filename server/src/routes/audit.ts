import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import auditService from '../services/auditService';

const router = Router();

// SECURITY: audit logs contain who-saw-what PHI traces. Restrict viewers
// to admin only. /my-activity is the only endpoint open to a normal user
// (scoped to themselves by the controller).
router.get('/entity/:type/:id', authenticateToken, authorizeRoles('admin'), async (req: Request, res: Response) => {
  try {
    const type = req.params.type as string;
    const id = req.params.id as string;
    const limit = req.query.limit as string;

    const logs = await auditService.getEntityLogs(type, parseInt(id), parseInt(limit) || 50);
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

// Get recent audit logs (admin only) with pagination and filtering.
// Uses authorizeRoles which honors is_super_admin — the previous inline
// role !== 'admin' check incorrectly blocked super-admin sessions whose
// JWT role is something else (doctor, etc.).
router.get('/recent', authenticateToken, authorizeRoles('admin'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, action, entity_type } = req.query;
    const result = await auditService.getRecentLogs(
      parseInt(limit as string) || 25,
      parseInt(offset as string) || 0,
      action as string,
      entity_type as string
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting recent audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

export default router;
