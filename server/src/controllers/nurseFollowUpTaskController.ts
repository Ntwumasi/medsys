import { Request, Response } from 'express';
import pool from '../database/db';

// Helper: get next Monday or Thursday (not today)
export function getNextMonOrThu(from: Date = new Date()): string {
  const day = from.getDay(); // 0=Sun..6=Sat
  const daysToMon = (1 - day + 7) % 7 || 7;
  const daysToThu = (4 - day + 7) % 7 || 7;
  const daysToNext = Math.min(daysToMon, daysToThu);
  const next = new Date(from);
  next.setDate(from.getDate() + daysToNext);
  return next.toISOString().split('T')[0];
}

// Helper: get next Mon or Thu from a given date (for rollover)
function getNextMonOrThuAfter(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return getNextMonOrThu(d);
}

// GET /nurse/follow-up-tasks?type=follow_up|review
export const getFollowUpTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.query;
    const taskType = type === 'review' ? 'review' : 'follow_up';

    // Auto-rollover: bump missed pending follow_up tasks to next Mon/Thu
    if (taskType === 'follow_up') {
      const missed = await pool.query(
        `SELECT id, scheduled_date FROM nurse_follow_up_tasks
         WHERE type = 'follow_up' AND status = 'pending' AND scheduled_date < CURRENT_DATE`
      );
      for (const task of missed.rows) {
        const newDate = getNextMonOrThuAfter(task.scheduled_date.toISOString().split('T')[0]);
        await pool.query(
          'UPDATE nurse_follow_up_tasks SET scheduled_date = $1 WHERE id = $2',
          [newDate, task.id]
        );
      }
    }

    let query = `
      SELECT nft.*,
        p.patient_number,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_patient.phone as patient_phone,
        e.encounter_number,
        e.chief_complaint,
        e.encounter_date,
        e.discharged_at,
        u_doctor.first_name || ' ' || u_doctor.last_name as doctor_name,
        u_caller.first_name || ' ' || u_caller.last_name as called_by_name,
        u_reviewer.first_name || ' ' || u_reviewer.last_name as review_requested_by_name
      FROM nurse_follow_up_tasks nft
      LEFT JOIN patients p ON nft.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN encounters e ON nft.encounter_id = e.id
      LEFT JOIN users u_doctor ON e.provider_id = u_doctor.id
      LEFT JOIN users u_caller ON nft.called_by = u_caller.id
      LEFT JOIN users u_reviewer ON nft.review_requested_by = u_reviewer.id
      WHERE nft.type = $1 AND nft.status = 'pending'
      ORDER BY nft.scheduled_date ASC
    `;

    const result = await pool.query(query, [taskType]);

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    const grouped = {
      overdue: [] as any[],
      due_today: [] as any[],
      upcoming: [] as any[],
      later: [] as any[],
    };

    for (const row of result.rows) {
      const sd = row.scheduled_date.toISOString().split('T')[0];
      if (sd < today) grouped.overdue.push(row);
      else if (sd === today) grouped.due_today.push(row);
      else if (sd <= nextWeekStr) grouped.upcoming.push(row);
      else grouped.later.push(row);
    }

    res.json({
      tasks: grouped,
      counts: {
        overdue: grouped.overdue.length,
        due_today: grouped.due_today.length,
        upcoming: grouped.upcoming.length,
        later: grouped.later.length,
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error('Get follow-up tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch follow-up tasks' });
  }
};

// POST /nurse/follow-up-tasks/complete
export const completeTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const calledBy = authReq.user?.id;
    const { task_id, call_status, notes } = req.body;

    if (!task_id || !call_status) {
      res.status(400).json({ error: 'task_id and call_status are required' });
      return;
    }

    const result = await pool.query(
      `UPDATE nurse_follow_up_tasks
       SET status = 'completed', call_status = $1, notes = $2,
           called_by = $3, completed_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [call_status, notes || null, calledBy, task_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = result.rows[0];

    // Also log in nurse_call_logs for unified history
    try {
      await pool.query(
        `INSERT INTO nurse_call_logs (encounter_id, patient_id, called_by, call_status, patient_status_notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [task.encounter_id, task.patient_id, calledBy, call_status, notes]
      );
    } catch (logError) {
      console.error('Error logging to nurse_call_logs:', logError);
      // Don't fail the main operation
    }

    res.json({ message: 'Task completed', task: result.rows[0] });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
};

// GET /nurse/follow-up-tasks/due — lightweight for dashboard card
export const getDueTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT nft.id, nft.type, nft.scheduled_date, nft.review_reason,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_patient.phone as patient_phone,
        p.patient_number
       FROM nurse_follow_up_tasks nft
       LEFT JOIN patients p ON nft.patient_id = p.id
       LEFT JOIN users u_patient ON p.user_id = u_patient.id
       WHERE nft.status = 'pending'
         AND nft.scheduled_date <= CURRENT_DATE + INTERVAL '1 day'
       ORDER BY nft.scheduled_date ASC, nft.type ASC`
    );

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const dueToday = result.rows.filter(r => r.scheduled_date.toISOString().split('T')[0] <= today);
    const dueTomorrow = result.rows.filter(r => r.scheduled_date.toISOString().split('T')[0] === tomorrowStr);

    res.json({
      due_today: dueToday,
      due_tomorrow: dueTomorrow,
      total: dueToday.length + dueTomorrow.length,
    });
  } catch (error) {
    console.error('Get due tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch due tasks' });
  }
};
