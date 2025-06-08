// Agent-specific middleware
// Handles RunPod configuration validation and agent authentication

import { errorLogger } from './errorLogger.js';

class AgentMiddleware {
  // Validate RunPod configuration
  validateRunPodConfig(req, res, next) {
    const { RUNPOD_EMBEDDING_URL, RUNPOD_EMBEDDING_KEY } = process.env;
    
    if (!RUNPOD_EMBEDDING_URL || !RUNPOD_EMBEDDING_KEY) {
      errorLogger.warn('RunPod configuration missing', {
        user_id: req.userId,
        endpoint: req.path,
        has_url: !!RUNPOD_EMBEDDING_URL,
        has_key: !!RUNPOD_EMBEDDING_KEY
      });
      
      return res.status(503).json({ 
        error: 'RunPod TxAgent service not configured',
        details: 'Missing RUNPOD_EMBEDDING_URL or RUNPOD_EMBEDDING_KEY'
      });
    }
    
    req.runpodConfig = {
      url: RUNPOD_EMBEDDING_URL,
      key: RUNPOD_EMBEDDING_KEY
    };
    
    next();
  }

  // Enhanced request logging for agent operations - REDUCED LOGGING
  logAgentRequest(req, res, next) {
    const startTime = Date.now();
    
    // ONLY log non-status requests to reduce spam
    if (!req.path.includes('/status')) {
      errorLogger.info('Agent request received', {
        user_id: req.userId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        user_agent: req.get('User-Agent')
      });
    }

    // Log response when finished - ONLY for non-status or errors
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const isStatusRequest = req.path.includes('/status');
      const isError = res.statusCode >= 400;
      
      // Only log status requests if they error, or log all non-status requests
      if (!isStatusRequest || isError) {
        const level = isError ? 'error' : 'info';
        
        errorLogger[level]('Agent request completed', {
          user_id: req.userId,
          method: req.method,
          path: req.path,
          status_code: res.statusCode,
          duration_ms: duration
        });
      }
    });

    next();
  }

  // Validate request body for agent operations
  validateAgentRequest(requiredFields = []) {
    return (req, res, next) => {
      const missing = requiredFields.filter(field => !req.body[field]);
      
      if (missing.length > 0) {
        errorLogger.warn('Invalid agent request - missing fields', {
          user_id: req.userId,
          missing_fields: missing,
          received_fields: Object.keys(req.body)
        });
        
        return res.status(400).json({
          error: 'Missing required fields',
          missing_fields: missing
        });
      }
      
      next();
    };
  }

  // Rate limiting for agent operations (simple implementation)
  rateLimitAgent(maxRequests = 10, windowMs = 60000) {
    const requests = new Map();
    
    return (req, res, next) => {
      const userId = req.userId;
      const now = Date.now();
      const userRequests = requests.get(userId) || [];
      
      // Clean old requests
      const validRequests = userRequests.filter(time => now - time < windowMs);
      
      if (validRequests.length >= maxRequests) {
        errorLogger.warn('Agent rate limit exceeded', {
          user_id: userId,
          requests_count: validRequests.length,
          max_requests: maxRequests,
          window_ms: windowMs
        });
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retry_after: Math.ceil(windowMs / 1000)
        });
      }
      
      validRequests.push(now);
      requests.set(userId, validRequests);
      
      next();
    };
  }
}

export const agentMiddleware = new AgentMiddleware();