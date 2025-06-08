import { errorLogger } from '../agent_utils/shared/logger.js';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://medical-rag-vector-uploader.onrender.com',
  'https://medical-rag-vector-uploader.netlify.app'
];

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests with no origin (like mobile apps or curl requests)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    errorLogger.debug('CORS preflight request', {
      origin,
      method: req.method,
      path: req.path,
      component: 'CORS'
    });
    return res.status(200).end();
  }
  
  next();
};

export const optionsHandler = (req, res) => {
  res.status(200).end();
};