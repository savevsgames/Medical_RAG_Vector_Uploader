import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { logger } from '../../../utils/logger';

interface ErrorState {
  [key: string]: string | null;
}

export function useErrorHandler(initialState: ErrorState = {}) {
  const [errors, setErrors] = useState<ErrorState>(initialState);

  const setError = useCallback((key: string, error: string | Error | null) => {
    const errorMessage = error instanceof Error ? error.message : error;
    
    setErrors(prev => ({
      ...prev,
      [key]: errorMessage
    }));

    // Log error for debugging
    if (errorMessage) {
      logger.error(`Error in ${key}`, { error: errorMessage });
    }
  }, []);

  const clearError = useCallback((key: string) => {
    setErrors(prev => ({
      ...prev,
      [key]: null
    }));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  const handleError = useCallback((key: string, error: Error | string, showToast = true) => {
    const errorMessage = error instanceof Error ? error.message : error;
    
    setError(key, errorMessage);
    
    if (showToast) {
      toast.error(errorMessage);
    }

    logger.error(`Handled error in ${key}`, { error: errorMessage });
  }, [setError]);

  const getError = useCallback((key: string) => {
    return errors[key] || null;
  }, [errors]);

  const hasError = useCallback((key: string) => {
    return !!errors[key];
  }, [errors]);

  const hasAnyError = useCallback(() => {
    return Object.values(errors).some(Boolean);
  }, [errors]);

  return {
    errors,
    setError,
    clearError,
    clearAllErrors,
    handleError,
    getError,
    hasError,
    hasAnyError
  };
}