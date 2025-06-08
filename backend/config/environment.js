import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file if it exists
try {
  dotenv.config({ path: join(__dirname, '../.env') });
  console.log('✅ Loaded .env file');
} catch (error) {
  console.log('⚠️  No .env file found, using system environment variables');
}

// Helper function to get environment variable with fallbacks
function getEnvVar(primary, fallbacks = [], required = false) {
  let value = process.env[primary];
  
  if (!value) {
    for (const fallback of fallbacks) {
      value = process.env[fallback];
      if (value) break;
    }
  }
  
  if (required && !value) {
    const allKeys = [primary, ...fallbacks];
    throw new Error(`Required environment variable not found. Tried: ${allKeys.join(', ')}`);
  }
  
  return value;
}

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  
  // Supabase configuration
  supabase: {
    url: getEnvVar('SUPABASE_URL'),
    serviceKey: getEnvVar('SUPABASE_KEY', ['SUPABASE_SERVICE_ROLE_KEY']),
    jwtSecret: getEnvVar('SUPABASE_JWT_SECRET', ['JWT_SECRET']),
    anonKey: getEnvVar('SUPABASE_ANON_KEY')
  },
  
  // RunPod configuration
  runpod: {
    url: getEnvVar('RUNPOD_EMBEDDING_URL'),
    apiKey: getEnvVar('RUNPOD_EMBEDDING_KEY', ['RUNPOD_API_KEY'])
  },
  
  // OpenAI configuration
  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY')
  },
  
  // Logging configuration
  logging: {
    debug: process.env.BACKEND_DEBUG_LOGGING === 'true' || process.env.NODE_ENV === 'development'
  }
};

// Validate critical configuration on startup
export function validateConfig() {
  const errors = [];
  
  if (!config.supabase.url) {
    errors.push('SUPABASE_URL is required');
  }
  
  if (!config.supabase.serviceKey) {
    errors.push('SUPABASE_KEY (service role key) is required');
  }
  
  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(error => console.error(`   - ${error}`));
    console.error('\n📋 Available environment variables:');
    Object.keys(process.env)
      .filter(key => key.includes('SUPABASE') || key.includes('DATABASE') || key.includes('RUNPOD') || key.includes('OPENAI'))
      .forEach(key => console.error(`   - ${key}: ${process.env[key] ? '✅ Set' : '❌ Not set'}`));
    
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }
  
  console.log('✅ Configuration validation passed');
}

// Log configuration status (without sensitive values)
console.log('🔧 Environment Configuration:');
console.log(`   - Node Environment: ${config.nodeEnv}`);
console.log(`   - Port: ${config.port}`);
console.log(`   - Supabase URL: ${config.supabase.url ? '✅ Set' : '❌ Missing'}`);
console.log(`   - Supabase Service Key: ${config.supabase.serviceKey ? '✅ Set' : '❌ Missing'}`);
console.log(`   - Supabase JWT Secret: ${config.supabase.jwtSecret ? '✅ Set' : '❌ Missing'}`);
console.log(`   - RunPod URL: ${config.runpod.url ? '✅ Set' : '❌ Missing'}`);
console.log(`   - OpenAI API Key: ${config.openai.apiKey ? '✅ Set' : '❌ Missing'}`);
console.log(`   - Debug Logging: ${config.logging.debug ? '✅ Enabled' : '❌ Disabled'}`);