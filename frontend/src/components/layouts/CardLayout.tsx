import React from 'react';
import { Card } from '../ui/Card';

interface CardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function CardLayout({
  children,
  title,
  subtitle,
  actions,
  className = '',
  contentClassName = ''
}: CardLayoutProps) {
  return (
    <Card className={className} padding="none">
      {/* Card Header */}
      {(title || subtitle || actions) && (
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            )}
            {subtitle && (
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center space-x-2">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Card Content */}
      <div className={`p-6 ${contentClassName}`}>
        {children}
      </div>
    </Card>
  );
}