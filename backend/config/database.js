import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

// Internal client variable
let supabaseClient = null;
let isInitialized = false;

// Database service object
export const database = {
  // Initialize the client (called during server startup)
  initialize() {
    try {
      if (!config.supabase.url || !config.supabase.serviceKey) {
        throw new Error('Supabase configuration is missing. Please check SUPABASE_URL and SUPABASE_KEY environment variables.');
      }

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

      isInitialized = true;
      errorLogger.success('Supabase client initialized successfully');
      return supabaseClient;
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error);
      throw error;
    }
  },

  // Get the client (throws if not initialized)
  getClient() {
    if (!isInitialized || !supabaseClient) {
      throw new Error('Database client not initialized. Call database.initialize() first.');
    }
    return supabaseClient;
  },

  // Check if client is initialized
  isInitialized() {
    return isInitialized && !!supabaseClient;
  },

  // Health check
  async healthCheck() {
    try {
      if (!this.isInitialized()) {
        return { healthy: false, message: 'Database client not initialized' };
      }

      // Simple query to test connection
      const { data, error } = await supabaseClient
        .from('documents')
        .select('count')
        .limit(1);

      if (error) {
        return { healthy: false, message: error.message };
      }

      return { healthy: true, message: 'Database connection successful' };
    } catch (error) {
      return { 
        healthy: false, 
        message: error instanceof Error ? error.message : 'Unknown database error' 
      };
    }
  }
};

// Export the client through a proxy for backward compatibility
export const supabase = new Proxy({}, {
  get(target, prop) {
    if (!isInitialized || !supabaseClient) {
      throw new Error('Database client not initialized. Call database.initialize() first.');
    }
    return supabaseClient[prop];
  }
});