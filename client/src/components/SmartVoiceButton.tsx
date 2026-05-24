import React, { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

interface SmartVoiceButtonProps {
  /** Receives the polished AI output. Caller is responsible for merge behaviour. */
  onPolishedText: (polished: string) => void;
  /** Current section context — drives the AI's formatting rules. */
  sectionId: string;
  sectionTitle: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
}

type Stage = 'idle' | 'recording' | 'transcribing' | 'polishing' | 'error';

const sizeClasses = { sm: 'p-1.5', md: 'p-2', lg: 'p-3' } as const;
const iconSizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' } as const;

const pickAudioMime = (): string => {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // strip "data:audio/webm;base64,"
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const SmartVoiceButton: React.FC<SmartVoiceButtonProps> = ({
  onPolishedText,
  sectionId,
  sectionTitle,
  className = '',
  disabled = false,
  size = 'sm',
  showStatus = true,
}) => {
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeRef = useRef<string>('audio/webm');

  const stopMicTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopMicTracks(), [stopMicTracks]);

  const processRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: mimeRef.current });
    chunksRef.current = [];
    stopMicTracks();

    if (blob.size === 0) {
      setStage('idle');
      return;
    }

    try {
      setStage('transcribing');
      const audio_base64 = await blobToBase64(blob);
      const trxRes = await apiClient.post('/hp/transcribe', {
        audio_base64,
        mime_type: mimeRef.current,
      });
      const raw = (trxRes.data?.text || '').trim();
      if (!raw) {
        setStage('idle');
        return;
      }

      setStage('polishing');
      const polishRes = await apiClient.post('/hp/polish-section', {
        section_id: sectionId,
        section_title: sectionTitle,
        raw_text: raw,
      });
      const polished = (polishRes.data?.polished_text || '').trim();
      if (polished) {
        onPolishedText(polished);
      }
      setStage('idle');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Smart dictation failed';
      setErrorMessage(msg);
      setStage('error');
      // Auto-clear error after 4s so the button is usable again
      setTimeout(() => {
        setStage('idle');
        setErrorMessage(null);
      }, 4000);
    }
  }, [onPolishedText, sectionId, sectionTitle, stopMicTracks]);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime();
      mimeRef.current = mime;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => { void processRecording(); };
      recorder.start();
      recorderRef.current = recorder;
      setStage('recording');
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone access denied'
        : err?.message || 'Could not access microphone';
      setErrorMessage(msg);
      setStage('error');
      setTimeout(() => { setStage('idle'); setErrorMessage(null); }, 4000);
    }
  }, [processRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const handleClick = useCallback(() => {
    if (disabled || stage === 'transcribing' || stage === 'polishing') return;
    if (stage === 'recording') stopRecording();
    else void startRecording();
  }, [disabled, stage, startRecording, stopRecording]);

  const isBusy = stage === 'transcribing' || stage === 'polishing';
  const isRecording = stage === 'recording';

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isBusy}
        className={`
          ${sizeClasses[size]}
          rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
          ${isRecording
            ? 'bg-danger-500 hover:bg-danger-600 text-white focus:ring-danger-500 animate-pulse'
            : isBusy
            ? 'bg-secondary-100 text-secondary-600 cursor-wait'
            : disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-secondary-100 hover:bg-secondary-200 text-secondary-700 focus:ring-secondary-500'}
          ${className}
        `}
        title={
          isRecording ? 'Stop and polish with AI'
          : isBusy ? 'Processing…'
          : 'Smart dictate (AI polish for this section)'
        }
      >
        {isBusy ? (
          <Spinner className={iconSizes[size]} />
        ) : isRecording ? (
          <MicrophoneActiveIcon className={iconSizes[size]} />
        ) : (
          <SparkleMicIcon className={iconSizes[size]} />
        )}
      </button>

      {showStatus && (isRecording || isBusy || errorMessage) && (
        <div className="absolute left-full ml-2 whitespace-nowrap z-10">
          {errorMessage ? (
            <span className="text-xs text-danger-600 bg-danger-50 px-2 py-1 rounded">{errorMessage}</span>
          ) : isRecording ? (
            <span className="text-xs text-danger-600 bg-danger-50 px-2 py-1 rounded flex items-center gap-1">
              <span className="w-2 h-2 bg-danger-500 rounded-full animate-pulse" />
              Recording…
            </span>
          ) : stage === 'transcribing' ? (
            <span className="text-xs text-secondary-700 bg-secondary-50 px-2 py-1 rounded">Transcribing…</span>
          ) : (
            <span className="text-xs text-secondary-700 bg-secondary-50 px-2 py-1 rounded">Polishing with AI…</span>
          )}
        </div>
      )}
    </div>
  );
};

const SparkleMicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v4m-3 0h6" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 3l.7 1.5L19 5l-1.3.5L17 7l-.7-1.5L15 5l1.3-.5L17 3z" />
  </svg>
);

const MicrophoneActiveIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
    <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.08A7 7 0 0019 11z" />
  </svg>
);

const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default SmartVoiceButton;
