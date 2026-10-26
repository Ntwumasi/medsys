import React from 'react';
import { useColorScheme } from '../../hooks/useColorScheme';
import ColorSchemeToggle from '../ui/ColorSchemeToggle';
import { branding } from '../../config/branding';
import { PORTAL_NAV } from './portalNav';
import type { PortalView } from './portalNav';

/**
 * Patient portal frame — same structure as the staff AppLayout (fixed top bar,
 * left sidebar on desktop, bottom tab bar on phones, ambient background), but
 * with only the patient's own sections and none of the staff tools.
 */

const ICON_PATHS: Record<PortalView | 'phone' | 'logout', string> = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  results: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  bills: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  medicines: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  visits: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  messages: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
};

export const PortalIcon: React.FC<{ name: keyof typeof ICON_PATHS; className?: string }> = ({ name, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PATHS[name]} />
  </svg>
);

interface PortalShellProps {
  view: PortalView;
  onNavigate: (view: PortalView) => void;
  onSignOut: () => void;
  patientName: string;
  /** Small count bubble per nav item (e.g. results waiting, bills owed). */
  badges?: Partial<Record<PortalView, number>>;
  children: React.ReactNode;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '•';

const PortalShell: React.FC<PortalShellProps> = ({ view, onNavigate, onSignOut, patientName, badges = {}, children }) => {
  const telHref = branding.clinicPhone ? `tel:${branding.clinicPhone.replace(/[^\d+]/g, '')}` : '';
  const { choice, setChoice, isDark } = useColorScheme();

  return (
    // Dark mode is scoped to the portal's own root (see hooks/useColorScheme).
    <div className={`${isDark ? 'dark ' : ''}min-h-screen bg-ds-canvas text-ds-text font-ds-sans antialiased dark:[color-scheme:dark] relative`}>
      {/* Same ambient background as the staff site */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-ds-accent opacity-[0.07] blur-3xl" />
        <div className="absolute top-1/3 right-[-180px] w-[480px] h-[480px] rounded-full bg-ds-brand-plum opacity-[0.05] blur-3xl" />
        <div className="absolute bottom-[-200px] left-1/3 w-[520px] h-[520px] rounded-full bg-ds-accent opacity-[0.04] blur-3xl" />
      </div>

      <div className="relative z-10">
        <a href="#portal-main" className="skip-to-content">Skip to content</a>

        {/* Top bar */}
        <header className="fixed top-0 left-0 right-0 h-16 bg-ds-surface/90 backdrop-blur border-b border-ds-border z-40 flex items-center px-4 lg:px-6">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-2 min-w-0" aria-label="Home">
            {branding.clinicLogo ? (
              <img src={branding.clinicLogo} alt={branding.clinicName} className="h-9 w-auto" />
            ) : (
              <span className="font-bold text-ds-text">{branding.clinicName}</span>
            )}
            <span className="hidden sm:inline-block ml-2 pl-3 border-l border-ds-border text-sm font-medium text-ds-text-muted">
              Patient Portal
            </span>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <ColorSchemeToggle value={choice} onChange={setChoice} />
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-sm font-semibold text-ds-text">{patientName}</p>
              <p className="text-xs text-ds-text-muted">Patient</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ds-accent to-ds-brand-plum dark:from-ds-accent-soft dark:to-ds-subtle flex items-center justify-center text-white dark:text-ds-accent-text font-semibold text-sm shadow-ds-card">
              {initials(patientName)}
            </div>
            <button
              onClick={onSignOut}
              className="p-2 rounded-lg text-ds-text-muted hover:bg-ds-accent-soft hover:text-ds-accent-hover lg:hidden"
              aria-label="Sign out"
            >
              <PortalIcon name="logout" />
            </button>
          </div>
        </header>

        {/* Sidebar — desktop */}
        <aside className="fixed left-0 top-16 bottom-0 w-64 bg-ds-surface border-r border-ds-border z-30 hidden lg:flex flex-col">
          <nav aria-label="Portal navigation" className="flex-1 p-3 space-y-1">
            {PORTAL_NAV.map((item) => {
              const active = view === item.key;
              const badge = badges[item.key];
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full text-left ${
                    active ? 'bg-ds-accent-soft text-ds-accent-text font-medium' : 'text-ds-text-muted hover:bg-ds-accent-soft hover:text-ds-accent-hover'
                  }`}
                >
                  <PortalIcon name={item.key} />
                  <span className="flex-1">{item.label}</span>
                  {!!badge && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-ds-brand-plum text-white dark:text-ds-canvas text-[11px] font-semibold flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t border-ds-border space-y-3">
            {telHref && (
              <a
                href={telHref}
                className="flex items-center gap-3 p-3 rounded-ds-control bg-ds-accent-soft border border-ds-accent/40 hover:border-ds-accent transition-colors"
              >
                <span className="w-9 h-9 rounded-lg bg-ds-surface text-ds-accent-text flex items-center justify-center shadow-ds-card">
                  <PortalIcon name="phone" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ds-text">Call the clinic</span>
                  <span className="block text-xs text-ds-text-muted truncate">{branding.clinicPhone}</span>
                </span>
              </a>
            )}
            <button
              onClick={onSignOut}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-ds-text-muted hover:bg-ds-critical-soft hover:text-ds-critical-text transition-colors"
            >
              <PortalIcon name="logout" />
              <span className="text-sm font-medium">Sign out</span>
            </button>
          </div>
        </aside>

        <main id="portal-main" className="pt-16 lg:pl-64">
          <div className="p-4 lg:p-8 pb-24 lg:pb-10 max-w-7xl animate-fade-in">{children}</div>
        </main>

        {/* Bottom tab bar — phones */}
        <nav aria-label="Portal navigation" className="fixed bottom-0 left-0 right-0 bg-ds-surface/95 backdrop-blur border-t border-ds-border z-40 lg:hidden safe-area-bottom">
          <div className="flex justify-around items-center h-16">
            {PORTAL_NAV.filter((item) => item.phone !== false).map((item) => {
              const active = view === item.key;
              const badge = badges[item.key];
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center flex-1 h-full px-1 transition-colors ${
                    active ? 'text-ds-accent-text' : 'text-ds-text-muted'
                  }`}
                >
                  <span className={`transition-transform ${active ? 'scale-110' : ''}`}>
                    <PortalIcon name={item.key} className="w-6 h-6" />
                  </span>
                  <span className={`text-[11px] mt-1 ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                  {!!badge && (
                    <span className="absolute top-2 left-1/2 ml-2 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-ds-brand-plum text-white dark:text-ds-canvas text-[10px] font-semibold flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                  {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-ds-accent" />}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};

export default PortalShell;
