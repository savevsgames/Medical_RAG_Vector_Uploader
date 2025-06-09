import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

class Database {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  initialize() {
    try {
      if (this.initialized) {
        errorLogger.debug('Database already initialized', {
          component: 'Database'
        });
        return this.client;
      }

      // Validate required configuration
      if (!config.supabase.url) {
        throw new Error('SUPABASE_URL is required');
      }

      if (!config.supabase.serviceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
      }

      // CRITICAL FIX: Use service_role key for backend operations
      // This allows the backend to bypass RLS policies and perform administrative operations
      this.client = createClient(config.supabase.url, config.supabase.serviceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        // Disable realtime for backend service
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      this.initialized = true;

      errorLogger.success('Database client initialized with service_role', {
        component: 'Database',
        supabase_url: config.supabase.url,
        has_service_key: !!config.supabase.serviceKey,
        service_key_preview: config.supabase.serviceKey ? 
          config.supabase.serviceKey.substring(0, 20) + '...' : 'none'
      });

      return this.client;

    } catch (error) {
      errorLogger.error('Failed to initialize database client', error, {
        component: 'Database',
        supabase_url: config.supabase.url,
        has_service_key: !!config.supabase.serviceKey
      });
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.client) {
        throw new Error('Database client not initialized');
      }

      // Test database connection with a simple query
      const { data, error } = await this.client
        .from('documents')
        .select('count', { count: 'exact', head: true });

      if (error) {
        throw error;
      }

      // Test auth context to verify service_role
      const { data: authData, error: authError } = await this.client
        .rpc('test_auth_uid');

      if (authError) {
        errorLogger.warn('Auth context test failed (this is expected for service_role)', {
          component: 'Database',
          error: authError.message
        });
      }

      errorLogger.success('Database health check passed', {
        component: 'Database',
        documents_accessible: !error,
        auth_context_tested: !authError
      });

      return {
        healthy: true,
        message: 'Database connection successful',
        auth_role: 'service_role'
      };

    } catch (error) {
      errorLogger.error('Database health check failed', error, {
        component: 'Database'
      });

      return {
        healthy: false,
        message: error.message
      };
    }
  }

  getClient() {
    if (!this.initialized || !this.client) {
      throw new Error('Database client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  isInitialized() {
    return this.initialized && !!this.client;
  }
}

// Create singleton instance
export const database = new Database();

// Export the initialized client for direct use
export const supabase = database.initialize();

// Log the authentication role for debugging
(async () => {
  try {
    // Test the auth context to confirm we're using service_role
    const { data: authTest, error: authError } = await supabase.auth.getSession();
    
    errorLogger.info('Supabase client auth context', {
      component: 'Database',
      session_exists: !!authTest?.session,
      session_user: authTest?.session?.user?.id || 'none',
      auth_error: authError?.message || 'none',
      client_type: 'service_role'
    });

    // Additional test: Try to query auth.uid() and auth.role() via RPC
    try {
      const { data: roleData, error: roleError } = await supabase
        .rpc('test_auth_uid');
      
      if (roleError) {
        errorLogger.debug('Auth role test (expected to fail for service_role)', {
          component: 'Database',
          error: roleError.message
        });
      } else {
        errorLogger.info('Auth role test result', {
          component: 'Database',
          auth_uid: roleData
        });
      }
    } catch (rpcError) {
      errorLogger.debug('RPC auth test not available (this is normal)', {
        component: 'Database',
        error: rpcError.message
      });
    }

  } catch (error) {
    errorLogger.warn('Auth context test failed', {
      component: 'Database',
      error: error.message
    });
  }
})();