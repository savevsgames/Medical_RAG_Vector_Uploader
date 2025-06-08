import { createClient } from '@supabase/supabase-js';
import { config } from './environment.js';
import { errorLogger } from '../../agent_utils/shared/logger.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

// Test database connection
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('count', { count: 'exact', head: true });
    
    if (error) throw error;
    
    errorLogger.success('Database connection verified');
    return true;
  } catch (error) {
    errorLogger.error('Database connection failed', error);
    throw error;
  }
}

export const database = {
  getClient: () => supabase,
  testConnection
};

export { supabase };