import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'shimmer' | 'none';
}

const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}) => {
  const baseStyles = 'bg-gray-200';

  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    shimmer: 'animate-shimmer bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]',
    none: '',
  };

  const style: React.CSSProperties = {
    width: width,
    height: height || (variant === 'text' ? '1em' : undefined),
  };

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${animationStyles[animation]} ${className}`}
      style={style}
    />
  );
};

// Convenience components
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        variant="text"
        height="0.875rem"
        width={i === lines - 1 ? '60%' : '100%'}
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
    <div className="flex items-center space-x-4 mb-4">
      <Skeleton variant="circular" width={48} height={48} />
      <div className="flex-1">
        <Skeleton variant="text" width="40%" height="1rem" className="mb-2" />
        <Skeleton variant="text" width="60%" height="0.75rem" />
      </div>
    </div>
    <SkeletonText lines={3} />
  </div>
);

export const SkeletonStatCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
    <Skeleton variant="text" width="50%" height="0.75rem" className="mb-3" />
    <Skeleton variant="text" width="40%" height="2rem" className="mb-2" />
    <Skeleton variant="text" width="70%" height="0.75rem" />
  </div>
);

// Patient List Row Skeleton
export const SkeletonPatientRow: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div>
          <Skeleton variant="text" width={160} height="1.125rem" className="mb-2" />
          <Skeleton variant="text" width={120} height="0.75rem" />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <Skeleton variant="text" width={100} height="0.875rem" />
        <Skeleton variant="rectangular" width={80} height={28} />
      </div>
    </div>
  </div>
);

// Patient List Page Skeleton
export const SkeletonPatientList: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    {/* Header */}
    <div className="flex justify-between items-center mb-6">
      <Skeleton variant="text" width={200} height="2rem" />
      <Skeleton variant="rectangular" width={140} height={40} />
    </div>

    {/* Search and filters */}
    <div className="flex gap-4 mb-6">
      <Skeleton variant="rectangular" width="100%" height={44} className="flex-1" />
      <Skeleton variant="rectangular" width={120} height={44} />
    </div>

    {/* Patient rows */}
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => (
        <SkeletonPatientRow key={i} />
      ))}
    </div>
  </div>
);

// Dashboard Stats Skeleton
export const SkeletonDashboardStats: React.FC = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {[...Array(4)].map((_, i) => (
      <SkeletonStatCard key={i} />
    ))}
  </div>
);

// Table Skeleton
export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 4
}) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    {/* Header */}
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
      {[...Array(cols)].map((_, i) => (
        <Skeleton key={i} variant="text" width={`${100/cols}%`} height="0.875rem" />
      ))}
    </div>
    {/* Rows */}
    <div className="divide-y divide-gray-100">
      {[...Array(rows)].map((_, rowIndex) => (
        <div key={rowIndex} className="px-4 py-4 flex gap-4">
          {[...Array(cols)].map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              width={`${100/cols}%`}
              height="1rem"
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

// Full Page Loading Skeleton
export const SkeletonPage: React.FC<{ title?: boolean }> = ({ title = true }) => (
  <div className="p-6 space-y-6 animate-fade-in">
    {title && <Skeleton variant="text" width={250} height="2rem" className="mb-2" />}
    <SkeletonDashboardStats />
    <SkeletonTable rows={8} cols={5} />
  </div>
);

export default Skeleton;
