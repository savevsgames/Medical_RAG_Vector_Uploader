import { useState, useCallback } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseAsyncStateOptions {
  initialData?: any;
  onError?: (error: Error) => void;
  onSuccess?: (data: any) => void;
}

export function useAsyncState<T = any>(options: UseAsyncStateOptions = {}) {
  const [state, setState] = useState<AsyncState<T>>({
    data: options.initialData || null,
    loading: false,
    error: null
  });

  const execute = useCallback(async (asyncFunction: () => Promise<T>) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await asyncFunction();
      setState({ data: result, loading: false, error: null });
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      options.onError?.(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }, [options]);

  const reset = useCallback(() => {
    setState({
      data: options.initialData || null,
      loading: false,
      error: null
    });
  }, [options.initialData]);

  const setData = useCallback((data: T) => {
    setState(prev => ({ ...prev, data }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, loading: false }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
    setError,
    clearError
  };
}