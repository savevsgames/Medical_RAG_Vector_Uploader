import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server configuration
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY, // ✅ ADD: Anon key for user-authenticated operations
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  },

  // RunPod configuration
  runpod: {
    url: process.env.RUNPOD_EMBEDDING_URL,
    key: process.env.RUNPOD_EMBEDDING_KEY,
  },

  // TxAgent configuration
  txagent: {
    containerUrl: process.env.TXAGENT_CONTAINER_URL,
    timeout: parseInt(process.env.TXAGENT_TIMEOUT) || 120000, // ✅ UPDATED: Default 2 minutes
  },

  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  // ElevenLabs configuration (Phase 2)
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'default',
  },

  // Feature flags
  features: {
    emergencyDetection: process.env.ENABLE_EMERGENCY_DETECTION === 'true',
    medicalDisclaimer: process.env.MEDICAL_DISCLAIMER_REQUIRED === 'true',
    voiceGeneration: process.env.ENABLE_VOICE_GENERATION === 'true',
    symptomTracking: process.env.ENABLE_SYMPTOM_TRACKING === 'true',
    treatmentRecommendations: process.env.ENABLE_TREATMENT_RECOMMENDATIONS === 'true',
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    debugBackend: process.env.BACKEND_DEBUG_LOGGING === 'true',
  },
};

export function validateConfig() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_ANON_KEY', // ✅ ADD: Validate anon key
    'SUPABASE_JWT_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate URLs
  if (config.supabase.url && !config.supabase.url.startsWith('https://')) {
    throw new Error('SUPABASE_URL must be a valid HTTPS URL');
  }

  if (config.runpod.url && !config.runpod.url.startsWith('https://')) {
    throw new Error('RUNPOD_EMBEDDING_URL must be a valid HTTPS URL');
  }

  // Validate timeout
  if (config.txagent.timeout < 10000) {
    throw new Error('TXAGENT_TIMEOUT must be at least 10000ms (10 seconds)');
  }
}