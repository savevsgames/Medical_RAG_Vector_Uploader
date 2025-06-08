// Centralized Supabase client management for agents
import { createClient } from '@supabase/supabase-js';
import { errorLogger } from './logger.js';
import { createAuthError } from './errors.js';

class SupabaseClientManager {
  constructor() {
    this.serviceClient = null;
    this.initialize();
  }

  initialize() {
    try {
      this.serviceClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
      );
      errorLogger.success('Supabase service client initialized');
    } catch (error) {
      errorLogger.error('Failed to initialize Supabase client', error);
      throw error;
    }
  }

  getServiceClient() {
    if (!this.serviceClient) {
      throw new Error('Supabase service client not initialized');
    }
    return this.serviceClient;
  }

  createUserClient(userJWT) {
    if (!userJWT) {
      throw createAuthError('user client creation');
    }

    const token = userJWT.startsWith('Bearer ') ? userJWT.substring(7) : userJWT;

    return createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );
  }

  async testConnection() {
    try {
      const { data, error } = await this.serviceClient.from('documents').select('count').limit(1);
      if (error) throw error;
      errorLogger.connectionCheck('Supabase', true, { test_query: 'success' });
      return true;
    } catch (error) {
      errorLogger.connectionCheck('Supabase', false, { error: error.message });
      return false;
    }
  }
}

export const supabaseManager = new SupabaseClientManager();