import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import {
  followUser,
  unfollowUser,
  createKudos,
  getFeed,
} from '../controllers/socialController';
import { kudosMilestoneFor } from '../services/socialService';
import { mockRequest, mockResponse } from './helpers';

// Route pool.query results by SQL substring so tests don't depend on the exact
// internal call order. Anything unmatched returns an empty result set.
function routeQueries(map: Array<[string, any]>) {
  vi.mocked(pool.query).mockImplementation((async (sql: any) => {
    const text = String(sql);
    for (const [needle, result] of map) {
      if (text.includes(needle)) return result;
    }
    return { rows: [] };
  }) as any);
}

const staffRow = { id: 9, role: 'nurse', first_name: 'Sarah', last_name: 'Johnson' };

describe('socialController — follow graph', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects following yourself', async () => {
    const req = mockRequest({}, { userId: '5' }, {}, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await followUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/yourself/i) }));
    // Must not touch the DB on a self-follow.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('404s when the target is not active staff (e.g. a patient)', async () => {
    routeQueries([['FROM users\n      WHERE id = $1', { rows: [] }]]); // findStaff finds nobody
    const req = mockRequest({}, { userId: '9' }, {}, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await followUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('follows a staff member (idempotent insert) and reports is_following', async () => {
    routeQueries([
      ['FROM users', { rows: [staffRow] }], // findStaff
      ['INSERT INTO user_follows', { rows: [] }],
      ['INSERT INTO audit_logs', { rows: [] }],
    ]);
    const req = mockRequest({}, { userId: '9' }, {}, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await followUser(req, res);

    const insertCall = vi.mocked(pool.query).mock.calls.find((c) => String(c[0]).includes('INSERT INTO user_follows'));
    expect(insertCall).toBeTruthy();
    expect(String(insertCall![0])).toContain('ON CONFLICT (follower_id, following_id) DO NOTHING');
    expect(insertCall![1]).toEqual([5, 9]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ is_following: true }));
  });

  it('unfollows and reports is_following=false', async () => {
    routeQueries([
      ['DELETE FROM user_follows', { rows: [] }],
      ['INSERT INTO audit_logs', { rows: [] }],
    ]);
    const req = mockRequest({}, { userId: '9' }, {}, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await unfollowUser(req, res);

    const del = vi.mocked(pool.query).mock.calls.find((c) => String(c[0]).includes('DELETE FROM user_follows'));
    expect(del).toBeTruthy();
    expect(del![1]).toEqual([5, 9]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ is_following: false }));
  });
});

describe('socialController — kudos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects giving kudos to yourself', async () => {
    const req = mockRequest({ recipient_id: 5, message: 'great work' }, {}, {}, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await createKudos(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/yourself/i) }));
  });

  it('rejects an empty message', async () => {
    const req = mockRequest({ recipient_id: 9, message: '   ' }, {}, {}, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await createKudos(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates kudos and records a feed activity', async () => {
    routeQueries([
      ['FROM users\n      WHERE id = $1', { rows: [staffRow] }], // findStaff(recipient)
      ['INSERT INTO kudos', { rows: [{ id: 42, created_at: '2026-06-03T00:00:00Z' }] }],
      ['INSERT INTO activity_feed', { rows: [] }],
      ['COUNT(*) FROM kudos', { rows: [{ count: '1' }] }],
      ['SELECT first_name, last_name FROM users', { rows: [{ first_name: 'Dee', last_name: 'Doc' }] }],
      ['INSERT INTO user_notifications', { rows: [] }],
      ['INSERT INTO audit_logs', { rows: [] }],
    ]);
    const req = mockRequest(
      { recipient_id: 9, message: 'Saved the day', tag: 'Lifesaver' },
      {},
      {},
      { id: 5, role: 'doctor' }
    );
    const res = mockResponse();

    await createKudos(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ kudos_id: 42 }));

    const kudosInsert = vi.mocked(pool.query).mock.calls.find((c) => String(c[0]).includes('INSERT INTO kudos'));
    expect(kudosInsert![1]).toEqual([5, 9, 'Saved the day', 'Lifesaver']);

    const activityInsert = vi.mocked(pool.query).mock.calls.find((c) => String(c[0]).includes('INSERT INTO activity_feed'));
    expect(activityInsert).toBeTruthy();
  });
});

describe('socialController — feed scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('default (following) scope restricts actors to people the user follows', async () => {
    routeQueries([['FROM activity_feed', { rows: [] }]]);
    const req = mockRequest({}, {}, {}, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await getFeed(req, res);

    const feedQuery = vi.mocked(pool.query).mock.calls.find((c) => String(c[0]).includes('FROM activity_feed'));
    expect(feedQuery).toBeTruthy();
    // The actor filter must be the follow-graph subquery, never a global select.
    expect(String(feedQuery![0])).toContain('a.actor_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1)');
    expect(feedQuery![1]).toEqual([5]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ scope: 'following' }));
  });

  it('mine scope restricts to the user\'s own activity', async () => {
    routeQueries([['FROM activity_feed', { rows: [] }]]);
    const req = mockRequest({}, {}, { scope: 'mine' }, { id: 5, role: 'doctor' });
    const res = mockResponse();

    await getFeed(req, res);

    const feedQuery = vi.mocked(pool.query).mock.calls.find((c) => String(c[0]).includes('FROM activity_feed'));
    expect(String(feedQuery![0])).toContain('a.actor_id = $1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ scope: 'mine' }));
  });
});

describe('socialService — kudos milestones', () => {
  it('celebrates the 1st kudos and every 10th, nothing in between', () => {
    expect(kudosMilestoneFor(1)).toBe(1);
    expect(kudosMilestoneFor(10)).toBe(10);
    expect(kudosMilestoneFor(30)).toBe(30);
    expect(kudosMilestoneFor(2)).toBeNull();
    expect(kudosMilestoneFor(11)).toBeNull();
    expect(kudosMilestoneFor(0)).toBeNull();
  });
});
