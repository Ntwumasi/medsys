import React from 'react';

// Period-over-period delta shown next to a sparkline. Splits the input
// series in half, sums (or averages) each side, and renders
// ▲ +12% / ▼ -8% / — flat.
//
// For most metrics "up is good" (more revenue, more dispenses). For a
// few it's the opposite (outstanding balance, avg turnaround). Caller
// passes `direction` so the color reflects intent rather than direction.

interface DeltaProps {
  series: number[];
  direction?: 'up-is-good' | 'up-is-bad';
  // 'sum' compares total volume between the two halves (good for counts);
  // 'avg' compares averages (good for TAT-style metrics).
  mode?: 'sum' | 'avg';
  className?: string;
}

const Delta: React.FC<DeltaProps> = ({ series, direction = 'up-is-good', mode = 'sum', className = '' }) => {
  if (series.length < 4) return null;

  const mid = Math.floor(series.length / 2);
  const prev = series.slice(0, mid);
  const curr = series.slice(mid);

  const reduce = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    if (mode === 'avg') return xs.reduce((s, n) => s + n, 0) / xs.length;
    return xs.reduce((s, n) => s + n, 0);
  };

  const a = reduce(prev);
  const b = reduce(curr);
  if (a === 0 && b === 0) return null;

  let pct = 0;
  if (a === 0) {
    pct = b > 0 ? 100 : 0; // grew from nothing — show 100% rather than ∞
  } else {
    pct = ((b - a) / Math.abs(a)) * 100;
  }

  const rounded = Math.round(pct);
  if (rounded === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold text-text-secondary ${className}`}>
        — flat
      </span>
    );
  }

  const up = rounded > 0;
  const good = direction === 'up-is-good' ? up : !up;
  const tone = good ? 'text-success-700' : 'text-danger-700';
  const arrow = up ? '▲' : '▼';

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${tone} ${className}`}>
      <span>{arrow}</span>
      <span>{up ? '+' : ''}{rounded}%</span>
    </span>
  );
};

export default Delta;
