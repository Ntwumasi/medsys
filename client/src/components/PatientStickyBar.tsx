import React, { useEffect, useState } from 'react';

/**
 * Compact patient identity bar for long chart screens (clinical UI rule 1:
 * the patient's name, ID and age stay visible while scrolling). It sits as the
 * first child of the chart card and slides in only once the full patient
 * header (`watch`) has scrolled under the top bar.
 *
 * The wrapper is zero-height and sticky, so it takes no space in the layout;
 * the bar hangs off it. `className` bleeds it across the parent's padding and
 * cancels the parent's `space-y-*` gap (default: p-6 card with space-y-4).
 */
interface PatientStickyBarProps {
  watch: React.RefObject<HTMLElement | null>;
  name: string;
  age?: string;
  sex?: string | null;
  patientNumber?: string | null;
  encounterNumber?: string | null;
  /** Shown as a critical chip so allergies stay in view too. */
  allergies?: string | null;
  /** Bleed + gap cancel for the parent (default suits a p-6 card with space-y-4). */
  className?: string;
}

const PatientStickyBar: React.FC<PatientStickyBarProps> = ({ watch, name, age, sex, patientNumber, encounterNumber, allergies, className = '-mx-6 -mb-4' }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // 64px = the fixed top bar; the header counts as gone once it's under it.
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);

  return (
    <div className={`sticky top-16 z-30 h-0 ${className}`} aria-hidden={!show}>
      <div
        className={`absolute inset-x-0 top-0 px-6 py-2.5 bg-ds-surface/95 backdrop-blur border-b border-ds-border shadow-ds-card flex flex-wrap items-center gap-x-3 gap-y-1 transition-opacity duration-ds-fast ${
          show ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span className="font-bold text-ds-text">{name}</span>
        {(age || sex) && <span className="text-sm text-ds-text-muted">{[age, sex].filter(Boolean).join(' · ')}</span>}
        {patientNumber && (
          <span className="text-xs text-ds-text-muted">
            Patient # <span className="font-mono text-ds-text-secondary">{patientNumber}</span>
          </span>
        )}
        {encounterNumber && (
          <span className="text-xs text-ds-text-muted">
            Encounter <span className="font-mono text-ds-text-secondary">{encounterNumber}</span>
          </span>
        )}
        {allergies && (
          <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-ds-critical-soft text-ds-critical-text border border-ds-critical-border">
            Allergies: {allergies}
          </span>
        )}
      </div>
    </div>
  );
};

export default PatientStickyBar;
