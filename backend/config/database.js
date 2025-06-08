import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../agent_utils/errorLogger.js';

class DatabaseService {
  constructor() {
    this.client = null;
    this.initialize();
  }

  initialize() {
    try {
      this.client = createClient(
        config.supabase.url,
        config.supabase.key
      );

      // Test connection
      this.testConnection();
      
      errorLogger.success('Supabase client initialized');
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error);
      process.exit(1);
    }
  }

  async testConnection() {
    try {
      const { data, error } = await this.client.from('documents').select('count').limit(1);
      if (error) throw error;
      errorLogger.connectionCheck('Supabase', true, { test_query: 'success' });
    } catch (error) {
      errorLogger.connectionCheck('Supabase', false, { error: error.message });
    }
  }

  getClient() {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }
    return this.client;
  }
}

export const database = new DatabaseService();
export const supabase = database.getClient();