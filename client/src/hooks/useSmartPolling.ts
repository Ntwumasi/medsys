import { useEffect, useRef } from 'react';

// Visibility-aware polling. Re-fetches `fn` on a fixed interval while the
// tab is visible, pauses when the tab is hidden, and triggers an immediate
// refetch when the user returns (visibilitychange / window focus).
//
// Why this beats a plain setInterval:
//   - No wasted polls (or battery / Starlink bandwidth) when the tab is
//     buried behind other windows.
//   - When the user comes back, they see fresh data immediately instead of
//     waiting for the next tick.
//
// Why this beats WebSockets / SSE on Vercel:
//   - Vercel serverless functions can't hold long-lived connections, so
//     SSE/WebSockets churn through reconnects without delivering reliably.
//   - Polling tolerates a flapping link (e.g., Starlink) gracefully — a
//     missed tick just means the next one catches up.
//
// Pass `enabled = false` to pause entirely (e.g., when the user is logged
// out). The hook always runs `fn` once on mount when enabled is true, so
// callers don't need to call it separately.
export function useSmartPolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true,
): void {
  // Keep the latest fn in a ref so the effect doesn't re-subscribe every
  // time the caller passes a new closure. Otherwise every parent re-render
  // resets the interval clock.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setInterval> | null = null;

    const safeRun = () => {
      if (cancelled) return;
      Promise.resolve(fnRef.current()).catch(() => {
        /* swallow — caller's fn is responsible for its own error UX */
      });
    };

    const startTimer = () => {
      if (timerId !== null) return;
      timerId = setInterval(safeRun, intervalMs);
    };

    const stopTimer = () => {
      if (timerId === null) return;
      clearInterval(timerId);
      timerId = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopTimer();
      } else {
        // Tab came back: refetch right away, then resume the timer.
        safeRun();
        startTimer();
      }
    };

    const onFocus = () => {
      // Some browsers / window managers fire focus without visibilitychange
      // (e.g., switching between two Chrome windows on macOS). Treat it as
      // "came back" so the user always sees fresh data on switch-in.
      if (!document.hidden) safeRun();
    };

    // Initial fetch + start polling if the tab is visible at mount time.
    if (!document.hidden) {
      safeRun();
      startTimer();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [intervalMs, enabled]);
}
