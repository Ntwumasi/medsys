import React, { useState, useRef, useEffect } from 'react';

interface PriorityOption {
  value: string;
  label: string;
  color: string;
  icon?: string;
}

const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: 'routine', label: 'Routine', color: 'bg-primary-100 text-primary-700 border-primary-200' },
  { value: 'urgent', label: 'Urgent', color: 'bg-warning-100 text-warning-700 border-warning-200' },
  { value: 'stat', label: 'STAT', color: 'bg-danger-100 text-danger-700 border-danger-200' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-secondary-100 text-secondary-700 border-secondary-200' },
];

interface PrioritySelectProps {
  value: string;
  onChange: (value: string) => void;
  showScheduled?: boolean;
  className?: string;
}

const PrioritySelect: React.FC<PrioritySelectProps> = ({ value, onChange, showScheduled = true, className = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = showScheduled ? PRIORITY_OPTIONS : PRIORITY_OPTIONS.filter(o => o.value !== 'scheduled');
  const selected = options.find(o => o.value === value) || options[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
      >
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border ${selected.color}`}>
          {selected.value === 'stat' && (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          )}
          {selected.value === 'scheduled' && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}
          {selected.label}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in duration-100">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${value === opt.value ? 'bg-gray-50' : ''}`}
            >
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${opt.color}`}>
                {opt.label}
              </span>
              {value === opt.value && (
                <svg className="w-4 h-4 text-primary-600 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PrioritySelect;
