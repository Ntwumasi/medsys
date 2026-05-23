import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { messagesAPI } from '../api/messages';
import { useSmartPolling } from '../hooks/useSmartPolling';

const MessageBadge: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await messagesAPI.getUnreadCount();
      setUnreadCount(data.unread_count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }, []);

  // Visibility-aware polling: 20s while tab visible, paused when hidden,
  // refresh on tab-return so message badge is up to date when staff
  // switch back from another app.
  useSmartPolling(loadUnreadCount, 20_000, true);

  return (
    <Link
      to="/messages"
      className="relative p-2 rounded-lg text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors"
      title="Messages"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
        />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
};

export default MessageBadge;
