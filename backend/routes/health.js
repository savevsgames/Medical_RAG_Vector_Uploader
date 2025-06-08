import express from 'express';
import axios from 'axios';
import { config } from '../config/environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

const router = express.Router();

// Health check endpoint with comprehensive status
router.get('/', async (req, res) => {
  // REDUCED LOGGING: Don't log every health check
  const services = {
    supabase_connected: true,
    openai_configured: !!config.openai.apiKey,
    runpod_configured: !!config.runpod.url
  };

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

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services
  });
});

export { router as healthRouter };