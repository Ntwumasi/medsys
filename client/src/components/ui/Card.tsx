import React from 'react';
import { dsActive } from '../../utils/dsClass';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  animate?: boolean;
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const Card: React.FC<CardProps> & {
  Header: React.FC<CardHeaderProps>;
  Body: React.FC<CardBodyProps>;
  Footer: React.FC<CardFooterProps>;
} = ({ children, className = '', hover = false, padding = 'none', animate = false }) => {
  return (
    <div
      className={`${dsActive() ? 'bg-ds-surface rounded-ds-card border border-ds-border shadow-ds-card' : 'bg-white rounded-xl border border-gray-200 shadow-card'} ${hover ? 'hover:shadow-card-hover transition-shadow duration-200' : ''} ${paddingStyles[padding]} ${animate ? 'animate-scale-in' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '', action }) => {
  return (
    <div className={`px-6 py-4 border-b ${dsActive() ? 'border-ds-border flex-wrap gap-3' : 'border-gray-100'} flex items-center justify-between ${className}`}>
      <div className={`font-semibold ${dsActive() ? 'text-ds-text flex-1 min-w-0' : 'text-gray-900'}`}>{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
};

const CardBody: React.FC<CardBodyProps> = ({ children, className = '' }) => {
  return <div className={`p-6 ${className}`}>{children}</div>;
};

const CardFooter: React.FC<CardFooterProps> = ({ children, className = '' }) => {
  return (
    <div className={`px-6 py-4 border-t ${dsActive() ? 'border-ds-border bg-ds-subtle rounded-b-ds-card' : 'border-gray-100 bg-gray-50 rounded-b-xl'} ${className}`}>
      {children}
    </div>
  );
};

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
