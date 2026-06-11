import React, { Component } from 'react';
import type { ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // A failed lazy-chunk load after a deploy (old index.html referencing a chunk
  // hash that no longer exists). Recover by reloading once to fetch fresh assets.
  static isChunkLoadError(error: Error | null): boolean {
    const msg = error?.message || '';
    return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed/i.test(msg);
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (ErrorBoundary.isChunkLoadError(error)) {
      // One-shot reload guard so a genuinely-broken chunk doesn't loop forever.
      if (sessionStorage.getItem('chunk-reload-eb') !== '1') {
        sessionStorage.setItem('chunk-reload-eb', '1');
        window.location.reload();
        return;
      }
    }
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isChunk = ErrorBoundary.isChunkLoadError(this.state.error);
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <div className="text-center">
              <div className="text-danger-600 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              {isChunk ? (
                <>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">A new version is available</h1>
                  <p className="text-gray-600 mb-4">The app was updated. Reload to get the latest version — your data is safe.</p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h1>
                  <p className="text-gray-600 mb-4">The application encountered an error.</p>
                  {this.state.error && (
                    <div className="bg-danger-50 border border-red-200 rounded p-4 mb-4 text-left">
                      <p className="text-sm text-danger-800 font-mono break-all">
                        {this.state.error.message}
                      </p>
                    </div>
                  )}
                </>
              )}
              {isChunk ? (
                <button
                  onClick={() => { sessionStorage.removeItem('chunk-reload-eb'); window.location.reload(); }}
                  className="btn-primary"
                >
                  Reload
                </button>
              ) : (
                <button
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    window.location.href = '/login';
                  }}
                  className="btn-primary"
                >
                  Return to Login
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
