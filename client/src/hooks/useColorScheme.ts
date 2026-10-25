import { useCallback, useEffect, useState } from 'react';

/**
 * Light / dark / system colour scheme for screens that use the design-system
 * ("ds") tokens. The resolved scheme is applied by putting the `dark` class on
 * that area's root element — never on <html> — so screens not yet migrated to
 * the tokens can't end up half-dark.
 */
export type ColorSchemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ds-color-scheme';

const readChoice = (): ColorSchemeChoice => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function useColorScheme() {
  const [choice, setChoiceState] = useState<ColorSchemeChoice>(readChoice);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const setChoice = useCallback((next: ColorSchemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, []);

  const isDark = choice === 'dark' || (choice === 'system' && systemDark);
  return { choice, setChoice, isDark };
}
