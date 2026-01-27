import React, { useState } from 'react';
import { useSmartDictation } from '../hooks/useSmartDictation';
import type { ParsedSection } from '../hooks/useSmartDictation';

interface ExistingSection {
  id: string;
  content: string;
}

interface SmartDictationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (sections: { id: string; content: string }[]) => void;
  existingSections: ExistingSection[];
}

type MergeMode = 'replace' | 'append' | 'prepend';

const SmartDictationModal: React.FC<SmartDictationModalProps> = ({
  isOpen,
  onClose,
  onApply,
  existingSections,
}) => {
  const {
    isRecording,
    isSupported,
    transcript,
    interimTranscript,
    recordingError,
    isParsing,
    parsedSections,
    parseError,
    startRecording,
    stopRecording,
    parseTranscript,
    updateParsedSection,
    toggleSectionSelection,
    selectAllSections,
    deselectAllSections,
    reset,
  } = useSmartDictation();

  const [step, setStep] = useState<'record' | 'review'>('record');
  const [mergeMode, setMergeMode] = useState<MergeMode>('append');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParse = async () => {
    const success = await parseTranscript();
    if (success) {
      setStep('review');
    }
  };

  const handleApply = () => {
    const selectedSections = parsedSections
      .filter((s: ParsedSection) => s.selected && s.content.trim())
      .map((s: ParsedSection) => {
        const existing = existingSections.find((e) => e.id === s.id);
        let finalContent = s.content;

        if (existing?.content.trim()) {
          switch (mergeMode) {
            case 'replace':
              finalContent = s.content;
              break;
            case 'append':
              finalContent = `${existing.content}\n\n${s.content}`;
              break;
            case 'prepend':
              finalContent = `${s.content}\n\n${existing.content}`;
              break;
          }
        }

        return { id: s.id, content: finalContent };
      });

    onApply(selectedSections);
    handleClose();
  };

  const handleClose = () => {
    reset();
    setStep('record');
    setEditingSectionId(null);
    onClose();
  };

  const handleBack = () => {
    setStep('record');
    setEditingSectionId(null);
  };

  // Check which sections have existing content
  const sectionsWithExisting = parsedSections.filter((s: ParsedSection) =>
    existingSections.find((e) => e.id === s.id && e.content.trim())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="absolute inset-4 md:inset-8 lg:inset-12 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold">Smart Dictation</h2>
              <p className="text-purple-200 text-sm">
                {step === 'record' ? 'Step 1: Record your notes' : 'Step 2: Review & Confirm'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'record' ? (
            /* Recording Step */
            <div className="max-w-3xl mx-auto space-y-6">
              {!isSupported && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  <p className="font-medium">Voice dictation is not supported in this browser.</p>
                  <p className="text-sm mt-1">Please use Chrome, Edge, or Safari.</p>
                </div>
              )}

              {/* Recording Controls */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={!isSupported}
                  className={`
                    w-24 h-24 rounded-full flex items-center justify-center transition-all
                    ${isRecording
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                      : 'bg-purple-500 hover:bg-purple-600'}
                    ${!isSupported ? 'opacity-50 cursor-not-allowed' : ''}
                    text-white shadow-lg
                  `}
                >
                  {isRecording ? (
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
                      <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.08A7 7 0 0019 11z" />
                    </svg>
                  )}
                </button>
                <p className="mt-4 text-gray-600 font-medium">
                  {isRecording ? 'Recording... Click to stop' : 'Click to start recording'}
                </p>
              </div>

              {recordingError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {recordingError}
                </div>
              )}

              {/* Live Transcript */}
              <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 min-h-[200px]">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Transcript
                </div>
                <div className="text-gray-800 whitespace-pre-wrap">
                  {transcript || (
                    <span className="text-gray-400 italic">
                      Start speaking to see your transcript here...
                    </span>
                  )}
                  {interimTranscript && (
                    <span className="text-gray-400 italic"> {interimTranscript}</span>
                  )}
                </div>
              </div>

              {/* Tips */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">Tips for best results:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>- Speak naturally, as if dictating to a medical scribe</li>
                  <li>- Mention section names (e.g., "Past medical history includes...")</li>
                  <li>- Say "period" or "comma" for punctuation</li>
                  <li>- Say "new paragraph" to separate sections</li>
                  <li>- Say "stop dictation" when finished</li>
                </ul>
              </div>
            </div>
          ) : (
            /* Review Step */
            <div className="space-y-6">
              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {parseError}
                </div>
              )}

              {/* Selection Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    {parsedSections.filter((s: ParsedSection) => s.selected).length} of {parsedSections.length} sections selected
                  </span>
                  <button
                    onClick={selectAllSections}
                    className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAllSections}
                    className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Deselect All
                  </button>
                </div>

                {sectionsWithExisting.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">When section has content:</span>
                    <select
                      value={mergeMode}
                      onChange={(e) => setMergeMode(e.target.value as MergeMode)}
                      className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    >
                      <option value="append">Append to existing</option>
                      <option value="prepend">Prepend to existing</option>
                      <option value="replace">Replace existing</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Parsed Sections */}
              <div className="space-y-4">
                {parsedSections.map((section: ParsedSection) => {
                  const hasExisting = existingSections.find(
                    (e) => e.id === section.id && e.content.trim()
                  );
                  const isEditing = editingSectionId === section.id;

                  return (
                    <div
                      key={section.id}
                      className={`border-2 rounded-xl overflow-hidden transition-all ${
                        section.selected
                          ? 'border-purple-300 bg-purple-50/50'
                          : 'border-gray-200 bg-gray-50/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={section.selected}
                            onChange={() => toggleSectionSelection(section.id)}
                            className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
                          />
                          <h4 className="font-semibold text-gray-800">{section.title}</h4>
                          {hasExisting && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">
                              Has existing content
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setEditingSectionId(isEditing ? null : section.id)}
                          className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                        >
                          {isEditing ? 'Done' : 'Edit'}
                        </button>
                      </div>
                      <div className="p-4">
                        {isEditing ? (
                          <textarea
                            value={section.content}
                            onChange={(e) => updateParsedSection(section.id, e.target.value)}
                            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                          />
                        ) : (
                          <p className="text-gray-700 whitespace-pre-wrap">{section.content}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {parsedSections.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium">No sections were parsed from the transcript.</p>
                  <p className="text-sm mt-2">Try dictating more specific clinical information.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div>
            {step === 'review' && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Recording
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors"
            >
              Cancel
            </button>
            {step === 'record' ? (
              <button
                type="button"
                onClick={handleParse}
                disabled={!transcript.trim() || isParsing}
                className={`
                  px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2
                  ${transcript.trim() && !isParsing
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                `}
              >
                {isParsing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Parsing with AI...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Parse with AI
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApply}
                disabled={parsedSections.filter((s: ParsedSection) => s.selected).length === 0}
                className={`
                  px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2
                  ${parsedSections.filter((s: ParsedSection) => s.selected).length > 0
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                `}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Apply {parsedSections.filter((s: ParsedSection) => s.selected).length} Section{parsedSections.filter((s: ParsedSection) => s.selected).length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartDictationModal;
