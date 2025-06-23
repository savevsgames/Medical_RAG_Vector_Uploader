import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

// ✅ JWT OPTIMIZATION: Cache for decoded tokens to avoid re-decoding
const tokenCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// ✅ JWT OPTIMIZATION: Helper to clean expired cache entries
function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (now > data.expiresAt) {
      tokenCache.delete(token);
    }
  }
}

// ✅ JWT OPTIMIZATION: Clean cache every 10 minutes
setInterval(cleanExpiredTokens, 10 * 60 * 1000);

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      errorLogger.warn('Missing or invalid Authorization header', {
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100),
        component: 'Auth'
      });
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // ✅ JWT OPTIMIZATION: Check cache first to avoid re-decoding
    const now = Date.now();
    const cached = tokenCache.get(token);
    
    if (cached && now < cached.expiresAt) {
      // Use cached decoded token
      req.userId = cached.userId;
      req.userEmail = cached.userEmail;
      req.userRole = cached.userRole;
      
      // ✅ REDUCED LOGGING: Only log cache hits in debug mode
      if (process.env.NODE_ENV === 'development') {
        errorLogger.debug('JWT cache hit', {
          userId: cached.userId,
          component: 'Auth'
        });
      }
      
      return next();
    }

    // ✅ JWT OPTIMIZATION: Decode and validate token only if not cached
    let decoded;
    try {
      decoded = jwt.verify(token, config.supabase.jwtSecret);
    } catch (jwtError) {
      // ✅ REDUCED LOGGING: Don't log full JWT errors, just the type
      errorLogger.warn('JWT verification failed', {
        error: jwtError.name, // Only log error type, not full message
        ip: req.ip,
        component: 'Auth'
      });
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
      } else {
        return res.status(401).json({ error: 'Token verification failed' });
      }
    }

    // ✅ JWT OPTIMIZATION: Extract user info once
    const userId = decoded.sub;
    const userEmail = decoded.email;
    const userRole = decoded.role;

    if (!userId) {
      errorLogger.warn('Token missing user ID', {
        hasEmail: !!userEmail,
        hasRole: !!userRole,
        component: 'Auth'
      });
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    if (userRole !== 'authenticated') {
      errorLogger.warn('Invalid user role', {
        userId,
        role: userRole,
        component: 'Auth'
      });
      return res.status(401).json({ error: 'Insufficient permissions' });
    }

    // ✅ JWT OPTIMIZATION: Cache the decoded token for future requests
    const tokenExp = decoded.exp ? decoded.exp * 1000 : now + CACHE_TTL; // Use token exp or default TTL
    const cacheExpiresAt = Math.min(tokenExp, now + CACHE_TTL); // Don't cache longer than TTL
    
    tokenCache.set(token, {
      userId,
      userEmail,
      userRole,
      expiresAt: cacheExpiresAt
    });

    // ✅ REDUCED LOGGING: Only log successful auth in debug mode or for new tokens
    if (process.env.NODE_ENV === 'development' || !cached) {
      errorLogger.info('JWT verification successful', {
        userId,
        userEmail,
        cached: !!cached,
        component: 'Auth'
      });
    }

    // Set user info on request object
    req.userId = userId;
    req.userEmail = userEmail;
    req.userRole = userRole;

    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown auth error';
    
    errorLogger.error('Authentication middleware error', {
      error: errorMessage,
      ip: req.ip,
      component: 'Auth'
    });

    res.status(500).json({ 
      error: 'Authentication failed',
      details: errorMessage
    });
  }
};

// ✅ JWT OPTIMIZATION: Export cache stats for monitoring
export const getAuthCacheStats = () => {
  return {
    cacheSize: tokenCache.size,
    cacheEntries: Array.from(tokenCache.entries()).map(([token, data]) => ({
      tokenPreview: token.substring(0, 20) + '...',
      userId: data.userId,
      expiresAt: new Date(data.expiresAt).toISOString(),
      expiresIn: Math.max(0, data.expiresAt - Date.now())
    }))
  };
};

// ✅ JWT OPTIMIZATION: Export cache clear function for testing
export const clearAuthCache = () => {
  tokenCache.clear();
  errorLogger.info('JWT cache cleared', { component: 'Auth' });
};