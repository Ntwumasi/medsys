import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMedicalTerms } from '../data/medicalTerms';

interface UseMedicalAutocompleteOptions {
  sectionId?: string;
  maxSuggestions?: number;
  minQueryLength?: number;
  debounceMs?: number;
}

interface UseMedicalAutocompleteReturn {
  suggestions: string[];
  isLoading: boolean;
  selectedIndex: number;
  showSuggestions: boolean;
  getSuggestions: (text: string, cursorPosition: number) => void;
  selectSuggestion: (suggestion: string) => string;
  handleKeyDown: (e: React.KeyboardEvent, text: string, cursorPosition: number) => { handled: boolean; newText?: string };
  clearSuggestions: () => void;
  setSelectedIndex: (index: number) => void;
}

// Extract the current word being typed at cursor position
const getCurrentWord = (text: string, cursorPosition: number): { word: string; startIndex: number; endIndex: number } => {
  // Find the start of the current word
  let startIndex = cursorPosition;
  while (startIndex > 0 && !/\s/.test(text[startIndex - 1])) {
    startIndex--;
  }

  // Find the end of the current word
  let endIndex = cursorPosition;
  while (endIndex < text.length && !/\s/.test(text[endIndex])) {
    endIndex++;
  }

  return {
    word: text.slice(startIndex, cursorPosition),
    startIndex,
    endIndex,
  };
};

export const useMedicalAutocomplete = (
  options: UseMedicalAutocompleteOptions = {}
): UseMedicalAutocompleteReturn => {
  const {
    sectionId,
    maxSuggestions = 8,
    minQueryLength = 2,
    debounceMs = 150,
  } = options;

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentWordInfo, setCurrentWordInfo] = useState<{ word: string; startIndex: number; endIndex: number } | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const getSuggestions = useCallback((text: string, cursorPosition: number) => {
    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const wordInfo = getCurrentWord(text, cursorPosition);
    setCurrentWordInfo(wordInfo);

    if (wordInfo.word.length < minQueryLength) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedIndex(0);
      return;
    }

    setIsLoading(true);

    // Debounce the search
    debounceTimer.current = setTimeout(() => {
      const results = searchMedicalTerms(wordInfo.word, sectionId, maxSuggestions);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedIndex(0);
      setIsLoading(false);
    }, debounceMs);
  }, [sectionId, maxSuggestions, minQueryLength, debounceMs]);

  const selectSuggestion = useCallback((suggestion: string): string => {
    if (!currentWordInfo) return suggestion;

    // This returns the suggestion - the component will handle inserting it
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(0);

    return suggestion;
  }, [currentWordInfo]);

  const handleKeyDown = useCallback((
    e: React.KeyboardEvent,
    text: string,
    // cursorPosition parameter reserved for future use
  ): { handled: boolean; newText?: string } => {
    if (!showSuggestions || suggestions.length === 0) {
      return { handled: false };
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
        return { handled: true };

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return { handled: true };

      case 'Tab':
      case 'Enter':
        if (suggestions[selectedIndex] && currentWordInfo) {
          e.preventDefault();
          const selectedSuggestion = suggestions[selectedIndex];

          // Replace the current word with the suggestion
          const before = text.slice(0, currentWordInfo.startIndex);
          const after = text.slice(currentWordInfo.endIndex);
          const newText = before + selectedSuggestion + (after.startsWith(' ') ? '' : ' ') + after;

          setShowSuggestions(false);
          setSuggestions([]);
          setSelectedIndex(0);

          return { handled: true, newText };
        }
        return { handled: false };

      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setSuggestions([]);
        setSelectedIndex(0);
        return { handled: true };

      default:
        return { handled: false };
    }
  }, [showSuggestions, suggestions, selectedIndex, currentWordInfo]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(0);
    setCurrentWordInfo(null);
  }, []);

  return {
    suggestions,
    isLoading,
    selectedIndex,
    showSuggestions,
    getSuggestions,
    selectSuggestion,
    handleKeyDown,
    clearSuggestions,
    setSelectedIndex,
  };
};

export default useMedicalAutocomplete;
