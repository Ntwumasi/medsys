import React from 'react';
import NumberTicker from './NumberTicker';

// Shared stat card. Used directly by Pharmacy and Imaging dashboards;
// other dashboards have inline equivalents that follow the same visual
// recipe. Color is reserved for the number itself — the surface stays
// neutral so the cards read as data, not decoration. When `value` is a
// finite number we run it through NumberTicker for a subtle count-up
// on first paint.

type StatCardVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: StatCardVariant;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  onClick?: () => void;
}

const variantStyles: Record<StatCardVariant, { num: string; ring: string; iconBg: string; iconFg: string }> = {
  primary:   { num: 'text-primary-700',   ring: 'ring-primary-200/60',   iconBg: 'bg-primary-100',   iconFg: 'text-primary-600' },
  secondary: { num: 'text-secondary-700', ring: 'ring-secondary-200/60', iconBg: 'bg-secondary-100', iconFg: 'text-secondary-600' },
  success:   { num: 'text-success-700',   ring: 'ring-success-200/60',   iconBg: 'bg-success-100',   iconFg: 'text-success-600' },
  warning:   { num: 'text-warning-700',   ring: 'ring-warning-200/60',   iconBg: 'bg-warning-100',   iconFg: 'text-warning-600' },
  danger:    { num: 'text-danger-700',    ring: 'ring-danger-200/60',    iconBg: 'bg-danger-100',    iconFg: 'text-danger-600' },
  info:      { num: 'text-blue-700',      ring: 'ring-blue-200/60',      iconBg: 'bg-blue-100',      iconFg: 'text-blue-600' },
  neutral:   { num: 'text-text-primary',  ring: 'ring-gray-200/60',      iconBg: 'bg-gray-100',      iconFg: 'text-gray-500' },
};

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'neutral',
  trend,
  className = '',
  onClick,
}) => {
  const styles = variantStyles[variant];
  const numericValue = typeof value === 'number' ? value : null;

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 transition-all ${onClick ? `cursor-pointer hover:shadow-md hover:ring-1 ${styles.ring}` : ''} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">{title}</p>
          <p className={`text-3xl font-bold tabular-nums leading-tight ${styles.num}`}>
            {numericValue !== null ? <NumberTicker value={numericValue} /> : value}
          </p>
          {subtitle && <p className="text-xs text-text-secondary mt-1">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center mt-2 text-xs ${trend.isPositive ? 'text-success-600' : 'text-danger-600'}`}>
              <svg
                className={`w-3.5 h-3.5 mr-1 ${trend.isPositive ? '' : 'rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span className="font-semibold tabular-nums">{Math.abs(trend.value)}%</span>
              <span className="ml-1 text-text-secondary">vs last period</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${styles.iconBg} ${styles.iconFg}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
