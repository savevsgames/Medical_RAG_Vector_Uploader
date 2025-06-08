import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

let supabaseClient = null;
let initializationError = null;

function initializeSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (initializationError) {
    throw initializationError;
  }

  try {
    // Check for required environment variables
    if (!config.supabase.url) {
      throw new Error('SUPABASE_URL environment variable is required');
    }

    if (!config.supabase.serviceKey) {
      throw new Error('SUPABASE_KEY (service role key) environment variable is required');
    }

    errorLogger.info('Initializing Supabase client', {
      url: config.supabase.url,
      hasServiceKey: !!config.supabase.serviceKey,
      component: 'Database'
    });

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

    errorLogger.success('Supabase client initialized successfully', {
      component: 'Database'
    });

    return supabaseClient;

  } catch (error) {
    initializationError = error;
    errorLogger.error('Failed to initialize Supabase client', error, {
      component: 'Database',
      hasUrl: !!config.supabase.url,
      hasServiceKey: !!config.supabase.serviceKey,
      availableEnvVars: Object.keys(process.env).filter(key => 
        key.includes('SUPABASE') || key.includes('DATABASE')
      )
    });
    throw error;
  }
}

// Lazy-loaded getter for the Supabase client
export const database = {
  getClient() {
    return initializeSupabase();
  },
  
  // Health check method
  async healthCheck() {
    try {
      const client = this.getClient();
      const { data, error } = await client.from('documents').select('count').limit(1);
      
      if (error) {
        throw error;
      }
      
      return { healthy: true, message: 'Database connection successful' };
    } catch (error) {
      errorLogger.error('Database health check failed', error, {
        component: 'Database'
      });
      return { 
        healthy: false, 
        message: error.message,
        error: error.message 
      };
    }
  }
};

// Export the lazy-loaded client for backward compatibility
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = initializeSupabase();
    return client[prop];
  }
});