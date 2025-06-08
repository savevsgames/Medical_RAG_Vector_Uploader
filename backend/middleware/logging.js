import { errorLogger } from '../agent_utils/errorLogger.js';

// REDUCED REQUEST LOGGING - Only log non-status requests and errors
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const isStatusRequest = req.path.includes('/status');
  
  // Only log non-status requests to reduce spam
  if (!isStatusRequest) {
    errorLogger.info('Incoming request', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      user_agent: req.get('User-Agent')?.substring(0, 100),
      content_type: req.get('Content-Type'),
      content_length: req.get('Content-Length'),
      origin: req.get('Origin')
    });
  }

  // Log response when finished - only for non-status or errors
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    
    // Only log status requests if they error, or log all non-status requests
    if (!isStatusRequest || isError) {
      const level = isError ? 'error' : 'info';
      
      errorLogger[level]('Request completed', {
        method: req.method,
        path: req.originalUrl,
        status_code: res.statusCode,
        duration_ms: duration,
        user_id: req.userId || 'anonymous'
      });
    }
  });

  next();
};