import React from 'react';
import { useVoIP } from '../context/VoIPContext';

const IncomingCallModal: React.FC = () => {
  const { callState, remoteUser, acceptCall, declineCall } = useVoIP();

  if (callState !== 'ringing_in' || !remoteUser) return null;

  return (
    <>
      <style>{`
        @keyframes ring-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
        @keyframes ring-ripple {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .ring-icon { animation: ring-pulse 1.2s ease-in-out infinite; }
        .ring-ripple { animation: ring-ripple 1.5s ease-out infinite; }
        .ring-ripple-delay { animation: ring-ripple 1.5s ease-out 0.5s infinite; }
      `}</style>

      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 flex flex-col items-center gap-4">
          {/* Pulsing phone icon */}
          <div className="relative flex items-center justify-center w-20 h-20">
            <span className="absolute inset-0 rounded-full bg-emerald-400/30 ring-ripple" />
            <span className="absolute inset-0 rounded-full bg-emerald-400/20 ring-ripple-delay" />
            <span className="ring-icon flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
          </div>

          {/* Caller info */}
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{remoteUser.name}</p>
            <p className="text-sm text-gray-500 capitalize">{remoteUser.role}</p>
          </div>

          {/* Incoming label */}
          <p className="text-sm text-gray-400 animate-pulse">Incoming call...</p>

          {/* Action buttons */}
          <div className="flex items-center gap-8 mt-2">
            {/* Accept */}
            <button
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg transition-colors"
              aria-label="Accept call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>

            {/* Decline */}
            <button
              onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-colors"
              aria-label="Decline call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default IncomingCallModal;
