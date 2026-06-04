import { Request, Response } from 'express';
import pool from '../database/db';
import auditService from '../services/auditService';
import { emitActivity, maybeEmitKudosMilestone } from '../services/socialService';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    is_super_admin?: boolean;
  };
}

const clientIp = (req: Request): string | undefined =>
  (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || undefined;

const ua = (req: Request): string | undefined => {
  const h = req.headers['user-agent'];
  return Array.isArray(h) ? h[0] : h;
};

/**
 * Resolve a target user id that must be an ACTIVE STAFF member (never a patient).
 * Returns the row, or null if not found / is a patient. Centralizes the
 * staff-only guardrail so patients can never appear in the social graph.
 */
async function findStaff(userId: number): Promise<{ id: number; role: string; first_name: string; last_name: string } | null> {
  const result = await pool.query(
    `SELECT id, role, first_name, last_name
       FROM users
      WHERE id = $1 AND is_active = true AND role <> 'patient'`,
    [userId]
  );
  return result.rows[0] || null;
}

function parseId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// ============ Directory ============

// GET /profiles/directory?q= — staff list for discovery (excludes patients).
export const getDirectory = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const q = (req.query.q as string | undefined)?.trim();

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const params: unknown[] = [userId];
    let search = '';
    if (q) {
      params.push(`%${q}%`);
      search = `AND (u.first_name ILIKE $2 OR u.last_name ILIKE $2 OR u.username ILIKE $2)`;
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.role, u.username,
              COALESCE(p.presence_status, 'online') AS presence_status,
              p.ask_me_about,
              EXISTS (
                SELECT 1 FROM user_follows f
                 WHERE f.follower_id = $1 AND f.following_id = u.id
              ) AS is_following
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.is_active = true
          AND u.role <> 'patient'
          AND u.id <> $1
          ${search}
        ORDER BY u.first_name, u.last_name`,
      params
    );

    res.json({
      users: result.rows.map((r) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        role: r.role,
        username: r.username,
        presence_status: r.presence_status,
        ask_me_about: r.ask_me_about || null,
        is_following: r.is_following,
      })),
    });
  } catch (error) {
    console.error('Get directory error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ Profile view ============

// GET /profiles/:userId — view any staff profile (identity + social fields).
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const viewerId = authReq.user?.id;
  const targetId = parseId(req.params.userId);

  try {
    if (!viewerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (targetId == null) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.role, u.username, u.clinic, u.created_at,
              p.bio, p.ask_me_about, p.languages, p.interests,
              COALESCE(p.presence_status, 'online') AS presence_status,
              (SELECT COUNT(*) FROM user_follows f WHERE f.following_id = u.id) AS follower_count,
              (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = u.id) AS following_count,
              (SELECT COUNT(*) FROM kudos k WHERE k.recipient_id = u.id) AS kudos_received_count,
              EXISTS (
                SELECT 1 FROM user_follows f
                 WHERE f.follower_id = $1 AND f.following_id = u.id
              ) AS is_following
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.id = $2 AND u.is_active = true AND u.role <> 'patient'`,
      [viewerId, targetId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Staff profile not found' });
      return;
    }

    const r = result.rows[0];
    res.json({
      profile: {
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        first_name: r.first_name,
        last_name: r.last_name,
        role: r.role,
        username: r.username,
        clinic: r.clinic || null,
        created_at: r.created_at,
        bio: r.bio || null,
        ask_me_about: r.ask_me_about || null,
        languages: r.languages || [],
        interests: r.interests || [],
        presence_status: r.presence_status,
        // Counts are returned but the UI deliberately de-emphasizes them.
        follower_count: parseInt(r.follower_count, 10),
        following_count: parseInt(r.following_count, 10),
        kudos_received_count: parseInt(r.kudos_received_count, 10),
        is_following: r.is_following,
        is_self: r.id === viewerId,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /profiles/me — edit own social fields + presence.
export const updateMyProfile = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const { bio, ask_me_about, languages, interests, presence_status } = req.body as {
    bio?: string;
    ask_me_about?: string;
    languages?: string[];
    interests?: string[];
    presence_status?: 'online' | 'on_call' | 'away';
  };

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Merge provided fields over the existing row (partial update). Absent keys
    // (undefined) keep the current value; explicit values (incl. '' or []) set it.
    const existing = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
    const cur = existing.rows[0] || {};

    const merged = {
      bio: bio !== undefined ? bio : (cur.bio ?? null),
      ask_me_about: ask_me_about !== undefined ? ask_me_about : (cur.ask_me_about ?? null),
      languages: languages !== undefined ? languages : (cur.languages ?? []),
      interests: interests !== undefined ? interests : (cur.interests ?? []),
      presence_status: presence_status !== undefined ? presence_status : (cur.presence_status ?? 'online'),
    };
    const presenceChanged = presence_status !== undefined && presence_status !== cur.presence_status;

    const result = await pool.query(
      `INSERT INTO user_profiles (user_id, bio, ask_me_about, languages, interests, presence_status, presence_updated_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         bio = EXCLUDED.bio,
         ask_me_about = EXCLUDED.ask_me_about,
         languages = EXCLUDED.languages,
         interests = EXCLUDED.interests,
         presence_status = EXCLUDED.presence_status,
         presence_updated_at = CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE user_profiles.presence_updated_at END,
         updated_at = CURRENT_TIMESTAMP
       RETURNING bio, ask_me_about, languages, interests, presence_status`,
      [userId, merged.bio, merged.ask_me_about, merged.languages, merged.interests, merged.presence_status, presenceChanged]
    );

    const r = result.rows[0];
    res.json({
      message: 'Profile updated',
      profile: {
        bio: r.bio || null,
        ask_me_about: r.ask_me_about || null,
        languages: r.languages || [],
        interests: r.interests || [],
        presence_status: r.presence_status,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ Follow graph ============

// POST /profiles/:userId/follow
export const followUser = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const targetId = parseId(req.params.userId);

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (targetId == null) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }
    if (targetId === userId) {
      res.status(400).json({ error: 'You cannot follow yourself' });
      return;
    }

    const target = await findStaff(targetId);
    if (!target) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }

    await pool.query(
      `INSERT INTO user_follows (follower_id, following_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_id, following_id) DO NOTHING`,
      [userId, targetId]
    );

    await auditService.log({
      userId,
      action: 'create',
      entityType: 'user_follow',
      entityId: targetId,
      ipAddress: clientIp(req),
      userAgent: ua(req),
    });

    res.json({ message: 'Following', is_following: true });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /profiles/:userId/follow
export const unfollowUser = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const targetId = parseId(req.params.userId);

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (targetId == null) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    await pool.query(
      'DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [userId, targetId]
    );

    await auditService.log({
      userId,
      action: 'delete',
      entityType: 'user_follow',
      entityId: targetId,
      ipAddress: clientIp(req),
      userAgent: ua(req),
    });

    res.json({ message: 'Unfollowed', is_following: false });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /profiles/:userId/followers — people who follow this user.
export const getFollowers = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const viewerId = authReq.user?.id;
  const targetId = parseId(req.params.userId);

  try {
    if (!viewerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (targetId == null) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.role,
              COALESCE(p.presence_status, 'online') AS presence_status,
              EXISTS (SELECT 1 FROM user_follows f2 WHERE f2.follower_id = $1 AND f2.following_id = u.id) AS is_following
         FROM user_follows f
         JOIN users u ON u.id = f.follower_id AND u.is_active = true AND u.role <> 'patient'
         LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE f.following_id = $2
        ORDER BY u.first_name, u.last_name`,
      [viewerId, targetId]
    );

    res.json({ users: mapUserList(result.rows, viewerId) });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /profiles/:userId/following — people this user follows.
export const getFollowing = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const viewerId = authReq.user?.id;
  const targetId = parseId(req.params.userId);

  try {
    if (!viewerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (targetId == null) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.role,
              COALESCE(p.presence_status, 'online') AS presence_status,
              EXISTS (SELECT 1 FROM user_follows f2 WHERE f2.follower_id = $1 AND f2.following_id = u.id) AS is_following
         FROM user_follows f
         JOIN users u ON u.id = f.following_id AND u.is_active = true AND u.role <> 'patient'
         LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE f.follower_id = $2
        ORDER BY u.first_name, u.last_name`,
      [viewerId, targetId]
    );

    res.json({ users: mapUserList(result.rows, viewerId) });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

function mapUserList(rows: any[], viewerId: number) {
  return rows.map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`,
    role: r.role,
    presence_status: r.presence_status,
    is_following: r.is_following,
    is_self: r.id === viewerId,
  }));
}

// ============ Kudos ============

// POST /kudos — { recipient_id, message, tag? }
export const createKudos = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const senderId = authReq.user?.id;
  const { recipient_id, message, tag } = req.body as {
    recipient_id: number;
    message: string;
    tag?: string | null;
  };

  try {
    if (!senderId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!recipient_id || !message || !message.trim()) {
      res.status(400).json({ error: 'Recipient and message are required' });
      return;
    }
    if (recipient_id === senderId) {
      res.status(400).json({ error: 'You cannot give kudos to yourself' });
      return;
    }

    const recipient = await findStaff(recipient_id);
    if (!recipient) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    const inserted = await pool.query(
      `INSERT INTO kudos (sender_id, recipient_id, message, tag)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [senderId, recipient_id, message.trim(), tag || null]
    );
    const kudosId = inserted.rows[0].id;

    // Feed event: kudos given (actor = sender, target = recipient).
    await emitActivity({
      actorId: senderId,
      activityType: 'kudos',
      targetUserId: recipient_id,
      entityType: 'kudos',
      entityId: kudosId,
      metadata: { tag: tag || null, message: message.trim().slice(0, 140) },
    });

    // Culture-only milestone on the recipient's running total.
    const countRes = await pool.query('SELECT COUNT(*) FROM kudos WHERE recipient_id = $1', [recipient_id]);
    await maybeEmitKudosMilestone(recipient_id, parseInt(countRes.rows[0].count, 10));

    // Surface in the recipient's notification bell.
    const senderRes = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [senderId]);
    const senderName = senderRes.rows[0]
      ? `${senderRes.rows[0].first_name} ${senderRes.rows[0].last_name}`
      : 'A colleague';
    await pool.query(
      `INSERT INTO user_notifications (user_id, type, message, metadata)
       VALUES ($1, 'success', $2, $3)`,
      [
        recipient_id,
        `${senderName} gave you kudos${tag ? ` — ${tag}` : ''}`,
        JSON.stringify({ entityType: 'kudos', entityId: kudosId, originalType: 'kudos' }),
      ]
    );

    await auditService.log({
      userId: senderId,
      action: 'create',
      entityType: 'kudos',
      entityId: kudosId,
      newValues: { recipient_id, tag: tag || null },
      ipAddress: clientIp(req),
      userAgent: ua(req),
    });

    res.status(201).json({ message: 'Kudos sent', kudos_id: kudosId });
  } catch (error) {
    console.error('Create kudos error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /profiles/:userId/kudos?direction=received|given
export const getKudos = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const viewerId = authReq.user?.id;
  const targetId = parseId(req.params.userId);
  const direction = (req.query.direction as string) === 'given' ? 'given' : 'received';

  try {
    if (!viewerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (targetId == null) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // received: kudos where target is recipient (show sender). given: where
    // target is sender (show recipient).
    const joinColumn = direction === 'given' ? 'k.recipient_id' : 'k.sender_id';
    const filterColumn = direction === 'given' ? 'k.sender_id' : 'k.recipient_id';

    const result = await pool.query(
      `SELECT k.id, k.message, k.tag, k.created_at,
              u.id AS person_id, u.first_name, u.last_name, u.role
         FROM kudos k
         JOIN users u ON u.id = ${joinColumn}
        WHERE ${filterColumn} = $1
        ORDER BY k.created_at DESC
        LIMIT 100`,
      [targetId]
    );

    res.json({
      direction,
      kudos: result.rows.map((r) => ({
        id: r.id,
        message: r.message,
        tag: r.tag,
        created_at: r.created_at,
        person: { id: r.person_id, name: `${r.first_name} ${r.last_name}`, role: r.role },
      })),
    });
  } catch (error) {
    console.error('Get kudos error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ Feed ============

// GET /feed?scope=following — activity from people the user follows (default),
// or scope=mine for the user's own activity. NEVER a global firehose.
export const getFeed = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const scope = (req.query.scope as string) === 'mine' ? 'mine' : 'following';

  try {
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Restrict actors: own activity, or strictly the set of users I follow.
    const actorFilter =
      scope === 'mine'
        ? 'a.actor_id = $1'
        : 'a.actor_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1)';

    const result = await pool.query(
      `SELECT a.id, a.activity_type, a.entity_type, a.entity_id, a.metadata, a.created_at,
              actor.id AS actor_id, actor.first_name AS actor_first, actor.last_name AS actor_last, actor.role AS actor_role,
              t.id AS target_id, t.first_name AS target_first, t.last_name AS target_last
         FROM activity_feed a
         JOIN users actor ON actor.id = a.actor_id AND actor.is_active = true AND actor.role <> 'patient'
         LEFT JOIN users t ON t.id = a.target_user_id
        WHERE ${actorFilter}
        ORDER BY a.created_at DESC
        LIMIT 60`,
      [userId]
    );

    res.json({
      scope,
      items: result.rows.map((r) => ({
        id: r.id,
        activity_type: r.activity_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        metadata: r.metadata || {},
        created_at: r.created_at,
        actor: { id: r.actor_id, name: `${r.actor_first} ${r.actor_last}`, role: r.actor_role },
        target: r.target_id ? { id: r.target_id, name: `${r.target_first} ${r.target_last}` } : null,
      })),
    });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
