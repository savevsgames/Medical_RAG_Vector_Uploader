import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnvironmentConfig {
  constructor() {
    this.loadEnvironmentVariables();
    this.validateRequiredVariables();
  }

  loadEnvironmentVariables() {
    // Try to load .env from multiple locations
    const envPaths = [
      path.join(__dirname, '..', '.env'),           // backend/.env
      path.join(__dirname, '..', '..', '.env'),     // root/.env
      path.join(process.cwd(), '.env'),             // current working directory
      path.join(process.cwd(), 'backend', '.env')   // if running from root
    ];

    let envLoaded = false;
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        console.log(`🔧 Loading environment variables from: ${envPath}`);
        dotenv.config({ path: envPath });
        envLoaded = true;
        break;
      }
    }

    if (!envLoaded) {
      console.log('⚠️  No .env file found, using system environment variables');
    }
  }

  validateRequiredVariables() {
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_KEY', 
      'SUPABASE_JWT_SECRET'
    ];

    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingEnvVars.length > 0) {
      console.error('\n❌ CRITICAL ERROR: Missing required environment variables:');
      missingEnvVars.forEach(varName => {
        console.error(`   - ${varName}`);
      });
      console.error('\n📝 Please update your backend/.env file with the correct Supabase credentials.');
      console.error('   You can find these in your Supabase project dashboard under Settings > API');
      console.error('\n🔧 Required format:');
      console.error('   SUPABASE_URL=https://your-project.supabase.co');
      console.error('   SUPABASE_KEY=your_service_role_key_here');
      console.error('   SUPABASE_JWT_SECRET=your_jwt_secret_here\n');
      
      process.exit(1);
    }
  }

  get port() {
    return process.env.PORT || 8000;
  }

  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  }

  get isDevelopment() {
    return this.nodeEnv === 'development';
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get supabase() {
    return {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_KEY,
      jwtSecret: process.env.SUPABASE_JWT_SECRET
    };
  }

  get runpod() {
    return {
      url: process.env.RUNPOD_EMBEDDING_URL,
      key: process.env.RUNPOD_EMBEDDING_KEY
    };
  }

  get openai() {
    return {
      apiKey: process.env.OPENAI_API_KEY
    };
  }

  get debugLogging() {
    return process.env.BACKEND_DEBUG_LOGGING === 'true';
  }
}

export const config = new EnvironmentConfig();