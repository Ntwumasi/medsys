import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface SessionTimeoutConfig {
  timeoutMinutes?: number;      // Total inactivity time before logout (default: 30)
  warningMinutes?: number;      // When to show warning before logout (default: 5)
  checkIntervalSeconds?: number; // How often to check (default: 30)
}

interface SessionTimeoutState {
  isWarningVisible: boolean;
  remainingSeconds: number;
  extendSession: () => void;
}

export const useSessionTimeout = (config: SessionTimeoutConfig = {}): SessionTimeoutState => {
  const {
    timeoutMinutes = 30,
    warningMinutes = 5,
    checkIntervalSeconds = 30,
  } = config;

  const { isAuthenticated, logout } = useAuth();
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  
  const lastActivityRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningMs = warningMinutes * 60 * 1000;

  // Reset activity timestamp
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isWarningVisible) {
      setIsWarningVisible(false);
      setRemainingSeconds(0);
    }
  }, [isWarningVisible]);

  // Extend session (called when user clicks "Stay Logged In")
  const extendSession = useCallback(() => {
    resetActivity();
  }, [resetActivity]);

  // Handle logout
  const handleLogout = useCallback(() => {
    setIsWarningVisible(false);
    setRemainingSeconds(0);
    logout();
  }, [logout]);

  // Track user activity
  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetActivity();
    };

    // Throttle activity updates to avoid excessive resets
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const throttledActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        handleActivity();
        throttleTimer = null;
      }, 1000);
    };

    events.forEach(event => {
      document.addEventListener(event, throttledActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, throttledActivity);
      });
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [isAuthenticated, resetActivity]);

  // Check for timeout
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;
      const timeUntilLogout = timeoutMs - timeSinceActivity;

      // Time to logout
      if (timeUntilLogout <= 0) {
        handleLogout();
        return;
      }

      // Time to show warning
      if (timeUntilLogout <= warningMs && !isWarningVisible) {
        setIsWarningVisible(true);
        setRemainingSeconds(Math.ceil(timeUntilLogout / 1000));
      }
    };

    // Initial check
    checkTimeout();

    // Set up interval
    warningTimerRef.current = setInterval(checkTimeout, checkIntervalSeconds * 1000);

    return () => {
      if (warningTimerRef.current) {
        clearInterval(warningTimerRef.current);
      }
    };
  }, [isAuthenticated, timeoutMs, warningMs, checkIntervalSeconds, isWarningVisible, handleLogout]);

  // Countdown timer when warning is visible
  useEffect(() => {
    if (!isWarningVisible) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      return;
    }

    countdownTimerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [isWarningVisible, handleLogout]);

  return {
    isWarningVisible,
    remainingSeconds,
    extendSession,
  };
};
