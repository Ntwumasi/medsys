import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import Toast from '../components/Toast';
import type { ToastType } from '../components/Toast';
import apiClient from '../api/client';

interface Notification {
  id: string;
  message: string;
  type: ToastType;
  timestamp: Date;
  is_read?: boolean;
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
      const fetchedNotifications = response.data.notifications.map((n: any) => ({
        id: n.id.toString(),
        message: n.message,
        type: n.type as ToastType,
        timestamp: new Date(n.created_at),
        is_read: n.is_read,
      }));
      setNotifications(fetchedNotifications);
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      // Silently fail - notifications are not critical
      console.error('Failed to fetch notifications:', error);
    }
  }, []);

  // Fetch notifications on mount and set up SSE for real-time updates
  useEffect(() => {
    fetchNotifications();

    // Set up Server-Sent Events for real-time notifications
    let eventSource: EventSource | null = null;

    const setupSSE = () => {
      if (!isLoggedIn()) return;

      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      // Note: EventSource doesn't support custom headers, so we pass token as query param
      eventSource = new EventSource(`${apiUrl}/notifications/stream?token=${token}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'notification') {
            // Add new notification to the list
            const notification: Notification = {
              id: data.id?.toString() || Date.now().toString(),
              message: data.message,
              type: data.notificationType || 'info',
              timestamp: new Date(),
              is_read: false,
            };

            setNotifications(prev => [notification, ...prev].slice(0, 50));
            setUnreadCount(prev => prev + 1);

            // Show toast for important notifications
            if (data.priority === 'stat' || data.notificationType === 'warning' || data.notificationType === 'error') {
              setActiveToast(notification);
            }
          }
        } catch (e) {
          // Ignore parse errors for heartbeat messages
        }
      };

      eventSource.onerror = () => {
        // Reconnect after 5 seconds on error
        eventSource?.close();
        setTimeout(setupSSE, 5000);
      };
    };

    setupSSE();

    // Fallback: polling every 60 seconds (reduced from 30 since SSE handles real-time)
    const interval = setInterval(() => {
      if (isLoggedIn()) {
        fetchNotifications();
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      eventSource?.close();
    };
  }, [fetchNotifications]);

  // Listen for storage events (login/logout in other tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        fetchNotifications();
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
