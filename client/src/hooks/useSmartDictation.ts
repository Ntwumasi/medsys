import { useState, useCallback, useRef } from 'react';
import { useVoiceDictation } from './useVoiceDictation';
import apiClient from '../api/client';
import type { ApiError } from '../types';

export interface ParsedSection {
  id: string;
  title: string;
  content: string;
  selected: boolean;
}

interface UseSmartDictationReturn {
  // Voice recording states
  isRecording: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  recordingError: string | null;

  // Smart parsing states
  isParsing: boolean;
  parsedSections: ParsedSection[];
  parseError: string | null;

  // Actions
  startRecording: () => void;
  stopRecording: () => void;
  parseTranscript: () => Promise<boolean>;
  updateParsedSection: (sectionId: string, content: string) => void;
  toggleSectionSelection: (sectionId: string) => void;
  selectAllSections: () => void;
  deselectAllSections: () => void;
  reset: () => void;
  clearTranscript: () => void;
}

export const useSmartDictation = (): UseSmartDictationReturn => {
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedSections, setParsedSections] = useState<ParsedSection[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const transcriptRef = useRef('');

  const {
    isListening: isRecording,
    isSupported,
    interimTranscript,
    error: recordingError,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceDictation({
    continuous: true,
    processCommands: true,
    onTranscript: (newTranscript: string) => {
      transcriptRef.current = newTranscript;
      setAccumulatedTranscript(newTranscript);
    },
  });

  const parseTranscript = useCallback(async (): Promise<boolean> => {
    const currentTranscript = transcriptRef.current || accumulatedTranscript;

    if (!currentTranscript.trim()) {
      setParseError('No transcript to parse. Please record some dictation first.');
      return false;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const response = await apiClient.post('/hp/parse-dictation', {
        transcript: currentTranscript.trim(),
      });

      const { sections, sectionMeta } = response.data;

      const parsed: ParsedSection[] = sectionMeta.map((meta: { id: string; title: string }) => ({
        id: meta.id,
        title: meta.title,
        content: sections[meta.id] || '',
        selected: true,
      }));

      setParsedSections(parsed);
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      const message = apiError.response?.data?.error || 'Failed to parse dictation. Please try again.';
      setParseError(message);
      return false;
    } finally {
      setIsParsing(false);
    }
  }, [accumulatedTranscript]);

  const updateParsedSection = useCallback((sectionId: string, content: string) => {
    setParsedSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, content } : s))
    );
  }, []);

  const toggleSectionSelection = useCallback((sectionId: string) => {
    setParsedSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, selected: !s.selected } : s))
    );
  }, []);

  const selectAllSections = useCallback(() => {
    setParsedSections((prev) => prev.map((s) => ({ ...s, selected: true })));
  }, []);

  const deselectAllSections = useCallback(() => {
    setParsedSections((prev) => prev.map((s) => ({ ...s, selected: false })));
  }, []);

  const clearTranscript = useCallback(() => {
    setAccumulatedTranscript('');
    transcriptRef.current = '';
    resetTranscript();
  }, [resetTranscript]);

  const reset = useCallback(() => {
    setAccumulatedTranscript('');
    transcriptRef.current = '';
    setParsedSections([]);
    setParseError(null);
    resetTranscript();
  }, [resetTranscript]);

  return {
    isRecording,
    isSupported,
    transcript: accumulatedTranscript,
    interimTranscript,
    recordingError,
    isParsing,
    parsedSections,
    parseError,
    startRecording: startListening,
    stopRecording: stopListening,
    parseTranscript,
    updateParsedSection,
    toggleSectionSelection,
    selectAllSections,
    deselectAllSections,
    reset,
    clearTranscript,
  };
};

export default useSmartDictation;
