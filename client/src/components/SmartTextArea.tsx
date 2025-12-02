import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMedicalAutocomplete } from '../hooks/useMedicalAutocomplete';
import { VoiceDictationButton } from './VoiceDictationButton';

interface SmartTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  sectionId?: string;
  showVoiceDictation?: boolean;
  disabled?: boolean;
  required?: boolean;
  label?: string;
}

export const SmartTextArea: React.FC<SmartTextAreaProps> = ({
  value,
  onChange,
  placeholder = '',
  className = '',
  rows = 6,
  sectionId,
  showVoiceDictation = true,
  disabled = false,
  required = false,
  label,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  const {
    suggestions,
    selectedIndex,
    showSuggestions,
    getSuggestions,
    handleKeyDown,
    clearSuggestions,
    setSelectedIndex,
  } = useMedicalAutocomplete({
    sectionId,
    maxSuggestions: 8,
    minQueryLength: 2,
  });

  // Handle text changes
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart || 0;

    onChange(newValue);
    setCursorPosition(newCursorPos);
    getSuggestions(newValue, newCursorPos);
  }, [onChange, getSuggestions]);

  // Handle keyboard navigation
  const handleKeyDownEvent = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const result = handleKeyDown(e, value, cursorPosition);

    if (result.handled && result.newText !== undefined) {
      onChange(result.newText);

      // Set cursor position after the inserted suggestion
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = result.newText!.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
          textareaRef.current.focus();
        }
      }, 0);
    }
  }, [handleKeyDown, value, cursorPosition, onChange]);

  // Handle clicking a suggestion
  const handleSuggestionClick = useCallback((suggestion: string, index: number) => {
    if (!textareaRef.current) return;

    // Get the current word boundaries
    const text = value;
    let startIndex = cursorPosition;
    while (startIndex > 0 && !/\s/.test(text[startIndex - 1])) {
      startIndex--;
    }
    let endIndex = cursorPosition;
    while (endIndex < text.length && !/\s/.test(text[endIndex])) {
      endIndex++;
    }

    // Replace the current word with the suggestion
    const before = text.slice(0, startIndex);
    const after = text.slice(endIndex);
    const newText = before + suggestion + (after.startsWith(' ') ? '' : ' ') + after;

    onChange(newText);
    clearSuggestions();

    // Focus back to textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = startIndex + suggestion.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    }, 0);
  }, [value, cursorPosition, onChange, clearSuggestions]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        clearSuggestions();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [clearSuggestions]);

  // Track cursor position on click/selection
  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPosition(target.selectionStart || 0);
  }, []);

  // Handle blur
  const handleBlur = useCallback(() => {
    // Delay clearing so click on suggestion can register
    setTimeout(() => {
      clearSuggestions();
    }, 200);
  }, [clearSuggestions]);

  return (
    <div className="relative">
      {/* Header with label and voice dictation */}
      {(label || showVoiceDictation) && (
        <div className="flex items-center justify-between mb-2">
          {label && (
            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {label}
            </label>
          )}
          {showVoiceDictation && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Voice</span>
              <VoiceDictationButton
                onTranscriptChange={onChange}
                currentValue={value}
                appendMode={true}
                size="sm"
                showStatus={true}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}

      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDownEvent}
          onSelect={handleSelect}
          onBlur={handleBlur}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          required={required}
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all shadow-sm hover:border-gray-300 ${
            disabled ? 'bg-gray-100 cursor-not-allowed' : ''
          } ${className}`}
        />

        {/* Autocomplete suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-lg max-h-64 overflow-y-auto"
          >
            <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
              <div className="flex items-center gap-2 text-xs text-blue-700 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Medical Term Suggestions
                <span className="text-gray-500 ml-auto">↑↓ navigate • Tab/Enter select • Esc close</span>
              </div>
            </div>
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion, index)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`px-4 py-2.5 cursor-pointer transition-colors flex items-center gap-3 ${
                  index === selectedIndex
                    ? 'bg-blue-100 text-blue-900'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <svg className={`w-4 h-4 flex-shrink-0 ${index === selectedIndex ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium">{suggestion}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Helper text */}
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Type to see medical term suggestions
      </div>
    </div>
  );
};

export default SmartTextArea;
