import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

class Database {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!config.supabase.url || !config.supabase.serviceKey) {
        throw new Error('Supabase configuration is missing');
      }

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

      errorLogger.success('Supabase client initialized successfully');
      this.initialized = true;
      return this.client;
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error);
      throw error;
    }
  }

  getClient() {
    if (!this.client) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.client;
  }

  isInitialized() {
    return this.initialized;
  }

  async healthCheck() {
    try {
      if (!this.client) {
        return {
          healthy: false,
          message: 'Database client not initialized'
        };
      }

      // Simple health check - try to query a system table
      const { data, error } = await this.client
        .from('documents')
        .select('count')
        .limit(1);

      if (error) {
        errorLogger.error('Database health check failed', error);
        return {
          healthy: false,
          message: error.message
        };
      }

      errorLogger.success('Database connection test passed');
      return {
        healthy: true,
        message: 'Database connection successful'
      };
    } catch (error) {
      errorLogger.error('Database health check error', error);
      return {
        healthy: false,
        message: error.message
      };
    }
  }
}

// Create singleton instance
const database = new Database();

// Export both the instance and the client getter for backward compatibility
export { database };
export const supabase = database.getClient.bind(database);