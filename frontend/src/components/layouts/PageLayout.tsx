import React from 'react';

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageLayout({
  children,
  title,
  subtitle,
  icon,
  actions,
  className = ''
}: PageLayoutProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Page Header */}
      {(title || subtitle || icon || actions) && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {icon && (
                <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                  {icon}
                </div>
              )}
              {(title || subtitle) && (
                <div>
                  {title && (
                    <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                  )}
                  {subtitle && (
                    <p className="text-gray-600">{subtitle}</p>
                  )}
                </div>
              )}
            </div>
            {actions && (
              <div className="flex items-center space-x-3">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page Content */}
      {children}
    </div>
  );
}