import pool from '../database/db';

/**
 * Social layer helpers — writing to the generic activity_feed and detecting
 * lightweight, culture-only milestones. NOTHING here touches clinical metrics.
 */

export interface ActivityInput {
  actorId: number;
  activityType: string; // 'kudos' | 'staff_joined' | 'milestone' (open-ended for v2)
  targetUserId?: number | null;
  entityType?: string | null;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append an event to the activity feed. Best-effort: a feed-write failure must
 * never break the underlying action (kudos, user creation, etc.).
 */
export async function emitActivity(input: ActivityInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_feed (actor_id, activity_type, target_user_id, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.actorId,
        input.activityType,
        input.targetUserId ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
  } catch (error) {
    console.error('Failed to write activity_feed entry:', error);
  }
}

/**
 * Culture-only milestone: celebrate a recipient's kudos count crossing a
 * threshold (1st kudos, then every 10). Returns the milestone count if one was
 * reached so the caller can also surface a notification, else null.
 *
 * `recipientId` is the milestone subject; the milestone is attributed to them
 * (actor = recipient) so it surfaces to people who follow them.
 */
export function kudosMilestoneFor(totalReceived: number): number | null {
  if (totalReceived === 1) return 1;
  if (totalReceived > 0 && totalReceived % 10 === 0) return totalReceived;
  return null;
}

export async function maybeEmitKudosMilestone(recipientId: number, totalReceived: number): Promise<void> {
  const milestone = kudosMilestoneFor(totalReceived);
  if (milestone == null) return;
  await emitActivity({
    actorId: recipientId,
    activityType: 'milestone',
    targetUserId: recipientId,
    entityType: 'kudos_milestone',
    entityId: null,
    metadata: { kind: 'kudos_received', count: milestone },
  });
}
