import type { Response } from 'express';
import pool from '../database/db';

interface AuthRequest {
  user?: { id: number; role: string; username: string };
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
}

// ── Cleanup helper (expires stale ringing calls) ──
async function cleanupStaleCalls(): Promise<void> {
  await pool.query(`
    UPDATE voip_calls SET status = 'missed', ended_at = NOW()
    WHERE status = 'ringing' AND created_at < NOW() - INTERVAL '30 seconds'
  `);
  await pool.query(`
    DELETE FROM voip_signals WHERE created_at < NOW() - INTERVAL '5 minutes'
  `);
}

// ── Presence ──

export const heartbeat = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = (req.body.status as string) || 'online';
    await pool.query(
      `INSERT INTO user_presence (user_id, last_seen, status)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW(), status = $2`,
      [userId, status]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Heartbeat error:', err);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
};

export const getPresence = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.role, p.status, p.last_seen
      FROM user_presence p
      JOIN users u ON u.id = p.user_id
      WHERE u.is_active = true
        AND p.last_seen > NOW() - INTERVAL '60 seconds'
      ORDER BY u.first_name, u.last_name
    `);
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get presence error:', err);
    res.status(500).json({ error: 'Failed to get presence' });
  }
};

// ── Call Lifecycle ──

export const createCall = async (req: AuthRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const calleeId = req.body.callee_id as number;
    const offer = req.body.offer as string;

    if (!calleeId || !offer) {
      return res.status(400).json({ error: 'callee_id and offer are required' });
    }
    if (calleeId === callerId) {
      return res.status(400).json({ error: 'Cannot call yourself' });
    }

    // Check callee is online
    const presenceCheck = await pool.query(
      `SELECT 1 FROM user_presence WHERE user_id = $1 AND last_seen > NOW() - INTERVAL '60 seconds'`,
      [calleeId]
    );
    if (presenceCheck.rows.length === 0) {
      return res.status(409).json({ error: 'User is not online' });
    }

    // Check neither party is already in a call
    const busyCheck = await pool.query(
      `SELECT id FROM voip_calls
       WHERE status IN ('ringing', 'active')
         AND (caller_id = $1 OR callee_id = $1 OR caller_id = $2 OR callee_id = $2)
       LIMIT 1`,
      [callerId, calleeId]
    );
    if (busyCheck.rows.length > 0) {
      return res.status(409).json({ error: 'User is on another call' });
    }

    // Create call record
    const callResult = await pool.query(
      `INSERT INTO voip_calls (caller_id, callee_id, status)
       VALUES ($1, $2, 'ringing') RETURNING id, status, created_at`,
      [callerId, calleeId]
    );
    const call = callResult.rows[0];

    // Store SDP offer
    await pool.query(
      `INSERT INTO voip_signals (call_id, from_user, type, payload)
       VALUES ($1, $2, 'offer', $3)`,
      [call.id, callerId, offer]
    );

    // Update caller presence to in_call
    await pool.query(
      `UPDATE user_presence SET status = 'in_call' WHERE user_id = $1`,
      [callerId]
    );

    res.json({ call: { id: call.id, status: call.status, callee_id: calleeId, created_at: call.created_at } });
  } catch (err) {
    console.error('Create call error:', err);
    res.status(500).json({ error: 'Failed to create call' });
  }
};

export const getIncoming = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Run cleanup for stale ringing calls
    await cleanupStaleCalls();

    const result = await pool.query(`
      SELECT c.id, c.caller_id, c.status, c.created_at,
             s.payload as offer_sdp,
             u.first_name, u.last_name, u.role
      FROM voip_calls c
      JOIN voip_signals s ON s.call_id = c.id AND s.type = 'offer'
      JOIN users u ON u.id = c.caller_id
      WHERE c.callee_id = $1
        AND c.status = 'ringing'
        AND c.created_at > NOW() - INTERVAL '30 seconds'
      ORDER BY c.created_at DESC
      LIMIT 1
    `, [userId]);

    res.json({ call: result.rows[0] || null });
  } catch (err) {
    console.error('Get incoming error:', err);
    res.status(500).json({ error: 'Failed to check incoming calls' });
  }
};

export const answerCall = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const callId = parseInt(req.params.callId);
    const answer = req.body.answer as string;

    if (!answer) {
      return res.status(400).json({ error: 'answer SDP is required' });
    }

    const result = await pool.query(
      `UPDATE voip_calls SET status = 'active', started_at = NOW()
       WHERE id = $1 AND callee_id = $2 AND status = 'ringing'
       RETURNING id, status, started_at, caller_id`,
      [callId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found or already answered' });
    }

    const call = result.rows[0];

    // Store SDP answer
    await pool.query(
      `INSERT INTO voip_signals (call_id, from_user, type, payload)
       VALUES ($1, $2, 'answer', $3)`,
      [callId, userId, answer]
    );

    // Update both users' presence
    await pool.query(
      `UPDATE user_presence SET status = 'in_call' WHERE user_id IN ($1, $2)`,
      [userId, call.caller_id]
    );

    res.json({ call: { id: call.id, status: call.status, started_at: call.started_at } });
  } catch (err) {
    console.error('Answer call error:', err);
    res.status(500).json({ error: 'Failed to answer call' });
  }
};

export const declineCall = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const callId = parseInt(req.params.callId);

    const result = await pool.query(
      `UPDATE voip_calls SET status = 'declined', ended_at = NOW()
       WHERE id = $1 AND callee_id = $2 AND status = 'ringing'
       RETURNING id, status, caller_id`,
      [callId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Reset caller presence
    await pool.query(
      `UPDATE user_presence SET status = 'online' WHERE user_id = $1`,
      [result.rows[0].caller_id]
    );

    // Cleanup signals
    await pool.query(`DELETE FROM voip_signals WHERE call_id = $1`, [callId]);

    res.json({ call: result.rows[0] });
  } catch (err) {
    console.error('Decline call error:', err);
    res.status(500).json({ error: 'Failed to decline call' });
  }
};

export const cancelCall = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const callId = parseInt(req.params.callId);

    const result = await pool.query(
      `UPDATE voip_calls SET status = 'cancelled', ended_at = NOW()
       WHERE id = $1 AND caller_id = $2 AND status = 'ringing'
       RETURNING id, status`,
      [callId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Reset caller presence
    await pool.query(
      `UPDATE user_presence SET status = 'online' WHERE user_id = $1`,
      [userId]
    );

    // Cleanup signals
    await pool.query(`DELETE FROM voip_signals WHERE call_id = $1`, [callId]);

    res.json({ call: result.rows[0] });
  } catch (err) {
    console.error('Cancel call error:', err);
    res.status(500).json({ error: 'Failed to cancel call' });
  }
};

export const endCall = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const callId = parseInt(req.params.callId);

    const result = await pool.query(
      `UPDATE voip_calls
       SET status = 'ended',
           ended_at = NOW(),
           duration_secs = EXTRACT(EPOCH FROM NOW() - started_at)::INTEGER,
           ended_by = $2
       WHERE id = $1 AND status = 'active'
         AND (caller_id = $2 OR callee_id = $2)
       RETURNING id, status, duration_secs, caller_id, callee_id`,
      [callId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Active call not found' });
    }

    const call = result.rows[0];

    // Reset both users' presence
    await pool.query(
      `UPDATE user_presence SET status = 'online' WHERE user_id IN ($1, $2)`,
      [call.caller_id, call.callee_id]
    );

    // Cleanup signals
    await pool.query(`DELETE FROM voip_signals WHERE call_id = $1`, [callId]);

    res.json({ call: { id: call.id, status: call.status, duration_secs: call.duration_secs } });
  } catch (err) {
    console.error('End call error:', err);
    res.status(500).json({ error: 'Failed to end call' });
  }
};

export const getCallStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const callId = parseInt(req.params.callId);

    const result = await pool.query(
      `SELECT id, status, started_at, ended_at, duration_secs
       FROM voip_calls
       WHERE id = $1 AND (caller_id = $2 OR callee_id = $2)`,
      [callId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({ call: result.rows[0] });
  } catch (err) {
    console.error('Get call status error:', err);
    res.status(500).json({ error: 'Failed to get call status' });
  }
};

// ── Signaling ──

export const sendSignal = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const callId = parseInt(req.params.callId);
    const { type, payload } = req.body as { type: string; payload: string };

    if (!type || !payload) {
      return res.status(400).json({ error: 'type and payload are required' });
    }

    await pool.query(
      `INSERT INTO voip_signals (call_id, from_user, type, payload)
       VALUES ($1, $2, $3, $4)`,
      [callId, userId, type, payload]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Send signal error:', err);
    res.status(500).json({ error: 'Failed to send signal' });
  }
};

export const getSignals = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const callId = parseInt(req.params.callId);
    const after = parseInt(req.query.after) || 0;

    const result = await pool.query(
      `SELECT id, from_user, type, payload
       FROM voip_signals
       WHERE call_id = $1 AND from_user != $2 AND id > $3
       ORDER BY id`,
      [callId, userId, after]
    );

    res.json({ signals: result.rows });
  } catch (err) {
    console.error('Get signals error:', err);
    res.status(500).json({ error: 'Failed to get signals' });
  }
};

// ── Call History ──

export const getCallHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(`
      SELECT c.id, c.caller_id, c.callee_id, c.status, c.duration_secs, c.created_at,
             CASE WHEN c.caller_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction,
             CASE WHEN c.caller_id = $1
               THEN u_callee.first_name || ' ' || u_callee.last_name
               ELSE u_caller.first_name || ' ' || u_caller.last_name
             END as other_name,
             CASE WHEN c.caller_id = $1
               THEN u_callee.role
               ELSE u_caller.role
             END as other_role,
             CASE WHEN c.caller_id = $1
               THEN c.callee_id
               ELSE c.caller_id
             END as other_id
      FROM voip_calls c
      JOIN users u_caller ON u_caller.id = c.caller_id
      JOIN users u_callee ON u_callee.id = c.callee_id
      WHERE c.caller_id = $1 OR c.callee_id = $1
      ORDER BY c.created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({ calls: result.rows });
  } catch (err) {
    console.error('Get call history error:', err);
    res.status(500).json({ error: 'Failed to get call history' });
  }
};
