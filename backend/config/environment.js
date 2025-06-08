import dotenv from 'dotenv';
import { errorLogger } from '../agent_utils/shared/logger.js';

// Load environment variables
dotenv.config();

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT) || 8000,
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

  // Logging configuration
  logging: {
    debug: process.env.BACKEND_DEBUG_LOGGING === 'true'
  }
};

export function validateConfig() {
  const required = [
    { key: 'SUPABASE_URL', value: config.supabase.url },
    { key: 'SUPABASE_KEY', value: config.supabase.serviceKey },
    { key: 'SUPABASE_JWT_SECRET', value: config.supabase.jwtSecret }
  ];

  const missing = required.filter(({ value }) => !value);
  
  if (missing.length > 0) {
    const missingKeys = missing.map(({ key }) => key).join(', ');
    throw new Error(`Missing required environment variables: ${missingKeys}`);
  }

  // Log configuration status
  errorLogger.info('Configuration loaded', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    supabase_configured: !!config.supabase.url,
    openai_configured: !!config.openai.apiKey,
    runpod_configured: !!config.runpod.url,
    debug_logging: config.logging.debug
  });
}