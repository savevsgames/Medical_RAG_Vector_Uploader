import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { errorLogger } from '../agent_utils/errorLogger.js';

// Enhanced JWT verification middleware with detailed logging
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  errorLogger.debug('JWT verification attempt', {
    has_auth_header: !!authHeader,
    auth_header_format: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
    ip: req.ip,
    path: req.path,
    method: req.method
  });
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    errorLogger.warn('Authentication failed - no token provided', {
      ip: req.ip,
      path: req.path,
      user_agent: req.get('User-Agent')?.substring(0, 100),
      auth_header_present: !!authHeader,
      auth_header_format: authHeader ? authHeader.substring(0, 20) + '...' : 'none'
    });
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  errorLogger.debug('Attempting JWT decode', {
    token_length: token.length,
    token_preview: token.substring(0, 20) + '...',
    jwt_secret_available: !!config.supabase.jwtSecret,
    jwt_secret_length: config.supabase.jwtSecret?.length || 0
  });
  
  try {
    const decoded = jwt.verify(token, config.supabase.jwtSecret);
    req.userId = decoded.sub;
    
    // REDUCED LOGGING: Only log authentication for non-status requests
    if (!req.path.includes('/status')) {
      errorLogger.info('User authenticated', {
        user_id: req.userId,
        path: req.path,
        method: req.method,
        token_exp: decoded.exp,
        token_iat: decoded.iat,
        token_role: decoded.role,
        token_email: decoded.email
      });
    }
    
    next();
  } catch (error) {
    errorLogger.warn('Authentication failed - invalid token', {
      ip: req.ip,
      path: req.path,
      error: error.message,
      error_name: error.name,
      token_preview: token.substring(0, 20) + '...',
      jwt_secret_preview: config.supabase.jwtSecret?.substring(0, 10) + '...'
    });
    return res.status(401).json({ error: 'Invalid token' });
  }
};