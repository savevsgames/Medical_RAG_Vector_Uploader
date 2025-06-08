// Simplified agent middleware
import { errorLogger } from '../shared/logger.js';
import { RATE_LIMITS } from '../shared/constants.js';

class AgentMiddleware {
  constructor() {
    this.requests = new Map();
  }

  logRequest(req, res, next) {
    const startTime = Date.now();
    const isStatusRequest = req.path.includes('/status');
    
    if (!isStatusRequest) {
      errorLogger.info('Agent request received', {
        user_id: req.userId,
        method: req.method,
        path: req.path,
        ip: req.ip
      });
    }

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const isError = res.statusCode >= 400;
      
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

  rateLimit(maxRequests = RATE_LIMITS.AGENT_REQUESTS_PER_MINUTE, windowMs = RATE_LIMITS.WINDOW_MS) {
    return (req, res, next) => {
      const userId = req.userId;
      const now = Date.now();
      const userRequests = this.requests.get(userId) || [];
      
      const validRequests = userRequests.filter(time => now - time < windowMs);
      
      if (validRequests.length >= maxRequests) {
        errorLogger.warn('Agent rate limit exceeded', {
          user_id: userId,
          requests_count: validRequests.length,
          max_requests: maxRequests
        });
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retry_after: Math.ceil(windowMs / 1000)
        });
      }
      
      validRequests.push(now);
      this.requests.set(userId, validRequests);
      next();
    };
  }

  deprecationWarning(endpoint) {
    return (req, res, next) => {
      errorLogger.warn(`Legacy ${endpoint} endpoint used`, {
        user_id: req.userId,
        path: req.path,
        ip: req.ip
      });
      
      res.setHeader('X-Deprecated', 'true');
      res.setHeader('X-Deprecation-Message', `Use /api/${endpoint} instead`);
      next();
    };
  }
}

export const agentMiddleware = new AgentMiddleware();