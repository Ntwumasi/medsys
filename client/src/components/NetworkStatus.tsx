import React, { useEffect, useState } from 'react';

/**
 * Shows a banner when the user is offline or has a slow connection.
 * Appears at the top of the viewport and auto-dismisses when reconnected.
 */
const NetworkStatus: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSlow, setShowSlow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleOnline = () => { setIsOffline(false); setDismissed(false); };
    const handleOffline = () => { setIsOffline(true); setDismissed(false); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check connection quality periodically
    const checkConnection = () => {
      const conn = (navigator as any).connection;
      if (conn) {
        const slow = conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.downlink < 1;
        setShowSlow(slow);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (dismissed) return null;

  if (isOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-danger-600 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 shadow-lg">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m12.728 0L5.636 18.364" />
        </svg>
        You are offline. Changes will not be saved until your connection is restored.
      </div>
    );
  }

  if (showSlow) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-warning-500 text-white px-4 py-1.5 text-center text-xs font-medium flex items-center justify-center gap-2">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Slow connection detected. Some features may take longer to load.
        <button onClick={() => setDismissed(true)} className="ml-2 underline opacity-80 hover:opacity-100">Dismiss</button>
      </div>
    );
  }

  return null;
};

export default NetworkStatus;
