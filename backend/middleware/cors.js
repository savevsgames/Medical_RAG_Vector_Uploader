import cors from 'cors';
import { errorLogger } from '../agent_utils/errorLogger.js';

// Enhanced CORS configuration for production deployment
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://medical-rag-vector-uploader-1.onrender.com',
      'https://medical-rag-vector-uploader.onrender.com',
      'https://medical-rag-vector-uploader.vercel.app',
      'https://medical-rag-vector-uploader.netlify.app'
    ];
    
    // Allow any subdomain of the main domains
    const allowedDomainPatterns = [
      /^https:\/\/.*\.onrender\.com$/,
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.netlify\.app$/,
      /^https:\/\/.*\.webcontainer-api\.io$/  // Add WebContainer pattern
    ];
    
    // Check exact matches
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check pattern matches
    for (const pattern of allowedDomainPatterns) {
      if (pattern.test(origin)) {
        return callback(null, true);
      }
    }
    
    // Log rejected origins for debugging
    errorLogger.warn('CORS origin rejected', { origin });
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-HTTP-Method-Override'
  ],
  exposedHeaders: ['X-Deprecated', 'X-Deprecation-Message'],
  maxAge: 86400 // 24 hours
};

export const corsMiddleware = cors(corsOptions);

// Add explicit OPTIONS handler for preflight requests
export const optionsHandler = cors(corsOptions);