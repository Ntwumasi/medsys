import React from 'react';

interface SessionTimeoutModalProps {
  isVisible: boolean;
  remainingSeconds: number;
  onExtend: () => void;
  onLogout: () => void;
}

const SessionTimeoutModal: React.FC<SessionTimeoutModalProps> = ({
  isVisible,
  remainingSeconds,
  onExtend,
  onLogout,
}) => {
  if (!isVisible) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds} seconds`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl shadow-xl border border-border p-6 max-w-md w-full mx-4 animate-fade-in">
        {/* Warning Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-warning-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-text-primary text-center mb-2">
          Session Expiring Soon
        </h2>

        {/* Message */}
        <p className="text-text-secondary text-center mb-4">
          Your session will expire due to inactivity. You will be logged out in:
        </p>

        {/* Countdown */}
        <div className="text-center mb-6">
          <span className="text-3xl font-bold text-danger-600">
            {timeDisplay}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2 border border-border rounded-lg text-text-secondary hover:bg-background transition-colors"
          >
            Logout Now
          </button>
          <button
            onClick={onExtend}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            Stay Logged In
          </button>
        </div>

        {/* HIPAA Notice */}
        <p className="text-xs text-text-tertiary text-center mt-4">
          For security, sessions automatically end after 30 minutes of inactivity.
        </p>
      </div>
    </div>
  );
};

export default SessionTimeoutModal;
