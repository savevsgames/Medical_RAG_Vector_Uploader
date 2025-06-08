import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { logger, logApiCall } from '../utils/logger';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useApi<T = any>() {
  const { session, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiCall = useCallback(async (
    endpoint: string, 
    options: ApiOptions = {}
  ): Promise<T | null> => {
    if (!session) {
      throw new Error('No authentication session');
    }

    const { method = 'GET', body, headers = {} } = options;
    const userEmail = user?.email;

    setLoading(true);
    setError(null);

    try {
      logApiCall(endpoint, method, userEmail, 'initiated', {
        component: 'useApi'
      });

      const config: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      if (body && method !== 'GET') {
        config.body = JSON.stringify(body);
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        logApiCall(endpoint, method, userEmail, 'error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          component: 'useApi'
        });

        throw new Error(errorData.details || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      logApiCall(endpoint, method, userEmail, 'success', {
        status: response.status,
        component: 'useApi'
      });

      return data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown API error';
      setError(errorMessage);
      
      logger.error('API call failed', {
        component: 'useApi',
        user: userEmail,
        endpoint,
        method,
        error: errorMessage
      });

      throw err;
    } finally {
      setLoading(false);
    }
  }, [session, user]);

  return {
    apiCall,
    loading,
    error,
    clearError: () => setError(null)
  };
}