import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  showIcon?: boolean;
  variant?: 'inline' | 'card' | 'page';
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  showIcon = true,
  variant = 'inline',
  className = ''
}: ErrorStateProps) {
  const baseClasses = 'text-center';
  
  const variantClasses = {
    inline: 'p-4',
    card: 'p-6 bg-red-50 border border-red-200 rounded-lg',
    page: 'py-12 px-4'
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {showIcon && (
        <div className="flex justify-center mb-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
        </div>
      )}
      
      <h3 className="text-lg font-medium text-red-900 mb-2">
        {title}
      </h3>
      
      <p className="text-red-700 mb-6 max-w-md mx-auto">
        {message}
      </p>
      
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          icon={<RefreshCw className="w-4 h-4" />}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}