import { errorLogger } from '../agent_utils/shared/logger.js';

export function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Skip logging for health checks to reduce noise
  if (req.path === '/health') {
    return next();
  }

  const userEmail = req.user?.email || req.userId || 'anonymous';
  
  errorLogger.info('Request received', {
    method: req.method,
    path: req.path,
    user: userEmail,
    ip: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    component: 'RequestLogger'
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    
    errorLogger[logLevel]('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      user: userEmail,
      component: 'RequestLogger'
    });
  });

  next();
}