import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

export function Card({ 
  children, 
  className = '', 
  padding = 'md',
  hover = false 
}: CardProps) {
  const baseClasses = 'bg-white rounded-lg border border-gray-200 shadow-sm';
  const hoverClasses = hover ? 'hover:border-gray-300 hover:shadow-md transition-all duration-200' : '';
  const paddingClasses = paddings[padding];
  
  const classes = `${baseClasses} ${hoverClasses} ${paddingClasses} ${className}`;

  return (
    <div className={classes}>
      {children}
    </div>
  );
}