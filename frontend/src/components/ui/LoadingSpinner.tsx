import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
  center?: boolean;
}

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

export function LoadingSpinner({ 
  size = 'md', 
  className = '', 
  text,
  center = false
}: LoadingSpinnerProps) {
  const sizeClasses = sizes[size];
  const centerClasses = center ? 'flex items-center justify-center' : '';
  
  return (
    <div className={`${centerClasses} ${className}`}>
      <div className="flex flex-col items-center space-y-2">
        <Loader2 className={`${sizeClasses} animate-spin text-blue-600`} />
        {text && (
          <p className="text-sm text-gray-600">{text}</p>
        )}
      </div>
    </div>
  );
}