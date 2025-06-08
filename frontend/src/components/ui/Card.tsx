import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  border?: boolean;
  shadow?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

const shadows = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg'
};

export function Card({ 
  children, 
  className = '', 
  padding = 'md',
  hover = false,
  border = true,
  shadow = 'sm'
}: CardProps) {
  const baseClasses = 'bg-white rounded-lg';
  const borderClasses = border ? 'border border-gray-200' : '';
  const shadowClasses = shadows[shadow];
  const hoverClasses = hover ? 'hover:border-gray-300 hover:shadow-md transition-all duration-200' : '';
  const paddingClasses = paddings[padding];
  
  const classes = `${baseClasses} ${borderClasses} ${shadowClasses} ${hoverClasses} ${paddingClasses} ${className}`;

  return (
    <div className={classes}>
      {children}
    </div>
  );
}