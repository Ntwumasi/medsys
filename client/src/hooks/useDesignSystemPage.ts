import { useLayoutEffect, useState } from 'react';
import { useColorScheme } from './useColorScheme';
import '../styles/dsFonts';

/**
 * Call from a screen that has moved to the "Care" design system. While it is
 * mounted, <html> carries data-ds="on" (so shared dialogs and toasts render in
 * the new style — see utils/dsClass) and the `dark` class when the user's
 * colour scheme resolves to dark. Both are removed when the screen unmounts,
 * so unmigrated screens are untouched.
 */
export function useDesignSystemPage() {
  const scheme = useColorScheme();
  // Shared components (AppSelect, dialogs, toasts) pick their classes from
  // <html data-ds> at render time, so re-render once after it is set — before
  // the first paint, so nothing flashes in the old style.
  const [, setReady] = useState(false);
  useLayoutEffect(() => {
    setReady(true);
  }, []);
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.ds = 'on';
    html.classList.toggle('dark', scheme.isDark);
    html.style.colorScheme = scheme.isDark ? 'dark' : 'light';
    return () => {
      delete html.dataset.ds;
      html.classList.remove('dark');
      html.style.colorScheme = '';
    };
  }, [scheme.isDark]);
  return scheme;
}
