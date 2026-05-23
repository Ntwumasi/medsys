import React, { useEffect, useRef, useState } from 'react';

// Counts a number up from 0 (or from its previous value) to the target.
// Pure cosmetic — gives the dashboards a "data just loaded" beat that
// makes the page feel alive instead of static. Respects
// prefers-reduced-motion: users with that pref see the final value
// immediately.
//
// Uses requestAnimationFrame for buttery motion; falls back to plain
// text when the value isn't a finite number (e.g., "N/A").

interface NumberTickerProps {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const NumberTicker: React.FC<NumberTickerProps> = ({
  value,
  duration = 700,
  className = '',
  format,
}) => {
  const [display, setDisplay] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    if (!Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(value);
      return;
    }
    fromRef.current = display;
    startRef.current = performance.now();
    const target = value;
    const animate = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const v = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(target % 1 === 0 ? Math.round(v) : v);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const text = format ? format(display) : Number.isFinite(display) ? String(display) : String(value);
  return <span className={`tabular-nums ${className}`}>{text}</span>;
};

export default NumberTicker;
