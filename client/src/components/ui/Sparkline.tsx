import React, { useMemo, useState } from 'react';

// Inline trend chart — typically 60-80px wide, 20px tall — that sits
// under a stat number to show its recent shape. No axes, no labels.
// The most recent point gets a small filled dot so "now" is visible;
// hovering a point shows a tooltip with the actual value + date.
//
// All sizing/positioning is done with SVG viewBox, so the same component
// scales cleanly from inline-pill size to full card width.

export interface SparkPoint {
  label: string;  // e.g., "May 17" — shown in the tooltip
  value: number;
}

interface SparklineProps {
  data: SparkPoint[];
  width?: number;
  height?: number;
  strokeColor?: string;   // any CSS color; defaults to currentColor so it
                          // inherits the parent's text color (variant-aware)
  fillOpacity?: number;
  className?: string;
  // When true, render even if every value is 0/equal — useful so the line
  // doesn't disappear during a quiet period.
  alwaysShow?: boolean;
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 80,
  height = 22,
  strokeColor = 'currentColor',
  fillOpacity = 0.1,
  className = '',
  alwaysShow = true,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { points, areaPath, linePath, min, max, lastX, lastY } = useMemo(() => {
    if (data.length === 0) {
      return { points: [], areaPath: '', linePath: '', min: 0, max: 0, lastX: 0, lastY: 0 };
    }
    const vals = data.map((d) => d.value);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV;
    const padX = 2;
    const padY = 3;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;

    const xy = data.map((d, i) => {
      const x = padX + i * xStep;
      const y = range === 0
        // Flat series: draw mid-line so it's not stuck at top or bottom.
        ? padY + innerH / 2
        : padY + innerH - ((d.value - minV) / range) * innerH;
      return { x, y };
    });

    const linePath = xy.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    const areaPath = `${linePath} L ${xy[xy.length - 1].x} ${height - padY} L ${xy[0].x} ${height - padY} Z`;
    const last = xy[xy.length - 1];

    return {
      points: xy,
      linePath,
      areaPath,
      min: minV,
      max: maxV,
      lastX: last.x,
      lastY: last.y,
    };
  }, [data, width, height]);

  if (data.length === 0 || (!alwaysShow && min === max && min === 0)) {
    return null;
  }

  const hovered = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < data.length ? data[hoverIdx] : null;
  const hoverPoint = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < points.length ? points[hoverIdx] : null;

  return (
    <div className={`relative inline-block ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        style={{ color: strokeColor }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Area fill */}
        <path d={areaPath} fill={strokeColor} fillOpacity={fillOpacity} />
        {/* Line */}
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {/* Last point dot */}
        <circle cx={lastX} cy={lastY} r={2} fill={strokeColor} />
        {/* Hover dot */}
        {hoverPoint && (
          <circle cx={hoverPoint.x} cy={hoverPoint.y} r={2.5} fill="white" stroke={strokeColor} strokeWidth={1.5} />
        )}
        {/* Invisible hover targets — one per data point so the user can scrub */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={i === 0 ? 0 : p.x - (points[i].x - points[i - 1].x) / 2}
            y={0}
            width={
              i === 0
                ? (points[1] ? (points[1].x - p.x) / 2 + p.x : width)
                : i === points.length - 1
                  ? width - (p.x - (p.x - points[i - 1].x) / 2)
                  : (points[i + 1].x - points[i - 1].x) / 2
            }
            height={height}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            style={{ cursor: 'crosshair' }}
          />
        ))}
      </svg>
      {hovered && (
        <div
          className="absolute z-20 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded shadow-md whitespace-nowrap pointer-events-none"
          style={{ left: `${(hoverPoint!.x / width) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold tabular-nums">{hovered.value}</div>
          <div className="opacity-75">{hovered.label}</div>
        </div>
      )}
    </div>
  );
};

export default Sparkline;
