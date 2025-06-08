import dotenv from 'dotenv';
import { errorLogger } from '../agent_utils/shared/logger.js';

// Load environment variables
dotenv.config();

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',

  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_KEY,
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

// Configuration validation function
export function validateConfig() {
  const errors = [];

  // Required environment variables
  const required = [
    { key: 'SUPABASE_URL', value: config.supabase.url },
    { key: 'SUPABASE_KEY', value: config.supabase.serviceKey },
    { key: 'SUPABASE_JWT_SECRET', value: config.supabase.jwtSecret }
  ];

  for (const { key, value } of required) {
    if (!value) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Optional but recommended
  const recommended = [
    { key: 'OPENAI_API_KEY', value: config.openai.apiKey, service: 'OpenAI chat' },
    { key: 'RUNPOD_EMBEDDING_URL', value: config.runpod.url, service: 'RunPod embeddings' }
  ];

  for (const { key, value, service } of recommended) {
    if (!value) {
      errorLogger.warn(`Missing optional environment variable: ${key} (${service} will not be available)`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}

// Log configuration status (without sensitive values)
if (config.debug.logging) {
  errorLogger.info('Configuration loaded', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    supabase_configured: !!config.supabase.url && !!config.supabase.serviceKey,
    openai_configured: !!config.openai.apiKey,
    runpod_configured: !!config.runpod.url,
    debug_logging: config.debug.logging
  });
}