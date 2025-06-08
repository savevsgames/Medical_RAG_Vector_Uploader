import React from 'react';

interface StatItem {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'yellow' | 'red';
  change?: {
    value: string;
    trend: 'up' | 'down' | 'neutral';
  };
}

interface StatsLayoutProps {
  stats: StatItem[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red: 'bg-red-50 text-red-600'
};

export function StatsLayout({ 
  stats, 
  columns = 3,
  className = ''
}: StatsLayoutProps) {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
  };

  return (
    <div className={`grid ${gridClasses[columns]} gap-4 ${className}`}>
      {stats.map((stat, index) => (
        <div
          key={index}
          className={`rounded-lg p-4 ${
            stat.color ? colorClasses[stat.color] : 'bg-gray-50'
          }`}
        >
          <div className="flex items-center space-x-2 mb-2">
            {stat.icon && (
              <div className="w-5 h-5">
                {stat.icon}
              </div>
            )}
            <span className="text-sm font-medium">
              {stat.label}
            </span>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold">
              {stat.value}
            </p>
            {stat.change && (
              <span className={`text-xs ${
                stat.change.trend === 'up' ? 'text-green-600' :
                stat.change.trend === 'down' ? 'text-red-600' :
                'text-gray-500'
              }`}>
                {stat.change.value}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}