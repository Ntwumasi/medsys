import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useCommandPalette } from '../context/CommandPaletteContext';
import WeatherIcon from './WeatherIcon';

// Single slim row at the top of every role dashboard. Replaces the old
// chunky greeting strip + breadcrumb strip + floating help button — same
// information, one row instead of four.
//
//   ┌────────────────────────────────────────────────────────────────┐
//   │  Doctor Dashboard  · 🌤 Evening, John     [stats]  [⌘K Search] │
//   └────────────────────────────────────────────────────────────────┘
//
// Each dashboard passes its own role-specific stats slot (3 patients ·
// 2 lab alerts · ...). Keyboard shortcut ⌘K opens the global command
// palette mounted in AppLayout.

interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  stats?: React.ReactNode;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ title, subtitle, stats }) => {
  const { user } = useAuth();
  const { open: openPalette } = useCommandPalette();

  // Ghana time greeting variant — same logic as the old greeting strip.
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Accra',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10,
  );
  const greetingWord = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 22 ? 'Evening' : 'Night';
  const weatherVariant: 'morning' | 'afternoon' | 'evening' | 'night' =
    hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night';

  // Detect platform for the keyboard hint
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
      <div className="flex items-center gap-4 px-4 lg:px-5 py-3 flex-wrap">
        {/* Title + greeting chip */}
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg lg:text-xl font-bold text-text-primary truncate">{title}</h1>
          {user && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-100 rounded-full pl-1.5 pr-2.5 py-0.5">
              <WeatherIcon variant={weatherVariant} size={16} className="text-primary-600" />
              {greetingWord}, {user.first_name}
            </span>
          )}
          {subtitle && (
            <span className="hidden md:inline text-xs text-text-secondary">· {subtitle}</span>
          )}
        </div>

        {/* Stats slot — pushes to the right */}
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {stats && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              {stats}
            </div>
          )}
          <button
            type="button"
            onClick={openPalette}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-600 transition-colors"
            title="Open command palette"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M16 10a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <span>Search</span>
            <span className="font-mono text-[10px] text-gray-400 border border-gray-200 rounded px-1">{cmdKey}K</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Reusable stat pill used inside the stats slot. Tone reflects urgency.
interface StatPillProps {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'primary' | 'warning' | 'danger' | 'success';
  onClick?: () => void;
  title?: string;
}

export const StatPill: React.FC<StatPillProps> = ({ label, value, tone = 'neutral', onClick, title }) => {
  const toneClass =
    tone === 'danger'
      ? 'bg-danger-50 text-danger-700 border-danger-200'
      : tone === 'warning'
        ? 'bg-warning-50 text-warning-700 border-warning-200'
        : tone === 'success'
          ? 'bg-success-50 text-success-700 border-success-200'
          : tone === 'primary'
            ? 'bg-primary-50 text-primary-700 border-primary-200'
            : 'bg-gray-50 text-gray-700 border-gray-200';
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${toneClass} ${onClick ? 'hover:opacity-80 transition-opacity cursor-pointer' : ''}`}
    >
      <span className="font-bold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </Component>
  );
};

export default DashboardHeader;
