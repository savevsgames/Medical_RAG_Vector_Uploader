import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import { useApiClient } from '../../lib/apiClient';
import { logger } from '../../utils/logger';

interface UseApiMutationOptions<TData, TVariables> 
  extends Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> {
  endpoint: string | ((variables: TVariables) => string);
  method?: 'POST' | 'PUT' | 'DELETE';
}

export function useApiMutation<TData = any, TVariables = any>({
  endpoint,
  method = 'POST',
  ...options
}: UseApiMutationOptions<TData, TVariables>) {
  const apiClient = useApiClient();

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const url = typeof endpoint === 'function' ? endpoint(variables) : endpoint;
      
      logger.debug('API mutation executed', {
        endpoint: url,
        method,
        component: 'useApiMutation'
      });

      const response = await apiClient[method.toLowerCase() as 'post' | 'put' | 'delete'](
        url,
        variables
      );
      
      return response.data;
    },
    ...options
  });
}