import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useApiClient } from '../../lib/apiClient';
import { logger } from '../../utils/logger';

interface UseApiQueryOptions<T> extends Omit<UseQueryOptions<T>, 'queryFn'> {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
}

export function useApiQuery<T = any>({
  endpoint,
  method = 'GET',
  body,
  queryKey,
  ...options
}: UseApiQueryOptions<T>) {
  const apiClient = useApiClient();

  return useQuery<T>({
    queryKey: queryKey || [method, endpoint, body],
    queryFn: async () => {
      logger.debug('API query executed', {
        endpoint,
        method,
        component: 'useApiQuery'
      });

      const response = await apiClient[method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](
        endpoint,
        body
      );
      
      return response.data;
    },
    ...options
  });
}