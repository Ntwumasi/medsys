import React, { useState } from 'react';

interface AllergyWarning {
  allergen: string;
  reaction: string;
  severity: string;
  match_type: string;
  explanation: string;
}

interface AllergyWarningModalProps {
  isOpen: boolean;
  medicationName: string;
  warnings: AllergyWarning[];
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const AllergyWarningModal: React.FC<AllergyWarningModalProps> = ({
  isOpen,
  medicationName,
  warnings,
  onConfirm,
  onCancel,
}) => {
  const [overrideReason, setOverrideReason] = useState('');

  if (!isOpen || warnings.length === 0) return null;

  const hasSevere = warnings.some(w => w.severity === 'severe');
  const hasExact = warnings.some(w => w.match_type === 'exact');

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'severe':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'moderate':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  };

  const getMatchLabel = (type: string) => {
    switch (type) {
      case 'exact': return 'Direct Match';
      case 'cross_reactivity': return 'Cross-Reactivity';
      case 'ai_detected': return 'AI Detected';
      default: return type;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-slide-in-up">
        {/* Header */}
        <div className={`px-6 py-4 ${hasSevere || hasExact ? 'bg-red-600' : 'bg-orange-500'}`}>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-full p-2">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Allergy Warning</h2>
              <p className="text-white/90 text-sm">
                {medicationName} may cause an allergic reaction
              </p>
            </div>
          </div>
        </div>

        {/* Warnings */}
        <div className="px-6 py-4 space-y-3 max-h-[300px] overflow-y-auto">
          {warnings.map((warning, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border ${getSeverityBadge(warning.severity)}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">
                  Allergen: {warning.allergen}
                </span>
                <div className="flex gap-1.5">
                  <span className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded bg-white/50">
                    {warning.severity}
                  </span>
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-white/50">
                    {getMatchLabel(warning.match_type)}
                  </span>
                </div>
              </div>
              <p className="text-sm mt-1">{warning.explanation}</p>
              {warning.reaction && warning.reaction !== 'Unknown reaction' && (
                <p className="text-xs mt-1 opacity-80">
                  Known reaction: {warning.reaction}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Override section */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            To proceed, provide a clinical reason for overriding this warning:
          </label>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="e.g., Patient has tolerated this medication before, benefit outweighs risk..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex gap-3 justify-end border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(overrideReason)}
            disabled={!overrideReason.trim()}
            className={`px-5 py-2.5 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
              overrideReason.trim()
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default AllergyWarningModal;
