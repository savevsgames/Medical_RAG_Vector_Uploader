import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  center?: boolean;
  overlay?: boolean;
  className?: string;
}

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

export function LoadingState({ 
  size = 'md', 
  text,
  center = false,
  overlay = false,
  className = ''
}: LoadingStateProps) {
  const sizeClasses = sizes[size];
  const centerClasses = center ? 'flex items-center justify-center' : '';
  const overlayClasses = overlay ? 'absolute inset-0 bg-white bg-opacity-75 z-10' : '';
  
  return (
    <div className={`${centerClasses} ${overlayClasses} ${className}`}>
      <div className="flex flex-col items-center space-y-2">
        <Loader2 className={`${sizeClasses} animate-spin text-blue-600`} />
        {text && (
          <p className="text-sm text-gray-600">{text}</p>
        )}
      </div>
    </div>
  );
}