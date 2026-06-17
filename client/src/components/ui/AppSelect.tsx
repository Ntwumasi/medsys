import React, { useState, useRef, useEffect } from 'react';

export interface AppSelectOption {
  value: string | number;
  label: string;
}

interface AppSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  searchable?: boolean;
  // When true, the user can type a value that isn't in the list and select it
  // (e.g. a custom inventory unit). The typed value shows even if not an option.
  allowCustom?: boolean;
}

const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  label,
  required,
  disabled,
  error,
  className = '',
  searchable,
  allowCustom,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-enable search for lists > 6 items, or always when custom values are allowed.
  const showSearch = searchable ?? (allowCustom || options.length > 6);

  const commitCustom = () => {
    const v = search.trim();
    if (v) { onChange(v); setOpen(false); }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && showSearch) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
    if (!open) setSearch('');
  }, [open, showSearch]);

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  // Show the option's label, or the raw value itself when it's a custom entry.
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label
    ?? (allowCustom && value != null && String(value) !== '' ? String(value) : undefined);
  const hasExactMatch = options.some(o => o.label.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-danger-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative" ref={ref}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className={`w-full px-4 py-2 border rounded-lg text-left flex items-center justify-between bg-white transition-colors text-sm
            ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed border-gray-200' : 'hover:border-primary-400 cursor-pointer'}
            ${error ? 'border-danger-300 focus:ring-danger-200' : open ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-300'}
          `}
        >
          <span className={selectedLabel ? 'text-gray-900 truncate' : 'text-gray-400'}>
            {selectedLabel || placeholder}
          </span>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden" style={{ maxHeight: '280px' }}>
            {showSearch && (
              <div className="p-2 border-b border-gray-100">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (allowCustom && e.key === 'Enter') { e.preventDefault(); commitCustom(); } }}
                  placeholder={allowCustom ? 'Search or type a custom unit…' : 'Search...'}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
            )}
            <div className="overflow-y-auto" style={{ maxHeight: showSearch ? '220px' : '260px' }}>
              {filtered.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => { onChange(String(opt.value)); setOpen(false); }}
                    className={`px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2
                      ${isSelected ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-900 hover:bg-gray-50'}
                    `}
                  >
                    {isSelected && (
                      <svg className="w-4 h-4 text-primary-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {!isSelected && <span className="w-4 flex-shrink-0" />}
                    <span className="truncate">{opt.label}</span>
                  </div>
                );
              })}
              {allowCustom && search.trim() && !hasExactMatch && (
                <div
                  onClick={commitCustom}
                  className="px-4 py-2 text-sm cursor-pointer text-primary-700 hover:bg-primary-50 flex items-center gap-2 border-t border-gray-100"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  <span className="truncate">Use “{search.trim()}”</span>
                </div>
              )}
              {filtered.length === 0 && !(allowCustom && search.trim()) && (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-sm text-danger-600">{error}</p>}
    </div>
  );
};

export default AppSelect;
