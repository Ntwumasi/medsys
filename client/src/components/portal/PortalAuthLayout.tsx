import React from 'react';
import { useColorScheme } from '../../hooks/useColorScheme';
import ColorSchemeToggle from '../ui/ColorSchemeToggle';
import { branding } from '../../config/branding';
import { PortalIcon } from './PortalShell';

/**
 * Sign-in frame for the patient portal: branded gradient panel (top on phones,
 * left half on desktop) with what the portal offers, and the form card.
 */
const FEATURES: { icon: 'results' | 'bills' | 'visits'; text: string }[] = [
  { icon: 'results', text: 'Lab results with what is normal' },
  { icon: 'bills', text: 'Your bills and payments' },
  { icon: 'visits', text: 'Upcoming visits and medicines' },
];

const PortalAuthLayout: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => {
  const { choice, setChoice, isDark } = useColorScheme();
  return (
  <div className={`${isDark ? 'dark ' : ''}min-h-screen bg-ds-canvas text-ds-text font-ds-sans antialiased dark:[color-scheme:dark] lg:grid lg:grid-cols-2`}>
    <section className="relative overflow-hidden bg-gradient-to-br from-ds-accent to-ds-brand-plum dark:from-ds-accent-soft dark:to-ds-subtle text-white px-6 pt-8 pb-24 lg:p-12 lg:flex lg:flex-col lg:justify-between">
      <div aria-hidden="true" className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-white/10" />
      <div aria-hidden="true" className="absolute -left-16 bottom-0 w-56 h-56 rounded-full bg-white/10" />
      <div className="relative">
        <span className="inline-flex items-center bg-ds-surface rounded-ds-card px-3 py-2 shadow-ds-card">
          {branding.clinicLogo ? (
            <img src={branding.clinicLogo} alt={branding.clinicName} className="h-8 w-auto" />
          ) : (
            <span className="font-bold text-ds-accent-text">{branding.clinicName}</span>
          )}
        </span>
        <h1 className="!text-white text-3xl lg:text-4xl font-bold mt-6 lg:mt-16">Patient Portal</h1>
        <p className="text-white/85 mt-2 max-w-sm">Your health records from {branding.clinicName}, wherever you are.</p>
        <ul className="hidden lg:block mt-10 space-y-4">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-ds-control bg-white/15 border border-white/20 flex items-center justify-center">
                <PortalIcon name={f.icon} />
              </span>
              <span className="font-medium">{f.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative hidden lg:block text-sm text-white/70">
        {[branding.clinicAddress, branding.clinicPhone].filter(Boolean).join(' · ')}
      </p>
    </section>

    <section className="relative -mt-16 px-4 pb-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:p-12">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-ds-surface rounded-ds-sheet shadow-ds-overlay border border-ds-border p-6 sm:p-8">
          <h2 className="!text-xl font-bold text-ds-text">{title}</h2>
          <p className="text-sm text-ds-text-muted mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
        <div className="mt-4 flex justify-center">
          <ColorSchemeToggle value={choice} onChange={setChoice} />
        </div>
        <ul className="lg:hidden mt-6 space-y-3 px-2">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3 text-sm text-ds-text-muted">
              <span className="w-8 h-8 rounded-lg bg-ds-accent-soft text-ds-accent-text flex items-center justify-center">
                <PortalIcon name={f.icon} className="w-4 h-4" />
              </span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  </div>
  );
};

export default PortalAuthLayout;
