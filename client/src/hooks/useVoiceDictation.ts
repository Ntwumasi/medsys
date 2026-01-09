import { useState, useEffect, useCallback, useRef } from 'react';

// Voice command mappings - industry standard dictation commands
const VOICE_COMMANDS: Record<string, string> = {
  // Punctuation
  'period': '.',
  'full stop': '.',
  'dot': '.',
  'comma': ',',
  'question mark': '?',
  'exclamation point': '!',
  'exclamation mark': '!',
  'colon': ':',
  'semicolon': ';',
  'hyphen': '-',
  'dash': '-',
  'ellipsis': '...',

  // Quotes and brackets
  'open quote': '"',
  'close quote': '"',
  'quote': '"',
  'open parenthesis': '(',
  'left parenthesis': '(',
  'close parenthesis': ')',
  'right parenthesis': ')',
  'open bracket': '[',
  'close bracket': ']',

  // Line breaks
  'new line': '\n',
  'next line': '\n',
  'newline': '\n',
  'new paragraph': '\n\n',
  'next paragraph': '\n\n',

  // Common medical
  'degree': '°',
  'degrees': '°',
  'percent': '%',
  'percentage': '%',
  'number sign': '#',
  'hashtag': '#',
  'at sign': '@',
  'ampersand': '&',
  'and sign': '&',
  'plus sign': '+',
  'minus sign': '-',
  'equals sign': '=',
  'forward slash': '/',
  'slash': '/',
  'backslash': '\\',
};

// Commands that control dictation behavior
const CONTROL_COMMANDS = ['stop dictation', 'end dictation', 'stop recording', 'end recording'];

// Process transcript to replace voice commands with their symbols
const processVoiceCommands = (text: string): { processed: string; shouldStop: boolean } => {
  let processed = text;
  let shouldStop = false;

  // Check for stop commands
  const lowerText = text.toLowerCase().trim();
  for (const cmd of CONTROL_COMMANDS) {
    if (lowerText.includes(cmd)) {
      shouldStop = true;
      processed = processed.replace(new RegExp(cmd, 'gi'), '').trim();
    }
  }

  // Replace voice commands with their symbols
  for (const [command, symbol] of Object.entries(VOICE_COMMANDS)) {
    // Match command as a whole word (case insensitive)
    const regex = new RegExp(`\\b${command}\\b`, 'gi');
    processed = processed.replace(regex, symbol);
  }

  // Clean up extra spaces around punctuation
  processed = processed
    .replace(/\s+([.,!?;:])/g, '$1')  // Remove space before punctuation
    .replace(/\(\s+/g, '(')            // Remove space after open paren
    .replace(/\s+\)/g, ')')            // Remove space before close paren
    .replace(/"\s+/g, '"')             // Handle quotes
    .replace(/\s+"/g, '"');

  return { processed, shouldStop };
};

interface UseVoiceDictationOptions {
  onTranscript?: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  continuous?: boolean;
  language?: string;
  processCommands?: boolean; // Enable voice command processing
}

interface UseVoiceDictationReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  resetTranscript: () => void;
}

// Extend Window interface for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

type SpeechRecognitionType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionType;
    webkitSpeechRecognition: new () => SpeechRecognitionType;
  }
}

export const useVoiceDictation = (
  options: UseVoiceDictationOptions = {}
): UseVoiceDictationReturn => {
  const {
    onTranscript,
    onInterimTranscript,
    continuous = true,
    language = 'en-US',
    processCommands = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const isManualStop = useRef(false);

  // Check for browser support
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = continuous;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onend = () => {
        setIsListening(false);
        // Auto-restart if continuous mode and not manually stopped
        if (continuous && !isManualStop.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // Ignore if already started
          }
        }
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            currentInterim += result[0].transcript;
          }
        }

        if (finalTranscript) {
          // Process voice commands if enabled
          let processedTranscript = finalTranscript;
          let shouldStop = false;

          if (processCommands) {
            const result = processVoiceCommands(finalTranscript);
            processedTranscript = result.processed;
            shouldStop = result.shouldStop;
          }

          if (processedTranscript.trim()) {
            setTranscript((prev) => {
              const newTranscript = prev + (prev ? ' ' : '') + processedTranscript;
              onTranscript?.(newTranscript);
              return newTranscript;
            });
          }

          // Stop dictation if control command was detected
          if (shouldStop) {
            isManualStop.current = true;
            recognition.stop();
          }
        }

        setInterimTranscript(currentInterim);
        if (currentInterim) {
          onInterimTranscript?.(currentInterim);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Don't treat 'no-speech' or 'aborted' as errors in continuous mode
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }

        let errorMessage = 'Speech recognition error';
        switch (event.error) {
          case 'not-allowed':
            errorMessage = 'Microphone access denied. Please allow microphone access.';
            break;
          case 'network':
            errorMessage = 'Network error. Please check your connection.';
            break;
          case 'audio-capture':
            errorMessage = 'No microphone found. Please connect a microphone.';
            break;
          default:
            errorMessage = `Speech recognition error: ${event.error}`;
        }
        setError(errorMessage);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        isManualStop.current = true;
        recognitionRef.current.abort();
      }
    };
  }, [continuous, language, onTranscript, onInterimTranscript, processCommands]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    setError(null);
    isManualStop.current = false;
    setTranscript('');
    setInterimTranscript('');

    try {
      recognitionRef.current.start();
    } catch {
      // Already started, ignore
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;

    isManualStop.current = true;
    recognitionRef.current.stop();
    setInterimTranscript('');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  };
};

export default useVoiceDictation;
