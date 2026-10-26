import { useCallback, useLayoutEffect, useState } from 'react';
import { useColorScheme } from './useColorScheme';

/**
 * Design-system colours as real colour values, for places that can't use a
 * CSS variable — SVG presentation attributes such as recharts' `stroke` and
 * `fill` ignore `var(--ds-…)`. Returns `dsColor('accent')` → "rgb(15, 118, 110)".
 *
 * Call it in a screen AFTER useDesignSystemPage(): that hook switches the
 * `dark` class in a layout effect, and this one re-renders right after so
 * the colours are read for the scheme now showing.
 */
export function useDsColor(): (token: string) => string {
  const { isDark } = useColorScheme();
  const [, setTick] = useState(0);
  useLayoutEffect(() => {
    setTick((t) => t + 1);
  }, [isDark]);

  return useCallback(
    (token: string) => {
      if (typeof document === 'undefined') return '#888888';
      const raw = getComputedStyle(document.documentElement).getPropertyValue(`--ds-${token}`).trim();
      return raw ? `rgb(${raw.split(/[\s,]+/).join(', ')})` : '#888888';
    },
    // re-created on scheme change so memoised charts pick up the new colours
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDark]
  );
}
