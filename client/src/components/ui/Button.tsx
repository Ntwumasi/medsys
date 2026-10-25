import React from 'react';
import { dsActive } from '../../utils/dsClass';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'ghost' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white shadow-soft hover:shadow-medium focus:ring-primary-300',
  secondary: 'bg-secondary-500 hover:bg-secondary-600 text-white shadow-soft hover:shadow-medium focus:ring-secondary-300',
  danger: 'bg-danger-500 hover:bg-danger-600 text-white shadow-soft hover:shadow-medium focus:ring-danger-300',
  warning: 'bg-warning-500 hover:bg-warning-600 text-white shadow-soft hover:shadow-medium focus:ring-warning-300',
  success: 'bg-success-500 hover:bg-success-600 text-white shadow-soft hover:shadow-medium focus:ring-success-300',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-300',
  outline: 'bg-transparent border-2 border-primary-500 text-primary-600 hover:bg-primary-50 focus:ring-primary-300',
};

// Design-system ("Care") styles, used while a migrated screen is open. One
// accent for primary actions; secondary is a neutral outline; all sizes meet
// the 44px touch minimum.
const dsVariantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-ds-accent hover:bg-ds-accent-hover text-ds-on-accent focus:ring-ds-focus-ring',
  secondary: 'bg-ds-surface border border-ds-border-control text-ds-text hover:bg-ds-subtle focus:ring-ds-focus-ring',
  danger: 'bg-ds-critical hover:bg-ds-critical/90 text-white focus:ring-ds-critical',
  warning: 'bg-ds-warning hover:bg-ds-warning/90 text-white dark:text-ds-canvas focus:ring-ds-warning',
  success: 'bg-ds-success hover:bg-ds-success/90 text-white dark:text-ds-canvas focus:ring-ds-success',
  ghost: 'bg-transparent hover:bg-ds-subtle text-ds-text-secondary focus:ring-ds-focus-ring',
  outline: 'bg-transparent border-2 border-ds-accent text-ds-accent-text hover:bg-ds-accent-soft focus:ring-ds-focus-ring',
};

const dsSizeStyles: Record<ButtonSize, string> = {
  xs: 'min-h-ds-touch px-3 text-sm rounded-ds-sm',
  sm: 'min-h-ds-touch px-3.5 text-sm rounded-ds-control',
  md: 'min-h-ds-touch px-4 text-sm rounded-ds-control',
  lg: 'min-h-ds-control px-6 text-base rounded-ds-control',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-xs rounded',
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}) => {
  const ds = dsActive();
  const baseStyles = `inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${ds ? 'dark:focus:ring-offset-ds-surface' : ''} disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <button
      className={`${baseStyles} ${(ds ? dsVariantStyles : variantStyles)[variant]} ${(ds ? dsSizeStyles : sizeStyles)[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : leftIcon ? (
        <span className="mr-2">{leftIcon}</span>
      ) : null}
      {children}
      {rightIcon && !isLoading && <span className="ml-2">{rightIcon}</span>}
    </button>
  );
};

export default Button;
