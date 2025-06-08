import { useState, useCallback } from 'react';

interface LoadingState {
  [key: string]: boolean;
}

export function useLoadingState(initialState: LoadingState = {}) {
  const [loading, setLoading] = useState<LoadingState>(initialState);

  const setLoadingState = useCallback((key: string, isLoading: boolean) => {
    setLoading(prev => ({
      ...prev,
      [key]: isLoading
    }));
  }, []);

  const isLoading = useCallback((key: string) => {
    return loading[key] || false;
  }, [loading]);

  const isAnyLoading = useCallback(() => {
    return Object.values(loading).some(Boolean);
  }, [loading]);

  const resetLoading = useCallback(() => {
    setLoading({});
  }, []);

  return {
    loading,
    setLoadingState,
    isLoading,
    isAnyLoading,
    resetLoading
  };
}