import React from 'react';

// Stroke-style animated weather icon matching the nav's outline aesthetic.
// Four variants chosen by the hour the user logs in (Ghana time):
//   morning   → rising sun (gentle bob + slow ray rotation)
//   afternoon → full sun  (rays spin slowly)
//   evening   → sun on horizon (sun dips below the line)
//   night     → crescent moon with twinkling stars
//
// All animations are CSS-only via the scoped <style> block below — no JS
// timers, no external deps, and they degrade to a static stroke icon if
// the browser disables animation (prefers-reduced-motion).

type Variant = 'morning' | 'afternoon' | 'evening' | 'night';

interface WeatherIconProps {
  variant: Variant;
  size?: number;
  className?: string;
}

const WeatherIcon: React.FC<WeatherIconProps> = ({ variant, size = 36, className = '' }) => {
  const stroke = 'currentColor';

  return (
    <span
      className={`weather-icon weather-icon--${variant} inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes weather-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes weather-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.5px); }
        }
        @keyframes weather-twinkle {
          0%, 100% { opacity: 1;   transform: scale(1);   }
          50%      { opacity: 0.3; transform: scale(0.75); }
        }
        @keyframes weather-pulse {
          0%, 100% { opacity: 0.9; }
          50%      { opacity: 0.55; }
        }
        .weather-icon svg { width: 100%; height: 100%; }
        .weather-icon .core      { transform-origin: center; }
        .weather-icon .rays      { transform-origin: center; animation: weather-spin 24s linear infinite; }
        .weather-icon--morning .core   { animation: weather-bob 4s ease-in-out infinite; }
        .weather-icon--morning .rays   { animation-duration: 30s; }
        .weather-icon--afternoon .rays { animation-duration: 18s; }
        .weather-icon--afternoon .core { animation: weather-pulse 4.5s ease-in-out infinite; }
        .weather-icon--evening .core   { animation: weather-bob 5s ease-in-out infinite; }
        .weather-icon--night .star     { transform-origin: center; }
        .weather-icon--night .star-1   { animation: weather-twinkle 2.6s ease-in-out infinite; }
        .weather-icon--night .star-2   { animation: weather-twinkle 3.4s ease-in-out 0.6s infinite; }
        .weather-icon--night .star-3   { animation: weather-twinkle 2.2s ease-in-out 1.1s infinite; }
        @media (prefers-reduced-motion: reduce) {
          .weather-icon * { animation: none !important; }
        }
      `}</style>

      {variant === 'morning' && (
        <svg viewBox="0 0 24 24" fill="none">
          <g className="rays" stroke={stroke} strokeWidth="1.6" strokeLinecap="round">
            <line x1="12" y1="2"  x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="2"  y1="12" x2="4"  y2="12" />
            <line x1="20" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="4.93"  x2="6.34" y2="6.34" />
            <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
            <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
            <line x1="17.66" y1="6.34"  x2="19.07" y2="4.93" />
          </g>
          <circle className="core" cx="12" cy="12" r="4" stroke={stroke} strokeWidth="1.8" fill="none" />
        </svg>
      )}

      {variant === 'afternoon' && (
        <svg viewBox="0 0 24 24" fill="none">
          <g className="rays" stroke={stroke} strokeWidth="1.6" strokeLinecap="round">
            <line x1="12" y1="1.5" x2="12" y2="4" />
            <line x1="12" y1="20"  x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="4"  y2="12" />
            <line x1="20"  y1="12" x2="22.5" y2="12" />
            <line x1="4.6" y1="4.6"   x2="6.4" y2="6.4" />
            <line x1="17.6" y1="17.6" x2="19.4" y2="19.4" />
            <line x1="4.6" y1="19.4"  x2="6.4" y2="17.6" />
            <line x1="17.6" y1="6.4"  x2="19.4" y2="4.6" />
          </g>
          <circle className="core" cx="12" cy="12" r="4.5" stroke={stroke} strokeWidth="1.8" fill="none" />
        </svg>
      )}

      {variant === 'evening' && (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {/* Horizon line */}
          <line x1="2" y1="19" x2="22" y2="19" />
          {/* Half-set sun + 3 short rays around the upper arc */}
          <g className="core">
            <path d="M6 19 a6 6 0 0 1 12 0" />
            <line x1="12" y1="7"  x2="12" y2="9" />
            <line x1="5.2" y1="11.2" x2="6.6" y2="12.6" />
            <line x1="18.8" y1="11.2" x2="17.4" y2="12.6" />
          </g>
          {/* Short downward arrows / "rays-down" hint */}
          <line x1="4" y1="22" x2="6" y2="22" />
          <line x1="11" y1="22" x2="13" y2="22" />
          <line x1="18" y1="22" x2="20" y2="22" />
        </svg>
      )}

      {variant === 'night' && (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 a6.5 6.5 0 0 0 10.5 10.5 z" />
          <g fill={stroke} stroke="none">
            <circle className="star star-1" cx="5"   cy="6"  r="0.9" />
            <circle className="star star-2" cx="17"  cy="3"  r="0.7" />
            <circle className="star star-3" cx="20"  cy="8"  r="0.6" />
          </g>
        </svg>
      )}
    </span>
  );
};

export default WeatherIcon;
