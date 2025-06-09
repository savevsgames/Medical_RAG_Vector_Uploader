import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

class Database {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized && this.client) {
      errorLogger.info('Database already initialized, returning existing client', {
        component: 'Database'
      });
      return this.client;
    }

    try {
      errorLogger.info('Initializing Supabase client with service role', {
        url: config.supabase.url,
        has_service_key: !!config.supabase.serviceKey,
        service_key_length: config.supabase.serviceKey?.length || 0,
        component: 'Database'
      });

      this.client = createClient(
        config.supabase.url,
        config.supabase.serviceKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );

      this.initialized = true;

      errorLogger.success('Supabase client initialized with service_role', {
        url: config.supabase.url,
        auth_mode: 'service_role',
        component: 'Database'
      });

      return this.client;
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error, {
        component: 'Database'
      });
      throw error;
    }
  }

  getClient() {
    if (!this.initialized || !this.client) {
      errorLogger.warn('Database not initialized, calling initialize()', {
        component: 'Database'
      });
      return this.initialize();
    }
    return this.client;
  }

  isInitialized() {
    return this.initialized && !!this.client;
  }

  async healthCheck() {
    try {
      if (!this.client) {
        return {
          healthy: false,
          message: 'Database client not initialized'
        };
      }

      // Simple query to test connection
      const { data, error } = await this.client
        .from('documents')
        .select('count')
        .limit(1);

      if (error) {
        return {
          healthy: false,
          message: `Database connection failed: ${error.message}`,
          error: error
        };
      }

      return {
        healthy: true,
        message: 'Database connection successful',
        auth_role: 'service_role'
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Database health check failed: ${error.message}`,
        error: error
      };
    }
  }
}

// Create singleton instance
const database = new Database();

// CRITICAL FIX: Export both the database instance AND the initialized client
// This ensures we have access to both the management methods and the client itself
let supabase = null;

// Initialize the client immediately when this module is imported
try {
  supabase = database.initialize();
  errorLogger.info('Supabase client exported successfully', {
    hasClient: !!supabase,
    hasFromMethod: typeof supabase?.from === 'function',
    component: 'Database'
  });
} catch (error) {
  errorLogger.error('Failed to initialize Supabase client during module import', error, {
    component: 'Database'
  });
}

export { database, supabase };