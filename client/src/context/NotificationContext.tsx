import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Toast from '../components/Toast';
import type { ToastType } from '../components/Toast';
import apiClient from '../api/client';
import { useSmartPolling } from '../hooks/useSmartPolling';

interface Notification {
  id: string;
  message: string;
  type: ToastType;
  timestamp: Date;
  is_read?: boolean;
  link?: string;
}

// Map a notification's entity to a deep-link into the user's dashboard. The
// recipient's role decides which dashboard /dashboard renders, and both the
// pharmacy and lab dashboards expose 'orders' and 'inventory' tabs, so a tab
// hint + highlighted id is enough to land them on the right section.
function deriveNotificationLink(entityType?: string, entityId?: number): string | undefined {
  if (!entityType) return undefined;
  const hl = entityId != null ? `&highlight=${entityId}` : '';
  switch (entityType) {
    case 'pharmacy_order':
    case 'lab_order':
    case 'imaging_order':
      return `/dashboard?tab=orders${hl}`;
    case 'pharmacy_inventory':
    case 'inventory':
    case 'inventory_batch':
      return `/dashboard?tab=inventory${hl}`;
    case 'encounter':
      return `/dashboard`;
    default:
      return undefined;
  }
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  showToast: (message: string, type?: ToastType, persist?: boolean) => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  refreshNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeToast, setActiveToast] = useState<Notification | null>(null);

  // Check if user is logged in by looking for token
  const isLoggedIn = () => {
    return !!localStorage.getItem('token');
  };

  // Fetch notifications from backend
  const fetchNotifications = useCallback(async () => {
    if (!isLoggedIn()) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      const response = await apiClient.get('/notifications?limit=50');
      const fetchedNotifications = response.data.notifications.map((n: any) => {
        const md = n.metadata || {};
        return {
          id: n.id.toString(),
          message: n.message,
          type: n.type as ToastType,
          timestamp: new Date(n.created_at),
          is_read: n.is_read,
          link: deriveNotificationLink(md.entityType, md.entityId),
        };
      });
      setNotifications(fetchedNotifications);
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      // Silently fail - notifications are not critical
      console.error('Failed to fetch notifications:', error);
    }
  }, []);

  // Fetch notifications and set up SSE for real-time updates.
  // Re-runs whenever localStorage token changes (via storage event listener below
  // setting tokenVersion), so SSE reconnects with the correct token after login/logout.
  const [tokenVersion, setTokenVersion] = useState(0);

  // When the polled list contains an unseen STAT/warning/error item, raise
  // it as a toast. We track which notification ids have already been
  // surfaced so the user doesn't see the same toast every poll cycle.
  const surfacedIdsRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);

  useEffect(() => {
    if (firstLoadRef.current) {
      // On the very first hydration, mark everything as "already seen" so
      // we don't pop toasts for stale notifications that happened before
      // the tab was open.
      notifications.forEach((n) => surfacedIdsRef.current.add(n.id));
      if (notifications.length > 0) firstLoadRef.current = false;
      return;
    }
    for (const n of notifications) {
      if (surfacedIdsRef.current.has(n.id)) continue;
      surfacedIdsRef.current.add(n.id);
      if (n.is_read) continue;
      // Same urgency filter the old SSE path used.
      if (n.type === 'warning' || n.type === 'error') {
        setActiveToast(n);
      }
    }
  }, [notifications]);

  // Smart polling: pauses when the tab is hidden, refreshes immediately
  // when the user comes back. Replaces the previous SSE + 60s fallback —
  // Vercel serverless functions can't hold SSE connections open, so the
  // EventSource path was effectively dead and the 60s tick was the real
  // delivery latency. Polling at 15s gives sub-minute notification arrival
  // without burning bandwidth in background tabs.
  useSmartPolling(fetchNotifications, 15_000, true);

  // Reset state on logout / login (token change). tokenVersion bumps via the
  // storage listener below.
  useEffect(() => {
    if (!isLoggedIn()) {
      setNotifications([]);
      setUnreadCount(0);
      surfacedIdsRef.current.clear();
      firstLoadRef.current = true;
    }
  }, [tokenVersion]);

  // Listen for storage events (login/logout in other tabs)
  // Bump tokenVersion so SSE reconnects with the new (or cleared) token
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        setTokenVersion(v => v + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchNotifications]);

  const showToast = useCallback(async (message: string, type: ToastType = 'info', persist: boolean = true) => {
    const notification: Notification = {
      id: Date.now().toString(),
      message,
      type,
      timestamp: new Date(),
      is_read: false,
    };

    // Show toast immediately
    setActiveToast(notification);

    // If user is logged in and persist is true, save to backend
    if (isLoggedIn() && persist) {
      try {
        const response = await apiClient.post('/notifications', { message, type });
        // Update the notification with the real ID from backend
        notification.id = response.data.notification.id.toString();
      } catch (error) {
        console.error('Failed to persist notification:', error);
      }
    }

    // Update local state
    setNotifications(prev => [notification, ...prev].slice(0, 50));
    setUnreadCount(prev => prev + 1);
  }, []);

  const clearNotification = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));

    if (isLoggedIn()) {
      try {
        await apiClient.delete(`/notifications/${id}`);
      } catch (error) {
        console.error('Failed to delete notification:', error);
      }
    }
  }, []);

  const clearAllNotifications = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);

    if (isLoggedIn()) {
      try {
        await apiClient.delete('/notifications');
      } catch (error) {
        console.error('Failed to clear notifications:', error);
      }
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    if (isLoggedIn()) {
      try {
        await apiClient.put(`/notifications/${id}/read`);
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);

    if (isLoggedIn()) {
      try {
        await apiClient.put('/notifications/read-all');
      } catch (error) {
        console.error('Failed to mark all notifications as read:', error);
      }
    }
  }, []);

  const handleCloseToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        showToast,
        clearNotification,
        clearAllNotifications,
        markAsRead,
        markAllAsRead,
        refreshNotifications: fetchNotifications,
      }}
    >
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
        {activeToast && (
          <Toast
            message={activeToast.message}
            type={activeToast.type}
            onClose={handleCloseToast}
          />
        )}
      </div>
    </NotificationContext.Provider>
  );
};
