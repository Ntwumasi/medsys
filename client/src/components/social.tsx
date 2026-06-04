import React, { useState } from 'react';
import { socialAPI } from '../api/social';
import { useNotification } from '../context/NotificationContext';
import { PRESENCE_META, KUDOS_TAGS, TAG_STYLE } from '../utils/social';
import type { PresenceStatus, KudosTag } from '../types';

// ---- Presence ----

export const PresenceBadge: React.FC<{ status: PresenceStatus; className?: string }> = ({ status, className = '' }) => {
  const meta = PRESENCE_META[status] ?? PRESENCE_META.online;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

// ---- Kudos tags ----

export const KudosTagChip: React.FC<{ tag: KudosTag }> = ({ tag }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${TAG_STYLE[tag] ?? 'bg-gray-100 text-gray-600'}`}>
    {tag}
  </span>
);

// ---- Follow button ----

export const FollowButton: React.FC<{
  userId: number;
  isFollowing: boolean;
  onChange?: (next: boolean) => void;
  size?: 'sm' | 'md';
}> = ({ userId, isFollowing, onChange, size = 'md' }) => {
  const { showToast } = useNotification();
  const [following, setFollowing] = useState(isFollowing);
  const [busy, setBusy] = useState(false);

  // Keep in sync if the parent re-renders with a new value.
  React.useEffect(() => setFollowing(isFollowing), [isFollowing]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next); // optimistic
    try {
      if (next) await socialAPI.follow(userId);
      else await socialAPI.unfollow(userId);
      onChange?.(next);
    } catch {
      setFollowing(!next); // revert
      showToast('Could not update follow', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm';
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`${pad} font-medium rounded-lg transition-colors disabled:opacity-60 ${
        following
          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          : 'bg-primary-600 text-white hover:bg-primary-700'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
};

// ---- Give-kudos modal ----

export const KudosModal: React.FC<{
  recipientId: number;
  recipientName: string;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}> = ({ recipientId, recipientName, open, onClose, onDone }) => {
  const { showToast } = useNotification();
  const [message, setMessage] = useState('');
  const [tag, setTag] = useState<KudosTag | ''>('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!message.trim()) {
      showToast('Add a short message', 'warning');
      return;
    }
    setBusy(true);
    try {
      await socialAPI.giveKudos({ recipient_id: recipientId, message: message.trim(), tag: tag || null });
      showToast('Kudos sent 🎉', 'success');
      setMessage('');
      setTag('');
      onDone?.();
      onClose();
    } catch {
      showToast('Could not send kudos', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Give kudos</h3>
        <p className="text-sm text-gray-500 mb-4">Recognize <span className="font-medium text-gray-700">{recipientName}</span></p>

        <label className="block text-xs font-medium text-gray-500 mb-1.5">Tag (optional)</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {KUDOS_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? '' : t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                tag === t ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-gray-500 mb-1.5">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={`Thanks for...`}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
          autoFocus
        />

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Send kudos'}
          </button>
        </div>
      </div>
    </div>
  );
};
