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
      // CRITICAL FIX: Use service_role key instead of anon key for backend operations
      if (!config.supabase.serviceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for backend operations');
      }

      errorLogger.info('Initializing Supabase client with service role', {
        url: config.supabase.url,
        has_service_key: !!config.supabase.serviceKey,
        service_key_length: config.supabase.serviceKey?.length || 0,
        component: 'Database'
      });

      // Use service_role key for backend operations
      this.client = createClient(
        config.supabase.url,
        config.supabase.serviceKey, // CHANGED: from anonKey to serviceKey
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          },
          db: {
            schema: 'public'
          }
        }
      );

      this.initialized = true;

      errorLogger.success('Supabase client initialized with service_role', {
        url: config.supabase.url,
        auth_mode: 'service_role',
        component: 'Database'
      });

      return { success: true, client: this.client };

    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error, {
        component: 'Database',
        has_url: !!config.supabase.url,
        has_service_key: !!config.supabase.serviceKey
      });
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.client) {
        return { 
          healthy: false, 
          message: 'Database client not initialized',
          auth_role: null
        };
      }

      // Test basic connectivity with a simple query
      const { data, error } = await this.client
        .from('documents')
        .select('count', { count: 'exact', head: true });

      if (error) {
        errorLogger.warn('Database health check failed', {
          error: error.message,
          component: 'Database'
        });
        return { 
          healthy: false, 
          message: error.message,
          auth_role: 'service_role'
        };
      }

      // Test auth context to confirm service_role
      try {
        const { data: authTest, error: authError } = await this.client
          .rpc('test_auth_uid');

        errorLogger.debug('Auth context test', {
          auth_test_result: authTest,
          auth_error: authError?.message,
          component: 'Database'
        });
      } catch (authTestError) {
        errorLogger.debug('Auth test function not available', {
          error: authTestError.message,
          component: 'Database'
        });
      }

      errorLogger.success('Database health check passed', {
        auth_role: 'service_role',
        component: 'Database'
      });

      return { 
        healthy: true, 
        message: 'Database connection successful',
        auth_role: 'service_role'
      };

    } catch (error) {
      errorLogger.error('Database health check error', error, {
        component: 'Database'
      });
      return { 
        healthy: false, 
        message: error.message,
        auth_role: 'service_role'
      };
    }
  }

  getClient() {
    if (!this.initialized || !this.client) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.client;
  }

  isInitialized() {
    return this.initialized && !!this.client;
  }
}

// Create singleton instance
export const database = new Database();

// Export the Supabase client for direct use
export const supabase = database.getClient.bind(database);