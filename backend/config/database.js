import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

let supabaseClient = null;
let initialized = false;

const database = {
  initialize() {
    if (initialized) {
      return supabaseClient;
    }

    try {
      // Validate required environment variables
      if (!config.supabase.url) {
        throw new Error('SUPABASE_URL is required but not provided');
      }
      
      if (!config.supabase.serviceKey) {
        throw new Error('SUPABASE_KEY (service role key) is required but not provided');
      }

      // Validate URL format
      if (!config.supabase.url.startsWith('https://')) {
        throw new Error('SUPABASE_URL must be a valid HTTPS URL');
      }

      // Create Supabase client
      supabaseClient = createClient(
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

      return supabaseClient;
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error, {
        url: config.supabase.url,
        hasServiceKey: !!config.supabase.serviceKey
      });
      throw error;
    }
  },

  getClient() {
    if (!initialized) {
      this.initialize();
    }
    return supabaseClient;
  },

  isInitialized() {
    return initialized;
  },

  async healthCheck() {
    try {
      if (!initialized) {
        return {
          healthy: false,
          message: 'Database client not initialized'
        };
      }

      // Simple query to test connection
      const { data, error } = await supabaseClient
        .from('documents')
        .select('count')
        .limit(1);

      if (error) {
        return {
          healthy: false,
          message: `Database query failed: ${error.message}`
        };
      }

      return {
        healthy: true,
        message: 'Database connection successful'
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Database health check failed: ${error.message}`
      };
    }
  }
};

// Export the database object
export { database };

// Export a proxy for backward compatibility that auto-initializes
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = database.getClient();
    return client[prop];
  }
});