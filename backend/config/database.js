import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';

class Database {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  initialize() {
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

      this.initialized = true;
      return { success: true, message: 'Database client initialized' };
    } catch (error) {
      this.initialized = false;
      throw new Error(`Failed to initialize database: ${error.message}`);
    }
  }

  async healthCheck() {
    if (!this.client) {
      return { 
        healthy: false, 
        message: 'Database client not initialized' 
      };
    }

    try {
      const { data, error } = await this.client
        .from('documents')
        .select('count')
        .limit(1);

      if (error) {
        return { 
          healthy: false, 
          message: `Database connection failed: ${error.message}` 
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

  isInitialized() {
    return this.initialized;
  }

  getClient() {
    if (!this.client) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.client;
  }
}

// ✅ CRITICAL FIX: Instantiate and immediately initialize
export const database = new Database();
database.initialize(); // ✅ Make sure the client is ready

// ✅ CRITICAL FIX: Export the real client, not a function
export const supabase = database.getClient(); // ✅ Real client, not a function