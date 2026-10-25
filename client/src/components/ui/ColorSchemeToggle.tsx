import React from 'react';
import type { ColorSchemeChoice } from '../../hooks/useColorScheme';

const OPTIONS: { value: ColorSchemeChoice; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 8a4 4 0 100 8 4 4 0 000-8z' },
  { value: 'dark', label: 'Dark', icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z' },
  { value: 'system', label: 'System', icon: 'M4 5h16v11H4zM8 20h8M12 16v4' },
];

/** Light / Dark / System switch for screens on the design-system tokens. */
const ColorSchemeToggle: React.FC<{
  value: ColorSchemeChoice;
  onChange: (value: ColorSchemeChoice) => void;
  showLabels?: boolean;
  className?: string;
}> = ({ value, onChange, showLabels = false, className = '' }) => (
  <div role="radiogroup" aria-label="Colour scheme" className={`inline-flex p-1 gap-1 rounded-ds-control bg-ds-subtle ${className}`}>
    {OPTIONS.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={`min-h-ds-touch min-w-[44px] px-2.5 inline-flex items-center justify-center gap-2 rounded-ds-sm text-sm font-medium transition-colors duration-ds-fast ${
            active ? 'bg-ds-surface text-ds-text shadow-ds-card' : 'text-ds-text-muted hover:text-ds-text'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={o.icon} />
          </svg>
          {showLabels && <span>{o.label}</span>}
        </button>
      );
    })}
  </div>
);

export default ColorSchemeToggle;
