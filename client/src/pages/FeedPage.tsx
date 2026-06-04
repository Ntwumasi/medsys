import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { socialAPI } from '../api/social';
import { useNotification } from '../context/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { KudosTagChip } from '../components/social';
import type { FeedItem, KudosTag } from '../types';

function timeAgo(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : formatDistanceToNow(d, { addSuffix: true });
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
      {initials}
    </span>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const actorLink = <Link to={`/profile/${item.actor.id}`} className="font-semibold text-gray-900 hover:underline">{item.actor.name}</Link>;
  const targetLink = item.target
    ? <Link to={`/profile/${item.target.id}`} className="font-semibold text-gray-900 hover:underline">{item.target.name}</Link>
    : null;

  let body: React.ReactNode;
  let icon = '✨';

  switch (item.activity_type) {
    case 'kudos': {
      const tag = item.metadata?.tag as KudosTag | undefined;
      const message = item.metadata?.message as string | undefined;
      icon = '🙌';
      body = (
        <div>
          <p className="text-sm text-gray-700">{actorLink} gave kudos to {targetLink}</p>
          {(tag || message) && (
            <div className="mt-1.5 flex items-start gap-2">
              {tag && <KudosTagChip tag={tag} />}
              {message && <span className="text-sm text-gray-500 italic">“{message}”</span>}
            </div>
          )}
        </div>
      );
      break;
    }
    case 'staff_joined': {
      icon = '👋';
      body = <p className="text-sm text-gray-700">{actorLink} joined MedSys — say hello!</p>;
      break;
    }
    case 'milestone': {
      icon = '🏆';
      const count = item.metadata?.count as number | undefined;
      body = <p className="text-sm text-gray-700">{actorLink} reached {count ?? ''} kudos received</p>;
      break;
    }
    default:
      body = <p className="text-sm text-gray-700">{actorLink} had an update</p>;
  }

  return (
    <div className="flex gap-3 p-4 bg-white rounded-2xl shadow-card">
      <div className="relative">
        <Avatar name={item.actor.name} />
        <span className="absolute -bottom-1 -right-1 text-base leading-none">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        {body}
        <p className="text-xs text-gray-400 mt-1">{timeAgo(item.created_at)}</p>
      </div>
    </div>
  );
}

export default function FeedPage() {
  const { showToast } = useNotification();
  const [scope, setScope] = useState<'following' | 'mine'>('following');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: 'following' | 'mine') => {
    setLoading(true);
    try {
      const { items } = await socialAPI.getFeed(s);
      setItems(items);
    } catch {
      showToast('Could not load feed', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(scope); }, [scope, load]);

  return (
    <AppLayout title="Feed">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Scope toggle */}
        <div className="flex items-center justify-between">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            {(['following', 'mine'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                  scope === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s === 'following' ? 'People I follow' : 'My activity'}
              </button>
            ))}
          </div>
          <Link to="/people" className="text-sm text-primary-600 font-medium hover:underline">Find people →</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-card p-10 text-center">
            <div className="text-4xl mb-3">🤝</div>
            <p className="font-medium text-gray-900">
              {scope === 'following' ? 'Your feed is quiet' : 'No activity yet'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {scope === 'following'
                ? 'Follow colleagues to see their kudos and milestones here.'
                : 'Give kudos or update your profile to get started.'}
            </p>
            {scope === 'following' && (
              <Link to="/people" className="inline-block mt-4 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
                Discover people
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => <FeedRow key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
