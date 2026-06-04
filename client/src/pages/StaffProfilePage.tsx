import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { socialAPI } from '../api/social';
import { useNotification } from '../context/NotificationContext';
import { format } from 'date-fns';
import {
  PresenceBadge,
  FollowButton,
  KudosModal,
  KudosTagChip,
} from '../components/social';
import type { StaffProfile, Kudos, FollowUser } from '../types';

function safeDate(value: string | null | undefined, pattern: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : format(d, pattern);
}

export default function StaffProfilePage() {
  const params = useParams();
  const userId = Number(params.userId);
  const { showToast } = useNotification();

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [kudos, setKudos] = useState<Kudos[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [kudosOpen, setKudosOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId || Number.isNaN(userId)) return;
    setLoading(true);
    try {
      const [{ profile: p }, k, fl, fr] = await Promise.all([
        socialAPI.getProfile(userId),
        socialAPI.getKudos(userId, 'received'),
        socialAPI.getFollowing(userId),
        socialAPI.getFollowers(userId),
      ]);
      setProfile(p);
      setKudos(k.kudos);
      setFollowing(fl.users);
      setFollowers(fr.users);
    } catch {
      showToast('Could not load profile', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <AppLayout title="Profile">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout title="Profile">
        <div className="max-w-3xl mx-auto text-center py-20 text-gray-500">
          <p className="font-medium">Profile not available</p>
          <Link to="/people" className="text-primary-600 text-sm hover:underline mt-2 inline-block">Back to People</Link>
        </div>
      </AppLayout>
    );
  }

  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`;

  return (
    <AppLayout title={profile.name}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="h-28 bg-gradient-to-r from-primary-500 via-primary-400 to-secondary-500" />
          <div className="px-6 pb-6 -mt-12">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center">
                <span className="text-white font-bold text-3xl">{initials}</span>
              </div>
              <div className="flex-1 pb-1">
                <h1 className="text-2xl font-bold text-gray-900">{profile.name}</h1>
                <p className="text-gray-500 capitalize">{profile.role?.replace('_', ' ')}</p>
                <div className="mt-1 flex items-center gap-3">
                  <PresenceBadge status={profile.presence_status} />
                  {profile.clinic && <span className="text-sm text-gray-400">{profile.clinic}</span>}
                </div>
              </div>
              {!profile.is_self ? (
                <div className="flex items-center gap-2 pb-1">
                  <FollowButton userId={profile.id} isFollowing={profile.is_following} onChange={load} />
                  <button
                    onClick={() => setKudosOpen(true)}
                    className="px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                  >
                    Give kudos
                  </button>
                </div>
              ) : (
                <Link to="/profile" className="text-sm text-primary-600 hover:underline pb-1">Edit your profile</Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* About */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">About</h2>
            {profile.bio ? (
              <p className="text-sm text-gray-700 whitespace-pre-line">{profile.bio}</p>
            ) : (
              <p className="text-sm text-gray-400">No bio yet.</p>
            )}

            {profile.ask_me_about && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 mb-1">Ask me about</p>
                <p className="text-sm text-gray-700">{profile.ask_me_about}</p>
              </div>
            )}

            {profile.interests.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full text-xs bg-secondary-50 text-secondary-700">{i}</span>
                  ))}
                </div>
              </div>
            )}

            {profile.languages.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Languages</p>
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((l) => (
                    <span key={l} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600">{l}</span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-6">Member since {safeDate(profile.created_at, 'MMM yyyy')}</p>
          </div>

          {/* Connections (counts de-emphasized — focus on who) */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Connections</h2>
            <div className="space-y-5">
              <ConnList title="Following" users={following} emptyText="Not following anyone yet" />
              <ConnList title="Followers" users={followers} emptyText="No followers yet" />
            </div>
          </div>
        </div>

        {/* Kudos received */}
        <div className="bg-white rounded-2xl shadow-card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Kudos received</h2>
          {kudos.length === 0 ? (
            <p className="text-sm text-gray-400">No kudos yet — be the first to recognize {profile.first_name}.</p>
          ) : (
            <div className="space-y-3">
              {kudos.map((k) => (
                <div key={k.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Link to={`/profile/${k.person.id}`} className="text-sm font-medium text-gray-900 hover:underline">
                      {k.person.name}
                    </Link>
                    {k.tag && <KudosTagChip tag={k.tag} />}
                  </div>
                  <p className="text-sm text-gray-700">{k.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{safeDate(k.created_at, 'MMM d, yyyy')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <KudosModal
        recipientId={profile.id}
        recipientName={profile.name}
        open={kudosOpen}
        onClose={() => setKudosOpen(false)}
        onDone={load}
      />
    </AppLayout>
  );
}

function ConnList({ title, users, emptyText }: { title: string; users: FollowUser[]; emptyText: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2">{title}</p>
      {users.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {users.slice(0, 8).map((u) => (
            <Link key={u.id} to={`/profile/${u.id}`} className="flex items-center gap-2 group">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 text-white text-[11px] font-bold flex items-center justify-center">
                {u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </span>
              <span className="text-sm text-gray-700 group-hover:underline">{u.name}</span>
              <span className="text-xs text-gray-400 capitalize ml-auto">{u.role?.replace('_', ' ')}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
