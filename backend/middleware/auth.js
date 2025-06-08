import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

export async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      errorLogger.warn('Missing or invalid authorization header', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        component: 'Auth'
      });
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, config.supabase.jwtSecret);
      req.userId = decoded.sub;
      req.user = decoded;
      
      errorLogger.debug('Token verified successfully', {
        userId: decoded.sub,
        path: req.path,
        component: 'Auth'
      });
      
      next();
    } catch (jwtError) {
      errorLogger.warn('JWT verification failed', {
        error: jwtError.message,
        path: req.path,
        method: req.method,
        ip: req.ip,
        component: 'Auth'
      });
      
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        details: jwtError.message 
      });
    }
  } catch (error) {
    errorLogger.error('Authentication middleware error', error, {
      path: req.path,
      method: req.method,
      ip: req.ip,
      component: 'Auth'
    });
    
    res.status(500).json({ 
      error: 'Authentication error',
      details: error.message 
    });
  }
}