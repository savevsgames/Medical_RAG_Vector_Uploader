import React from 'react';
import { CheckCircle, AlertCircle, XCircle, Info, X } from 'lucide-react';

interface AlertProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const variants = {
  success: {
    container: 'bg-green-50 border-green-200 text-green-800',
    icon: CheckCircle,
    iconColor: 'text-green-400'
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: AlertCircle,
    iconColor: 'text-yellow-400'
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-800',
    icon: XCircle,
    iconColor: 'text-red-400'
  },
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: Info,
    iconColor: 'text-blue-400'
  }
};

export function Alert({
  children,
  variant = 'info',
  title,
  dismissible = false,
  onDismiss,
  className = ''
}: AlertProps) {
  const config = variants[variant];
  const Icon = config.icon;

  return (
    <div className={`border rounded-lg p-4 ${config.container} ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className="text-sm font-medium mb-1">
              {title}
            </h3>
          )}
          <div className="text-sm">
            {children}
          </div>
        </div>
        {dismissible && onDismiss && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={onDismiss}
                className={`inline-flex rounded-md p-1.5 hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-offset-2 ${config.iconColor}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}