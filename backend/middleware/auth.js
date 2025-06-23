import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      errorLogger.warn('Missing or invalid Authorization header', {
        hasAuthHeader: !!authHeader,
        authHeaderFormat: authHeader ? authHeader.substring(0, 10) + '...' : 'none',
        component: 'AuthMiddleware'
      });
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.split(' ')[1];
    
    // ✅ SECURITY FIX: Reduce JWT logging - only log presence and basic info
    errorLogger.debug('Token validation attempt', {
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      tokenPrefix: token ? token.substring(0, 10) + '...' : 'none', // ✅ Only log first 10 chars
      component: 'AuthMiddleware'
    });

    const decoded = jwt.verify(token, config.supabase.jwtSecret);
    
    // ✅ SECURITY FIX: Reduce sensitive data logging
    errorLogger.debug('Token validation successful', {
      userId: decoded.sub,
      userRole: decoded.role,
      hasEmail: !!decoded.email,
      tokenExp: decoded.exp,
      component: 'AuthMiddleware'
      // ✅ REMOVED: Full decoded payload logging
    });

    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    req.userRole = decoded.role;
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    // ✅ SECURITY FIX: Reduce error logging verbosity
    errorLogger.error('Token validation failed', {
      errorType: error.name,
      errorMessage: error.message,
      hasAuthHeader: !!req.headers.authorization,
      component: 'AuthMiddleware'
      // ✅ REMOVED: Full error stack and token details
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    } else {
      return res.status(401).json({ error: 'Token verification failed' });
    }
  }
};