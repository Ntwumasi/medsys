import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

// ⌘K / Ctrl+K global command palette. The most common power-user pattern
// in modern productivity apps (Linear, Notion, Vercel) and we adopted it
// here as the single entry point for: jumping to a patient, jumping to
// a page, or kicking off an AI action later. Replaces the dashboard's
// duplicated search bars and "How-To Guide" floating buttons.

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenGuide?: () => void;
}

interface PatientHit {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
}

interface NavCommand {
  id: string;
  label: string;
  hint: string;
  path: string;
  icon: React.ReactNode;
}

const ALL_NAV_COMMANDS: NavCommand[] = [
  { id: 'dashboard',     label: 'Go to Dashboard',          hint: 'home',         path: '/dashboard',
    icon: <PathIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3" /> },
  { id: 'patients',      label: 'Patients',                 hint: 'directory',    path: '/patients',
    icon: <PathIcon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857" /> },
  { id: 'register',      label: 'Register new patient',     hint: 'intake',       path: '/register',
    icon: <PathIcon d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0z" /> },
  { id: 'appointments',  label: 'Appointments',             hint: 'calendar',     path: '/appointments',
    icon: <PathIcon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
  { id: 'invoices',      label: 'Invoices',                 hint: 'billing',      path: '/invoices',
    icon: <PathIcon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
  { id: 'messages',      label: 'Messages',                 hint: 'inbox',        path: '/messages',
    icon: <PathIcon d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /> },
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onOpenGuide }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<PatientHit[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Reset when opening, focus input
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setPatients([]);
    setHighlight(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  // Debounced patient search. Only fires once query is meaningful.
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setPatients([]);
      return;
    }
    setLoadingPatients(true);
    const handle = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/patients?search=${encodeURIComponent(q)}&limit=6`);
        setPatients((res.data?.patients || []) as PatientHit[]);
      } catch {
        setPatients([]);
      } finally {
        setLoadingPatients(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, isOpen]);

  // Filter nav commands by query
  const matchingNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_NAV_COMMANDS;
    return ALL_NAV_COMMANDS.filter(
      (n) => n.label.toLowerCase().includes(q) || n.hint.toLowerCase().includes(q),
    );
  }, [query]);

  // Special action: How-To Guide (only when we have an opener)
  const showGuideAction = !!onOpenGuide && (!query.trim() || 'how to guide help'.includes(query.trim().toLowerCase()));

  // Flat list of selectable items for keyboard navigation
  type Item =
    | { kind: 'patient'; data: PatientHit }
    | { kind: 'nav'; data: NavCommand }
    | { kind: 'guide' }
    | { kind: 'ai' };
  const items: Item[] = useMemo(() => {
    const arr: Item[] = [];
    for (const p of patients) arr.push({ kind: 'patient', data: p });
    for (const n of matchingNav) arr.push({ kind: 'nav', data: n });
    if (showGuideAction) arr.push({ kind: 'guide' });
    arr.push({ kind: 'ai' });
    return arr;
  }, [patients, matchingNav, showGuideAction]);

  // Keep highlight in range when the list shrinks
  useEffect(() => {
    if (highlight >= items.length) setHighlight(Math.max(0, items.length - 1));
  }, [items.length, highlight]);

  const handleSelect = (item: Item) => {
    if (item.kind === 'patient') {
      navigate(`/patients/${item.data.id}`);
      onClose();
    } else if (item.kind === 'nav') {
      navigate(item.data.path);
      onClose();
    } else if (item.kind === 'guide') {
      onOpenGuide?.();
      onClose();
    } else if (item.kind === 'ai') {
      // Stub for now — wire to a real assistant in a follow-up.
      alert('AI assistant coming soon. Use the command palette to jump to a patient or page for now.');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[highlight]) handleSelect(items[highlight]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 z-[60] flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M16 10a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search patients or jump to a page…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
            className="flex-1 outline-none text-sm"
          />
          <span className="text-[11px] text-gray-400 font-mono border border-gray-200 rounded px-1.5 py-0.5">Esc</span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto py-2">
          {/* Patients section */}
          {(patients.length > 0 || (query.trim().length >= 2 && loadingPatients)) && (
            <Section title="Patients">
              {loadingPatients && patients.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-500">Searching…</div>
              ) : (
                patients.map((p, idx) => {
                  const absIdx = idx;
                  return (
                    <CommandRow
                      key={p.id}
                      highlighted={highlight === absIdx}
                      onMouseEnter={() => setHighlight(absIdx)}
                      onClick={() => handleSelect({ kind: 'patient', data: p })}
                      icon={<PathIcon d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
                      label={`${p.first_name} ${p.last_name}`}
                      hint={`${p.patient_number}${p.gender ? ' · ' + p.gender : ''}${p.date_of_birth ? ' · DOB ' + new Date(p.date_of_birth).toLocaleDateString() : ''}`}
                    />
                  );
                })
              )}
            </Section>
          )}

          {/* Navigation section */}
          {matchingNav.length > 0 && (
            <Section title="Pages">
              {matchingNav.map((n, idx) => {
                const absIdx = patients.length + idx;
                return (
                  <CommandRow
                    key={n.id}
                    highlighted={highlight === absIdx}
                    onMouseEnter={() => setHighlight(absIdx)}
                    onClick={() => handleSelect({ kind: 'nav', data: n })}
                    icon={n.icon}
                    label={n.label}
                    hint={n.hint}
                  />
                );
              })}
            </Section>
          )}

          {/* Help section */}
          <Section title="Help">
            {showGuideAction && (
              <CommandRow
                highlighted={highlight === patients.length + matchingNav.length}
                onMouseEnter={() => setHighlight(patients.length + matchingNav.length)}
                onClick={() => handleSelect({ kind: 'guide' })}
                icon={<PathIcon d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />}
                label="Open How-To Guide"
                hint="role-specific walkthrough"
              />
            )}
            <CommandRow
              highlighted={highlight === items.length - 1}
              onMouseEnter={() => setHighlight(items.length - 1)}
              onClick={() => handleSelect({ kind: 'ai' })}
              icon={<PathIcon d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />}
              label="Ask AI (coming soon)"
              hint="natural-language commands"
            />
          </Section>
        </div>

        <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between text-[11px] text-gray-500 bg-gray-50">
          <span>↑↓ navigate · ↵ select · esc close</span>
          <span className="font-mono">⌘K</span>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-2 last:mb-0">
    <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</div>
    {children}
  </div>
);

interface CommandRowProps {
  highlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}

const CommandRow: React.FC<CommandRowProps> = ({ highlighted, onMouseEnter, onClick, icon, label, hint }) => (
  <button
    type="button"
    onMouseEnter={onMouseEnter}
    onClick={onClick}
    className={`w-full text-left px-4 py-2 flex items-center gap-3 ${highlighted ? 'bg-primary-50' : ''}`}
  >
    <span className={`w-7 h-7 rounded-md flex items-center justify-center ${highlighted ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icon}
      </svg>
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium text-gray-900 truncate">{label}</span>
      {hint && <span className="block text-xs text-gray-500 truncate">{hint}</span>}
    </span>
  </button>
);

function PathIcon({ d }: { d: string }) {
  return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />;
}

export default CommandPalette;
