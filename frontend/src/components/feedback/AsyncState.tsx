import React from 'react';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

interface AsyncStateProps {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  loadingText?: string;
  errorTitle?: string;
  retryLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export function AsyncState({
  loading,
  error,
  onRetry,
  loadingText,
  errorTitle,
  retryLabel,
  children,
  className = ''
}: AsyncStateProps) {
  if (loading) {
    return (
      <LoadingState
        text={loadingText}
        center
        className={className}
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title={errorTitle}
        message={error}
        onRetry={onRetry}
        retryLabel={retryLabel}
        variant="card"
        className={className}
      />
    );
  }

  return <>{children}</>;
}