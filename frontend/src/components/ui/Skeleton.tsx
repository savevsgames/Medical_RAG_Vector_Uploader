import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  lines?: number;
}

export function Skeleton({
  className = '',
  width,
  height,
  rounded = false,
  lines = 1
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200';
  const roundedClasses = rounded ? 'rounded-full' : 'rounded';
  
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  if (lines === 1) {
    return (
      <div
        className={`${baseClasses} ${roundedClasses} ${className}`}
        style={style}
      />
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`${baseClasses} ${roundedClasses} h-4`}
          style={{
            width: index === lines - 1 ? '75%' : '100%',
            ...style
          }}
        />
      ))}
    </div>
  );
}