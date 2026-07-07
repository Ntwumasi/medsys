import React, { useRef, useState } from 'react';
import aiApi, { AIUnavailableError } from '../../api/ai';
import type { VoiceCommandResult } from '../../api/ai';

interface VoiceCommandBarProps {
  /** Called with the parsed command so the parent can act on it (optional). */
  onParsed?: (result: VoiceCommandResult, transcript: string) => void;
}

// Pharmacy "quick command" bar: the pharmacist types or dictates a natural
// request ("dispense 20 amoxicillin for Kwame Mensah") and the AI parses it into
// a structured action preview. Parsing only — it never auto-dispenses; the
// pharmacist confirms and acts through the normal flow.
const VoiceCommandBar: React.FC<VoiceCommandBarProps> = ({ onParsed }) => {
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<VoiceCommandResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const toggleListen = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      setTranscript((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const parse = async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    setResult(null);
    try {
      const res = await aiApi.parseVoiceCommand({ transcript: transcript.trim(), includeContext: true });
      setResult(res);
      onParsed?.(res, transcript.trim());
    } catch (err) {
      if (err instanceof AIUnavailableError) setUnavailable(true);
      else setError((err as any)?.response?.data?.error || 'Could not parse the command.');
    } finally {
      setLoading(false);
    }
  };

  const confColor = (c?: string) =>
    c === 'high' ? 'bg-green-100 text-green-800' : c === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-xs font-semibold text-primary-700 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z" />
          </svg>
          Quick command
        </div>
        <input
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') parse(); }}
          placeholder='e.g. "dispense 20 amoxicillin 500mg for Kwame Mensah"'
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        {speechSupported && (
          <button
            onClick={toggleListen}
            title={listening ? 'Stop' : 'Dictate'}
            className={`p-2 rounded-lg border ${listening ? 'bg-red-50 border-red-300 text-red-600 animate-pulse' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z" />
            </svg>
          </button>
        )}
        <button onClick={parse} disabled={loading || !transcript.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50 shrink-0">
          {loading ? 'Parsing…' : 'Parse'}
        </button>
      </div>

      {unavailable && (
        <p className="mt-2 text-xs text-amber-700">AI command parsing isn’t configured on this environment.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {result && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {result.confirmationPrompt && (
            <p className="text-sm text-gray-900 font-medium mb-2">{result.confirmationPrompt}</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">action: {result.action}</span>
            {result.medication && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">med: {result.medication}</span>}
            {result.quantity != null && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">qty: {result.quantity}</span>}
            {result.patient?.searchTerm && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">patient: {result.patient.searchTerm}</span>}
            <span className={`px-2 py-0.5 rounded-full font-semibold ${confColor(result.confidence)}`}>confidence: {result.confidence}</span>
          </div>
          {result.specialInstructions && (
            <p className="mt-2 text-xs text-gray-500">Notes: {result.specialInstructions}</p>
          )}
          {!result.understood && (
            <p className="mt-2 text-xs text-amber-700">Command not fully understood — please rephrase or use the manual flow.</p>
          )}
          <p className="mt-2 text-[11px] text-gray-400">Preview only — confirm and dispense through the normal flow.</p>
        </div>
      )}
    </div>
  );
};

export default VoiceCommandBar;
