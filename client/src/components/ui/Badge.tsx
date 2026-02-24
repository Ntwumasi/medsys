import React from 'react';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'gray';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-primary-100 text-primary-700 border-primary-200',
  secondary: 'bg-secondary-100 text-secondary-700 border-secondary-200',
  success: 'bg-success-100 text-success-700 border-success-200',
  warning: 'bg-warning-100 text-warning-700 border-warning-200',
  danger: 'bg-danger-100 text-danger-700 border-danger-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
};

const dotVariantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-primary-500',
  secondary: 'bg-secondary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-blue-500',
  gray: 'bg-gray-500',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'gray',
  size = 'md',
  dot = false,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotVariantStyles[variant]}`} />
      )}
      {children}
    </span>
  );
};

// Convenience components for common status badges
export const StatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className }) => {
  const statusMap: Record<string, BadgeVariant> = {
    // General statuses
    active: 'success',
    inactive: 'gray',
    pending: 'warning',
    completed: 'success',
    cancelled: 'gray',
    // Patient/Encounter statuses
    waiting: 'warning',
    'in-progress': 'primary',
    in_progress: 'primary',
    checked_in: 'info',
    with_nurse: 'primary',
    with_doctor: 'secondary',
    discharged: 'success',
    // Lab statuses
    collected: 'info',
    processing: 'primary',
    resulted: 'success',
    // Order statuses
    ordered: 'warning',
    approved: 'success',
    rejected: 'danger',
    dispensed: 'success',
  };

  const variant = statusMap[status.toLowerCase()] || 'gray';
  const displayStatus = status.replace(/_/g, ' ').replace(/-/g, ' ');

  return (
    <Badge variant={variant} dot className={className}>
      {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
    </Badge>
  );
};

export default Badge;
