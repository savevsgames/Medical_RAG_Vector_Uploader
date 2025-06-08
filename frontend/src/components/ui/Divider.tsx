import React from 'react';

interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  children?: React.ReactNode;
}

export function Divider({
  orientation = 'horizontal',
  className = '',
  children
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div className={`border-l border-gray-200 ${className}`} />
    );
  }

  if (children) {
    return (
      <div className={`relative ${className}`}>
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">{children}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-t border-gray-200 ${className}`} />
  );
}