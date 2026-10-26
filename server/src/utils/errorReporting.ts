import * as Sentry from '@sentry/node';

/**
 * Send caught errors to Sentry. About 490 catch blocks log with
 * `console.error('Something failed:', error)` and carry on, so those failures
 * never reached Sentry — only errors that escaped to the Express error handler
 * did. This forwards every console.error that carries an Error object, with
 * the log text as context. Plain-text console.error lines (no Error) stay
 * log-only. The original console output is unchanged.
 */
export const reportConsoleErrorsToSentry = (): void => {
  if (!process.env.SENTRY_DSN) return;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    try {
      const error = args.find((a): a is Error => a instanceof Error);
      if (!error) return;
      const context = args
        .filter((a) => typeof a === 'string')
        .join(' ')
        .slice(0, 500);
      Sentry.captureException(error, { extra: context ? { log: context } : undefined });
    } catch {
      // Reporting must never break the code that is logging.
    }
  };
};
