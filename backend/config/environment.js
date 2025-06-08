import dotenv from 'dotenv';
import { errorLogger } from '../agent_utils/shared/logger.js';

// Load environment variables from .env file if it exists
try {
  dotenv.config();
  errorLogger.info('Environment variables loaded from .env file');
} catch (error) {
  errorLogger.warn('No .env file found, using system environment variables');
}

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',

  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_KEY, // Service role key for backend operations
    jwtSecret: process.env.SUPABASE_JWT_SECRET
  },

  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },

  // RunPod configuration
  runpod: {
    url: process.env.RUNPOD_EMBEDDING_URL,
    apiKey: process.env.RUNPOD_EMBEDDING_KEY
  },

  // Debug configuration
  debug: {
    logging: process.env.BACKEND_DEBUG_LOGGING === 'true'
  }
};

// Validation function for critical configuration
export function validateConfig() {
  const errors = [];

  // Check critical environment variables
  if (!config.supabase.url) {
    errors.push('SUPABASE_URL is required');
  }

  if (!config.supabase.serviceKey) {
    errors.push('SUPABASE_KEY (service role key) is required');
  }

  if (!config.supabase.jwtSecret) {
    errors.push('SUPABASE_JWT_SECRET is required');
  }

  // Validate URL formats
  if (config.supabase.url && !config.supabase.url.startsWith('https://')) {
    errors.push('SUPABASE_URL must be a valid HTTPS URL');
  }

  if (config.runpod.url && !config.runpod.url.startsWith('https://')) {
    errors.push('RUNPOD_EMBEDDING_URL must be a valid HTTPS URL');
  }

  // Validate port
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    errors.push('PORT must be a valid port number between 1 and 65535');
  }

  if (errors.length > 0) {
    const errorMessage = `Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;
    throw new Error(errorMessage);
  }

  // Log configuration status (without sensitive values)
  errorLogger.info('Configuration validated', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    supabase_configured: !!config.supabase.url && !!config.supabase.serviceKey,
    openai_configured: !!config.openai.apiKey,
    runpod_configured: !!config.runpod.url,
    debug_logging: config.debug.logging
  });
}