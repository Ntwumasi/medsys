import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { width: 100, height: 40 },
  md: { width: 160, height: 60 },
  lg: { width: 220, height: 80 },
  xl: { width: 280, height: 100 },
};

const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const { height } = sizeMap[size];
  const iconSize = height * 0.9;

  if (!showText) {
    // Icon only version
    return (
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 2 60 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Medics Clinic"
      >
        {/* Cross/Plus shape */}
        <path
          d="M22 8h16c2 0 4 2 4 4v12h12c2 0 4 2 4 4v16c0 2-2 4-4 4H42v12c0 2-2 4-4 4H22c-2 0-4-2-4-4V48H6c-2 0-4-2-4-4V28c0-2 2-4 4-4h12V12c0-2 2-4 4-4z"
          fill="#E8F7F7"
          stroke="#5BC5C8"
          strokeWidth="2.5"
        />
        {/* DNA Helix */}
        <path
          d="M30 15c-4 4-4 10 0 14s4 10 0 14M26 19c4 2 8 2 8 0M26 29c4 2 8 2 8 0M26 39c4 2 8 2 8 0"
          stroke="#8E4585"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="26" cy="19" r="2" fill="#8E4585" />
        <circle cx="34" cy="19" r="2" fill="#8E4585" />
        <circle cx="26" cy="29" r="2" fill="#8E4585" />
        <circle cx="34" cy="29" r="2" fill="#8E4585" />
        <circle cx="26" cy="39" r="2" fill="#8E4585" />
        <circle cx="34" cy="39" r="2" fill="#8E4585" />
      </svg>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 2 60 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Cross/Plus shape */}
        <path
          d="M22 8h16c2 0 4 2 4 4v12h12c2 0 4 2 4 4v16c0 2-2 4-4 4H42v12c0 2-2 4-4 4H22c-2 0-4-2-4-4V48H6c-2 0-4-2-4-4V28c0-2 2-4 4-4h12V12c0-2 2-4 4-4z"
          fill="#E8F7F7"
          stroke="#5BC5C8"
          strokeWidth="2.5"
        />
        {/* DNA Helix */}
        <path
          d="M30 15c-4 4-4 10 0 14s4 10 0 14M26 19c4 2 8 2 8 0M26 29c4 2 8 2 8 0M26 39c4 2 8 2 8 0"
          stroke="#8E4585"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="26" cy="19" r="2" fill="#8E4585" />
        <circle cx="34" cy="19" r="2" fill="#8E4585" />
        <circle cx="26" cy="29" r="2" fill="#8E4585" />
        <circle cx="34" cy="29" r="2" fill="#8E4585" />
        <circle cx="26" cy="39" r="2" fill="#8E4585" />
        <circle cx="34" cy="39" r="2" fill="#8E4585" />
      </svg>

      {/* Text */}
      <div className="flex flex-col leading-none" style={{ marginLeft: '-4px' }}>
        <span
          className="font-semibold tracking-tight"
          style={{
            color: '#5BC5C8',
            fontSize: `${height * 0.38}px`,
            lineHeight: 1.1,
          }}
        >
          Medics
        </span>
        <span
          className="font-medium tracking-wide"
          style={{
            color: '#8E4585',
            fontSize: `${height * 0.28}px`,
            lineHeight: 1.1,
            marginTop: '-2px',
          }}
        >
          Clinic
        </span>
      </div>
    </div>
  );
};

export default Logo;
