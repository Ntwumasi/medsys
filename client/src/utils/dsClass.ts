/**
 * Migration bridge from the legacy colour palette to the "Care" design-system
 * tokens (docs/design-system.md).
 *
 * Shared chrome (AppLayout's sidebar/top bar, confirm dialogs, toasts) is used
 * by every screen, but screens move to the new design one at a time. While a
 * migrated screen is open, `<html data-ds="on">` is set (see
 * useDesignSystemPage) and that chrome passes its class strings through
 * `dsClass()`, which swaps legacy colour classes for their token equivalents —
 * light and dark. Everywhere else the strings are returned unchanged, so
 * unmigrated screens look exactly as before.
 *
 * Every value below is a complete literal class list on purpose: Tailwind only
 * generates classes it can find written out in the source.
 */

const MAP: Record<string, string> = {
  // surfaces
  'bg-white': 'bg-ds-surface',
  'bg-surface': 'bg-ds-surface',
  'bg-background': 'bg-ds-canvas',
  'bg-gray-50': 'bg-ds-subtle',
  'bg-gray-100': 'bg-ds-subtle',
  'bg-gray-200': 'bg-ds-border',
  'hover:bg-gray-50': 'hover:bg-ds-subtle',
  'hover:bg-gray-100': 'hover:bg-ds-subtle',
  'hover:bg-white': 'hover:bg-ds-surface',
  // text
  'text-gray-900': 'text-ds-text',
  'text-gray-800': 'text-ds-text',
  'text-text-primary': 'text-ds-text',
  'text-gray-700': 'text-ds-text-secondary',
  'text-gray-600': 'text-ds-text-secondary',
  'text-text-secondary': 'text-ds-text-muted',
  'text-gray-500': 'text-ds-text-muted',
  'text-gray-400': 'text-ds-text-muted',
  'text-gray-300': 'text-ds-text-muted',
  'hover:text-gray-700': 'hover:text-ds-text',
  'hover:text-gray-900': 'hover:text-ds-text',
  // borders
  'border-border': 'border-ds-border',
  'border-gray-100': 'border-ds-border',
  'border-gray-200': 'border-ds-border',
  'border-gray-300': 'border-ds-border-control',
  'border-white': 'border-ds-surface',
  'divide-gray-100': 'divide-ds-border',
  'divide-gray-200': 'divide-ds-border',
  'ring-white': 'ring-ds-surface',
  'focus:ring-gray-400': 'focus:ring-ds-focus-ring',
  // accent (legacy "primary" teal)
  'bg-primary-50': 'bg-ds-accent-soft',
  'bg-primary-100': 'bg-ds-accent-soft',
  'bg-primary-500': 'bg-ds-accent',
  'bg-primary-600': 'bg-ds-accent',
  'hover:bg-primary-50': 'hover:bg-ds-accent-soft',
  'hover:bg-primary-600': 'hover:bg-ds-accent-hover',
  'hover:bg-primary-700': 'hover:bg-ds-accent-hover',
  'text-primary-500': 'text-ds-accent-text',
  'text-primary-600': 'text-ds-accent-text',
  'text-primary-700': 'text-ds-accent-text',
  'text-primary-800': 'text-ds-accent-text',
  'hover:text-primary-500': 'hover:text-ds-accent-text',
  'hover:text-primary-600': 'hover:text-ds-accent-text',
  'hover:text-primary-700': 'hover:text-ds-accent-text',
  'border-primary-500': 'border-ds-accent',
  'border-primary-600': 'border-ds-accent',
  'hover:border-primary-500': 'hover:border-ds-accent',
  'ring-primary-200': 'ring-ds-focus-ring/30',
  'focus:ring-primary-500': 'focus:ring-ds-focus-ring',
  'group-hover:ring-primary-200': 'group-hover:ring-ds-focus-ring/30',
  'text-accent-700': 'text-ds-accent-text',
  // avatar / brand gradients: dark mode swaps to a dark tint so white initials stay readable
  'from-primary-400': 'from-ds-accent dark:from-ds-accent-soft',
  'to-secondary-500': 'to-ds-brand-plum dark:to-ds-subtle',
  'from-primary-50': 'from-ds-accent-soft',
  'to-secondary-50': 'to-ds-subtle',
  'via-white': 'via-ds-surface',
  // legacy plum
  'bg-secondary-100': 'bg-ds-subtle',
  'text-secondary': 'text-ds-brand-plum',
  'text-secondary-600': 'text-ds-brand-plum',
  'text-secondary-700': 'text-ds-brand-plum',
  // semantic
  'bg-success-100': 'bg-ds-success-soft',
  'bg-success-500': 'bg-ds-success',
  'text-success-500': 'text-ds-success-text',
  'text-success-700': 'text-ds-success-text',
  'bg-warning-100': 'bg-ds-warning-soft',
  'text-warning-600': 'text-ds-warning-text',
  'text-warning-700': 'text-ds-warning-text',
  'bg-danger-100': 'bg-ds-critical-soft',
  'border-danger-400': 'border-ds-critical-border',
  'border-danger-300': 'border-ds-critical-border',
  'text-danger-500': 'text-ds-critical-text',
  'focus:ring-danger-200': 'focus:ring-ds-critical/30',
  'focus:border-primary-500': 'focus:border-ds-accent',
  'hover:border-primary-400': 'hover:border-ds-accent',
  'border-warning-400': 'border-ds-warning-border',
  'text-danger-600': 'text-ds-critical-text',
  'text-danger-700': 'text-ds-critical-text',
  'bg-danger-600': 'bg-ds-critical',
  'hover:bg-danger-700': 'hover:bg-ds-critical',
  'focus:ring-danger-500': 'focus:ring-ds-critical',
  'bg-warning-600': 'bg-ds-warning',
  'hover:bg-warning-700': 'hover:bg-ds-warning',
  'focus:ring-warning-500': 'focus:ring-ds-warning',
  // ambient background blobs
  // (tinted down: the token colours are much stronger than the old pastel -200s)
  'bg-primary-200': 'bg-ds-accent/30',
  'bg-secondary-200': 'bg-ds-brand-plum/30',
  'bg-accent-200': 'bg-ds-accent/20',
  // corners
  'rounded-xl': 'rounded-ds-card',
  'rounded-b-xl': 'rounded-b-ds-card',
  'rounded-2xl': 'rounded-ds-card',
};

/** Is a migrated (design-system) screen open right now? */
export const dsActive = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.dataset.ds === 'on';

// Text on a filled background must follow the fill: dark mode's accent,
// warning and success fills are light, so white text on them would fail
// contrast. (Critical stays a dark fill in both modes, so white is fine.)
const TEXT_ON_FILL: [RegExp, string][] = [
  [/(^| )bg-ds-accent( |$)/, 'text-ds-on-accent'],
  [/(^| )bg-ds-warning( |$)/, 'text-white dark:text-ds-canvas'],
  [/(^| )bg-ds-success( |$)/, 'text-white dark:text-ds-canvas'],
];

/** Translate legacy colour classes to design-system tokens. */
export const toDsClasses = (classes: string): string => {
  let out = classes
    .split(/\s+/)
    .map((c) => MAP[c] ?? c)
    .join(' ');
  for (const [fill, text] of TEXT_ON_FILL) {
    if (fill.test(out) && /(^| )text-white( |$)/.test(out)) {
      out = out.replace(/(^| )text-white(?= |$)/, `$1${text}`);
    }
  }
  return out;
};

/** Class helper for shared chrome: translated only while a migrated screen is open. */
export const dsClass = (classes: string): string => (dsActive() ? toDsClasses(classes) : classes);
