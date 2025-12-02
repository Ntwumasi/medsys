import React, { useEffect, useCallback } from 'react';
import { useVoiceDictation } from '../hooks/useVoiceDictation';

interface VoiceDictationButtonProps {
  onTranscriptChange: (text: string) => void;
  currentValue: string;
  appendMode?: boolean; // If true, appends to current value; if false, replaces
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
}

export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  onTranscriptChange,
  currentValue,
  appendMode = true,
  className = '',
  disabled = false,
  size = 'md',
  showStatus = true,
}) => {
  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
    toggleListening,
    stopListening,
    resetTranscript,
  } = useVoiceDictation({
    continuous: true,
    language: 'en-US',
  });

  // Update the text field when we get a final transcript
  useEffect(() => {
    if (transcript) {
      if (appendMode) {
        const separator = currentValue && !currentValue.endsWith(' ') && !currentValue.endsWith('\n') ? ' ' : '';
        onTranscriptChange(currentValue + separator + transcript);
      } else {
        onTranscriptChange(transcript);
      }
      resetTranscript();
    }
  }, [transcript, appendMode, currentValue, onTranscriptChange, resetTranscript]);

  // Stop listening when component unmounts or is disabled
  useEffect(() => {
    if (disabled && isListening) {
      stopListening();
    }
  }, [disabled, isListening, stopListening]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    toggleListening();
  }, [disabled, toggleListening]);

  // Size classes
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        className={`${sizeClasses[size]} rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed ${className}`}
        title="Voice dictation not supported in this browser"
      >
        <MicrophoneOffIcon className={iconSizes[size]} />
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`
          ${sizeClasses[size]}
          rounded-lg
          transition-all
          duration-200
          focus:outline-none
          focus:ring-2
          focus:ring-offset-2
          ${
            isListening
              ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500 animate-pulse'
              : disabled
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-primary-100 hover:bg-primary-200 text-primary-700 focus:ring-primary-500'
          }
          ${className}
        `}
        title={isListening ? 'Stop dictation' : 'Start voice dictation'}
      >
        {isListening ? (
          <MicrophoneActiveIcon className={iconSizes[size]} />
        ) : (
          <MicrophoneIcon className={iconSizes[size]} />
        )}
      </button>

      {/* Status indicator */}
      {showStatus && (isListening || interimTranscript || error) && (
        <div className="absolute left-full ml-2 whitespace-nowrap z-10">
          {error ? (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {error}
            </span>
          ) : isListening ? (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {interimTranscript ? (
                <span className="max-w-[200px] truncate italic text-gray-600">
                  {interimTranscript}
                </span>
              ) : (
                'Listening...'
              )}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
};

// Microphone Icons
const MicrophoneIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
    />
  </svg>
);

const MicrophoneActiveIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
    <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.08A7 7 0 0019 11z" />
  </svg>
);

const MicrophoneOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M5.636 5.636l12.728 12.728M9 9v2a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6"
    />
  </svg>
);

export default VoiceDictationButton;
