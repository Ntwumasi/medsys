import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { socialAPI } from '../api/social';
import { useNotification } from '../context/NotificationContext';
import { PresenceBadge, FollowButton } from '../components/social';
import type { DirectoryUser } from '../types';

export default function PeoplePage() {
  const { showToast } = useNotification();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const { users } = await socialAPI.getDirectory(q.trim() || undefined);
      setUsers(users);
    } catch {
      showToast('Could not load directory', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <AppLayout title="People">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="bg-white rounded-2xl shadow-card p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search staff by name or username…"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-gray-400 py-16">No staff found</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {users.map((u) => (
              <div key={u.id} className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3">
                <Link to={`/profile/${u.id}`} className="flex-shrink-0">
                  <span className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 text-white text-sm font-bold flex items-center justify-center">
                    {u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </span>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/profile/${u.id}`} className="block">
                    <p className="text-sm font-semibold text-gray-900 truncate hover:underline">{u.name}</p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 capitalize">{u.role?.replace('_', ' ')}</span>
                    <span className="text-gray-300">·</span>
                    <PresenceBadge status={u.presence_status} />
                  </div>
                  {u.ask_me_about && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">Ask me about: {u.ask_me_about}</p>
                  )}
                </div>
                <FollowButton userId={u.id} isFollowing={u.is_following} size="sm" />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
