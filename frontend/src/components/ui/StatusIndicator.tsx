import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'success' | 'error' | 'warning' | 'loading' | 'pending' | 'idle';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const statusConfig = {
  success: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Success'
  },
  error: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: 'Error'
  },
  warning: {
    icon: AlertCircle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    label: 'Warning'
  },
  loading: {
    icon: Loader2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Loading',
    animate: true
  },
  pending: {
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: 'Pending'
  },
  idle: {
    icon: AlertCircle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
    label: 'Idle'
  }
};

const sizes = {
  sm: { icon: 'w-4 h-4', container: 'px-2 py-1 text-xs' },
  md: { icon: 'w-5 h-5', container: 'px-3 py-1.5 text-sm' },
  lg: { icon: 'w-6 h-6', container: 'px-4 py-2 text-base' }
};

export function StatusIndicator({
  status,
  label,
  size = 'md',
  showIcon = true,
  className = ''
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizeConfig = sizes[size];
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center rounded-full ${config.bgColor} ${sizeConfig.container} ${className}`}>
      {showIcon && (
        <Icon 
          className={`${sizeConfig.icon} ${config.color} ${config.animate ? 'animate-spin' : ''} ${label ? 'mr-2' : ''}`} 
        />
      )}
      {label && (
        <span className={`font-medium ${config.color}`}>
          {label}
        </span>
      )}
    </div>
  );
}