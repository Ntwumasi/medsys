import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { iconSize: 24, fontSize: 16 },
  md: { iconSize: 28, fontSize: 18 },
  lg: { iconSize: 32, fontSize: 22 },
  xl: { iconSize: 40, fontSize: 28 },
};

const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const { iconSize, fontSize } = sizeMap[size];

  // Bar chart medical data icon (matching the original MedSys EMR logo)
  const IconSvg = () => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="MedSys EMR"
    >
      {/* Three vertical bars representing medical data/charts */}
      <rect x="4" y="10" width="4" height="10" rx="1" fill="#5BC5C8" />
      <rect x="10" y="6" width="4" height="14" rx="1" fill="#5BC5C8" />
      <rect x="16" y="4" width="4" height="16" rx="1" fill="#5BC5C8" />
    </svg>
  );

  if (!showText) {
    return (
      <div className={className}>
        <IconSvg />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <IconSvg />
      <span
        className="font-bold"
        style={{
          color: '#2d3748',
          fontSize: `${fontSize}px`,
        }}
      >
        MedSys EMR
      </span>
    </div>
  );
};

export default Logo;
