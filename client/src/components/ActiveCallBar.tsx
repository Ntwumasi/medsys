import React from 'react';
import { useVoIP } from '../context/VoIPContext';

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const ActiveCallBar: React.FC = () => {
  const { callState, remoteUser, isMuted, callDuration, toggleMute, hangUp } = useVoIP();

  if (callState !== 'ringing_out' && callState !== 'connecting' && callState !== 'active') {
    return null;
  }

  return (
    <div className="fixed top-14 left-0 right-0 z-40 h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white flex items-center px-4 shadow-md">
      {/* Left: user info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-200" />
        </span>
        {remoteUser && (
          <span className="truncate text-sm font-medium">
            {remoteUser.name}
            <span className="ml-1.5 text-emerald-100 text-xs capitalize">({remoteUser.role})</span>
          </span>
        )}
      </div>

      {/* Center: status */}
      <div className="flex-1 text-center text-sm font-semibold">
        {callState === 'ringing_out' && (
          <span className="inline-flex items-center gap-1">
            Ringing
            <span className="animate-pulse">...</span>
          </span>
        )}
        {callState === 'connecting' && (
          <span>Connecting...</span>
        )}
        {callState === 'active' && (
          <span className="font-mono">{formatDuration(callDuration)}</span>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3 flex-1 justify-end">
        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? 'bg-white/20 text-red-200' : 'hover:bg-white/10'
          }`}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            /* Mic off */
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            /* Mic on */
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Hang up */}
        <button
          onClick={hangUp}
          className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
          aria-label="Hang up"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ActiveCallBar;
