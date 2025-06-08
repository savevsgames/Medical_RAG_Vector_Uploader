import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  dot?: boolean;
}

const variants = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800'
};

const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-2.5 py-1.5 text-sm',
  lg: 'px-3 py-2 text-base'
};

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'sm',
  className = '',
  dot = false
}: BadgeProps) {
  const baseClasses = 'inline-flex items-center font-medium rounded-full';
  const variantClasses = variants[variant];
  const sizeClasses = sizes[size];
  
  const classes = `${baseClasses} ${variantClasses} ${sizeClasses} ${className}`;

  return (
    <span className={classes}>
      {dot && (
        <span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5" />
      )}
      {children}
    </span>
  );
}