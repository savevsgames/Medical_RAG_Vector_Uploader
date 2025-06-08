// Centralized API client with React Query integration
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
}

interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
}

class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number = 30000;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async request<T = any>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      timeout = this.defaultTimeout
    } = options;

    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      signal: AbortSignal.timeout(timeout)
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    try {
      logger.debug('API request initiated', {
        method,
        url,
        hasBody: !!body,
        component: 'ApiClient'
      });

      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      logger.debug('API request completed', {
        method,
        url,
        status: response.status,
        component: 'ApiClient'
      });

      return {
        data,
        status: response.status,
        statusText: response.statusText
      };

    } catch (error) {
      logger.error('API request failed', {
        method,
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
        component: 'ApiClient'
      });
      throw error;
    }
  }

  // Convenience methods
  async get<T = any>(endpoint: string, options?: Omit<ApiOptions, 'method'>) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T = any>(endpoint: string, body?: any, options?: Omit<ApiOptions, 'method' | 'body'>) {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  async put<T = any>(endpoint: string, body?: any, options?: Omit<ApiOptions, 'method' | 'body'>) {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  async delete<T = any>(endpoint: string, options?: Omit<ApiOptions, 'method'>) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Authenticated API client hook
export function useApiClient() {
  const { session } = useAuth();
  
  const apiClient = new ApiClient(import.meta.env.VITE_API_URL || '');

  // Add authentication header to all requests
  const authenticatedRequest = async <T = any>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<ApiResponse<T>> => {
    if (!session) {
      throw new Error('No authentication session available');
    }

    const authHeaders = {
      'Authorization': `Bearer ${session.access_token}`,
      ...options.headers
    };

    return apiClient.request<T>(endpoint, {
      ...options,
      headers: authHeaders
    });
  };

  return {
    get: <T = any>(endpoint: string, options?: Omit<ApiOptions, 'method'>) =>
      authenticatedRequest<T>(endpoint, { ...options, method: 'GET' }),
    
    post: <T = any>(endpoint: string, body?: any, options?: Omit<ApiOptions, 'method' | 'body'>) =>
      authenticatedRequest<T>(endpoint, { ...options, method: 'POST', body }),
    
    put: <T = any>(endpoint: string, body?: any, options?: Omit<ApiOptions, 'method' | 'body'>) =>
      authenticatedRequest<T>(endpoint, { ...options, method: 'PUT', body }),
    
    delete: <T = any>(endpoint: string, options?: Omit<ApiOptions, 'method'>) =>
      authenticatedRequest<T>(endpoint, { ...options, method: 'DELETE' })
  };
}

// Create a default instance for non-authenticated requests
export const apiClient = new ApiClient(import.meta.env.VITE_API_URL || '');