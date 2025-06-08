import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

// Lazy-loaded Supabase client
let supabase = null;
let initialized = false;

const database = {
  // Initialize the Supabase client with proper error handling
  initialize() {
    if (initialized) {
      return supabase;
    }

    try {
      // Validate required environment variables
      if (!config.supabase.url) {
        throw new Error('SUPABASE_URL is required but not configured');
      }

      if (!config.supabase.serviceKey) {
        throw new Error('SUPABASE_KEY (service role key) is required but not configured');
      }

      // Create the Supabase client
      supabase = createClient(
        config.supabase.url,
        config.supabase.serviceKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );

      initialized = true;
      errorLogger.success('Supabase client initialized successfully', {
        url: config.supabase.url,
        hasServiceKey: !!config.supabase.serviceKey
      });

      return supabase;
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error, {
        url: config.supabase.url,
        hasServiceKey: !!config.supabase.serviceKey,
        component: 'database'
      });
      throw error;
    }
  },

  // Get the Supabase client (initialize if needed)
  getClient() {
    if (!initialized) {
      return this.initialize();
    }
    return supabase;
  },

  // Health check for database connection
  async healthCheck() {
    try {
      // Initialize client if not already done
      if (!initialized) {
        this.initialize();
      }

      if (!supabase) {
        return {
          healthy: false,
          message: 'Supabase client not initialized'
        };
      }

      // Perform a simple query to test the connection
      const { data, error } = await supabase
        .from('documents')
        .select('count')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is fine
        errorLogger.warn('Database health check query failed', {
          error: error.message,
          code: error.code,
          component: 'database'
        });
        return {
          healthy: false,
          message: `Database query failed: ${error.message}`
        };
      }

      errorLogger.debug('Database health check passed', {
        component: 'database'
      });

      return {
        healthy: true,
        message: 'Database connection successful'
      };

    } catch (error) {
      errorLogger.error('Database health check failed', error, {
        component: 'database'
      });

      return {
        healthy: false,
        message: error.message || 'Unknown database error'
      };
    }
  },

  // Check if the client is initialized
  isInitialized() {
    return initialized;
  }
};

// Export the database object and the supabase client getter
export { database };

// Export a getter function for the supabase client
export const supabase = new Proxy({}, {
  get(target, prop) {
    if (!initialized) {
      database.initialize();
    }
    return supabase[prop];
  }
});