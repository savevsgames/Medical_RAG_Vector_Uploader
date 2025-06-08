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
      if (!config.supabase.url || !config.supabase.serviceKey) {
        throw new Error('Supabase configuration missing');
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

      this.initialized = true;
      errorLogger.success('Supabase client initialized successfully');
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error);
      throw error;
    }
  }

  getClient() {
    if (!this.initialized || !this.client) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.client;
  }

  isInitialized() {
    return this.initialized && this.client !== null;
  }

  async healthCheck() {
    try {
      if (!this.isInitialized()) {
        return { healthy: false, message: 'Database not initialized' };
      }

      // Simple health check - try to query a system table
      const { data, error } = await this.client
        .from('documents')
        .select('count')
        .limit(1);

      if (error) {
        return { 
          healthy: false, 
          message: `Database query failed: ${error.message}` 
        };
      }

      return { healthy: true, message: 'Database connection successful' };
    } catch (error) {
      return { 
        healthy: false, 
        message: `Database health check failed: ${error.message}` 
      };
    }
  }
}

// Create singleton instance
export const database = new Database();

// Export the client getter for backward compatibility
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = database.getClient();
    return client[prop];
  }
});