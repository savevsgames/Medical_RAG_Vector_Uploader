import express from 'express';
import axios from 'axios';
import { config } from '../config/environment.js';
import { database } from '../config/database.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

const router = express.Router();

// Health check endpoint with comprehensive status
router.get('/', async (req, res) => {
  const services = {
    server: true,
    database: false,
    supabase_configured: !!config.supabase.url && !!config.supabase.serviceKey,
    openai_configured: !!config.openai.apiKey,
    runpod_configured: !!config.runpod.url
  };

  // Test database connection
  try {
    const dbHealth = await database.healthCheck();
    services.database = dbHealth.healthy;
    if (!dbHealth.healthy) {
      services.database_error = dbHealth.message;
    }
  } catch (error) {
    services.database = false;
    services.database_error = error.message;
    errorLogger.error('Health check database test failed', error);
  }

  // Test RunPod connection if configured
  if (services.runpod_configured) {
    try {
      // FIXED: Ensure clean URL without trailing slashes
      const healthUrl = `${config.runpod.url.replace(/\/+$/, '')}/health`;
      
      const response = await axios.get(
        healthUrl,
        { 
          timeout: 5000
        }
      );
      services.runpod_health = response.data;
      errorLogger.connectionCheck('RunPod Health', true, response.data);
    } catch (error) {
      services.runpod_health = 'unavailable';
      errorLogger.connectionCheck('RunPod Health', false, { error: error.message });
    }
  }

  // Determine overall health status
  const isHealthy = services.server && services.database && services.supabase_configured;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services,
    environment: {
      node_env: config.nodeEnv,
      port: config.port
    }
  });
});

export { router as healthRouter };