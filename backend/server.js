import express from 'express';
import cors from 'cors';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';

// CRITICAL: Load environment variables FIRST, before any other imports
// Check for .env file in multiple locations
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load .env from multiple locations
const envPaths = [
  path.join(__dirname, '.env'),           // backend/.env
  path.join(__dirname, '..', '.env'),     // root/.env
  path.join(process.cwd(), '.env'),       // current working directory
  path.join(process.cwd(), 'backend', '.env') // if running from root
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`🔧 Loading environment variables from: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('⚠️  No .env file found, using system environment variables');
}

// Import our services AFTER environment variables are loaded
import { DocumentProcessor } from './lib/documentProcessor.js';
import { EmbeddingService } from './lib/embedder.js';
import { ChatService } from './lib/chatService.js';

// Import agent utilities
import { mountAgentRoutes, errorLogger } from './agent_utils/index.js';
import { agentController } from './agent_utils/agentController.js';

const app = express();
const port = process.env.PORT || 8000;

// Enhanced startup logging
errorLogger.info('🚀 Medical RAG Server starting up...');
errorLogger.info('Environment check', {
  node_version: process.version,
  port: port,
  working_directory: __dirname
});

// Environment variable validation
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY', 
  'SUPABASE_JWT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  errorLogger.error('Missing required environment variables', null, {
    missing_variables: missingEnvVars,
    available_variables: Object.keys(process.env).filter(key => key.startsWith('SUPABASE')),
    env_file_exists: fs.existsSync(path.join(__dirname, '.env')),
    working_directory: __dirname,
    process_cwd: process.cwd(),
    all_env_keys_count: Object.keys(process.env).length
  });
  
  console.error('\n❌ CRITICAL ERROR: Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n📝 Please update your backend/.env file with the correct Supabase credentials.');
  console.error('   You can find these in your Supabase project dashboard under Settings > API');
  console.error('\n🔧 Required format:');
  console.error('   SUPABASE_URL=https://your-project.supabase.co');
  console.error('   SUPABASE_KEY=your_service_role_key_here');
  console.error('   SUPABASE_JWT_SECRET=your_jwt_secret_here\n');
  
  process.exit(1);
}

// Log environment variable status
errorLogger.info('Environment variables validated', {
  supabase_url_set: !!process.env.SUPABASE_URL,
  supabase_key_set: !!process.env.SUPABASE_KEY,
  jwt_secret_set: !!process.env.SUPABASE_JWT_SECRET,
  runpod_url_set: !!process.env.RUNPOD_EMBEDDING_URL,
  openai_key_set: !!process.env.OPENAI_API_KEY,
  supabase_url_preview: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 30) + '...' : 'not set'
});

// Diagnostic checks for file existence
errorLogger.info('=== DIAGNOSTIC CHECKS ===');
const libDir = path.join(__dirname, 'lib');
const agentUtilsDir = path.join(__dirname, 'agent_utils');

const requiredFiles = [
  { path: path.join(libDir, 'documentProcessor.js'), name: 'DocumentProcessor' },
  { path: path.join(libDir, 'embedder.js'), name: 'Embedder' },
  { path: path.join(libDir, 'chatService.js'), name: 'ChatService' },
  { path: agentUtilsDir, name: 'Agent Utils Directory' }
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file.path);
  errorLogger.connectionCheck(file.name, exists, { path: file.path });
});

if (fs.existsSync(libDir)) {
  const libContents = fs.readdirSync(libDir);
  errorLogger.info('Lib directory contents', { files: libContents });
}

if (fs.existsSync(agentUtilsDir)) {
  const agentContents = fs.readdirSync(agentUtilsDir);
  errorLogger.info('Agent utils directory contents', { files: agentContents });
}

errorLogger.info('=== END DIAGNOSTIC ===');

// Initialize services with error handling
let documentProcessor, embeddingService, supabase, chatService;

try {
  documentProcessor = new DocumentProcessor();
  errorLogger.success('DocumentProcessor initialized');
} catch (error) {
  errorLogger.error('Failed to initialize DocumentProcessor', error);
  process.exit(1);
}

try {
  embeddingService = new EmbeddingService();
  errorLogger.success('EmbeddingService initialized');
} catch (error) {
  errorLogger.error('Failed to initialize EmbeddingService', error);
  process.exit(1);
}

// Initialize Supabase client with connection verification
try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // Test Supabase connection
  const testConnection = async () => {
    try {
      const { data, error } = await supabase.from('documents').select('count').limit(1);
      if (error) throw error;
      errorLogger.connectionCheck('Supabase', true, { test_query: 'success' });
    } catch (error) {
      errorLogger.connectionCheck('Supabase', false, { error: error.message });
    }
  };
  testConnection();

  errorLogger.success('Supabase client initialized');
} catch (error) {
  errorLogger.error('Failed to initialize Supabase client', error);
  process.exit(1);
}

try {
  chatService = new ChatService(supabase);
  errorLogger.success('ChatService initialized');
} catch (error) {
  errorLogger.error('Failed to initialize ChatService', error);
  process.exit(1);
}

// Initialize agent controller with Supabase
try {
  agentController.initialize(supabase);
  errorLogger.success('Agent controller initialized');
} catch (error) {
  errorLogger.error('Failed to initialize agent controller', error);
  process.exit(1);
}

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

app.use(cors(corsOptions));

// Add explicit OPTIONS handler for preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// CRITICAL: Serve static files from frontend/dist BEFORE API routes
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  errorLogger.info('Serving static files from frontend/dist', {
    path: frontendDistPath,
    files: fs.readdirSync(frontendDistPath)
  });
  
  // Serve static files
  app.use(express.static(frontendDistPath));
} else {
  errorLogger.warn('Frontend dist directory not found', {
    expected_path: frontendDistPath,
    current_dir: __dirname
  });
}

// REDUCED REQUEST LOGGING - Only log non-status requests and errors
app.use((req, res, next) => {
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
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// Enhanced JWT verification middleware with detailed logging
const verifyToken = (req, res, next) => {
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
    jwt_secret_available: !!process.env.SUPABASE_JWT_SECRET,
    jwt_secret_length: process.env.SUPABASE_JWT_SECRET?.length || 0
  });
  
  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
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
      jwt_secret_preview: process.env.SUPABASE_JWT_SECRET?.substring(0, 10) + '...'
    });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check endpoint with comprehensive status
app.get('/health', async (req, res) => {
  // REDUCED LOGGING: Don't log every health check
  const services = {
    supabase_connected: true,
    embedding_configured: embeddingService.isConfigured(),
    openai_configured: !!process.env.OPENAI_API_KEY,
    runpod_configured: !!process.env.RUNPOD_EMBEDDING_URL
  };

  // Test RunPod connection if configured
  if (services.runpod_configured) {
    try {
      // FIXED: Ensure clean URL without trailing slashes
      const healthUrl = `${process.env.RUNPOD_EMBEDDING_URL.replace(/\/+$/, '')}/health`;
      
      const response = await axios.get(
        healthUrl,
        { 
          timeout: 5000
        }
      );
      services.runpod_health = response.data;
      errorLogger.connectionCheck('RunPod Health', true, response.data);
    } catch (error) {
      services.runpod_health = 'unavailable';
      errorLogger.connectionCheck('RunPod Health', false, { error: error.message });
    }
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services
  });
});

// Mount agent routes FIRST (before other routes) with authentication
try {
  // Apply authentication middleware to all agent routes
  app.use('/api/agent', verifyToken);
  app.use('/api/embed', verifyToken);
  app.use('/api/chat', verifyToken);
  
  // Legacy routes also need authentication
  app.use('/agent', verifyToken);
  app.use('/chat', verifyToken);
  
  mountAgentRoutes(app);
  errorLogger.success('Agent routes mounted successfully with authentication');
} catch (error) {
  errorLogger.error('Failed to mount agent routes', error);
  process.exit(1);
}

// OpenAI Chat endpoint - dedicated endpoint for OpenAI RAG
app.post('/api/openai-chat', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.userId;
    
    if (!message || typeof message !== 'string') {
      errorLogger.warn('Invalid OpenAI chat request - missing message', { user_id: userId });
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      errorLogger.warn('OpenAI chat service not configured', { user_id: userId });
      return res.status(503).json({ error: 'OpenAI chat service not configured' });
    }

    errorLogger.info('Processing OpenAI chat request', {
      user_id: userId,
      message_length: message.length,
      message_preview: message.substring(0, 100)
    });

    // Use ChatService for OpenAI RAG processing
    const result = await chatService.processQuery(userId, message);

    errorLogger.success('OpenAI chat completed', {
      user_id: userId,
      response_length: result.response.length,
      sources_count: result.sources.length
    });

    res.json({
      response: result.response,
      sources: result.sources,
      agent_id: 'openai',
      processing_time: null,
      timestamp: new Date().toISOString(),
      status: 'success'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    errorLogger.error('OpenAI chat request failed', error, {
      user_id: req.userId,
      error_message: errorMessage,
      error_stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'OpenAI chat processing failed',
      details: errorMessage
    });
  }
});

// Enhanced document upload endpoint with comprehensive logging
app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      errorLogger.warn('Upload failed - no file provided', { 
        user_id: req.userId,
        ip: req.ip
      });
      return res.status(400).json({ error: 'No file provided' });
    }

    errorLogger.info('Processing upload', {
      user_id: req.userId,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      ip: req.ip
    });

    const documentId = uuidv4();
    
    // Extract text from document
    errorLogger.info('Starting text extraction', {
      user_id: req.userId,
      document_id: documentId,
      filename: req.file.originalname
    });

    const { text, metadata } = await documentProcessor.extractText(
      req.file.buffer, 
      req.file.originalname
    );

    if (!text || text.trim().length === 0) {
      errorLogger.warn('Upload failed - no text extracted', {
        user_id: req.userId,
        filename: req.file.originalname,
        metadata
      });
      return res.status(400).json({ error: 'Could not extract text from document' });
    }

    errorLogger.info('Text extraction completed', {
      user_id: req.userId,
      document_id: documentId,
      text_length: text.length,
      metadata
    });

    // CRITICAL FIX: Try TxAgent embedding first with proper JWT forwarding
    let embedding;
    let embeddingSource = 'local';
    
    try {
      if (process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.info('Attempting TxAgent embedding with user JWT', {
          user_id: req.userId,
          document_id: documentId,
          text_length: text.length,
          runpod_url: process.env.RUNPOD_EMBEDDING_URL,
          has_jwt: !!req.headers.authorization
        });

        // CRITICAL FIX: Use TxAgent container directly with user's JWT and POST method
        // FIXED: Ensure clean URL without trailing slashes
        const embedUrl = `${process.env.RUNPOD_EMBEDDING_URL.replace(/\/+$/, '')}/embed`;
        
        // FIXED: Use explicit axios configuration to force POST method
        const axiosConfig = {
          method: 'POST', // Explicitly set method
          url: embedUrl, // Clean URL without double slashes
          data: { 
            file_path: `upload_${documentId}`,
            metadata: {
              ...metadata,
              file_size: req.file.size,
              mime_type: req.file.mimetype,
              inline_text: text,
              user_id: req.userId
            }
          },
          headers: { 
            'Authorization': req.headers.authorization, // Forward user's JWT directly
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          // Force axios to use POST even with redirects
          maxRedirects: 0,
          validateStatus: function (status) {
            return status >= 200 && status < 500; // Accept 4xx as valid to handle our own errors
          }
        };
        
        errorLogger.debug('🚀 AXIOS CONFIG - About to send upload embedding request', {
          user_id: req.userId,
          method: axiosConfig.method,
          url: axiosConfig.url,
          has_auth: !!req.headers.authorization,
          payload_size: JSON.stringify(axiosConfig.data).length,
          component: 'UploadRoute'
        });
        
        const txAgentResponse = await axios(axiosConfig);
        
        // Handle different response formats from TxAgent
        if (txAgentResponse.data.document_ids && txAgentResponse.data.document_ids.length > 0) {
          // Background processing response
          embeddingSource = 'runpod_processing';
          errorLogger.info('TxAgent background processing initiated', {
            user_id: req.userId,
            document_id: documentId,
            document_ids: txAgentResponse.data.document_ids,
            chunk_count: txAgentResponse.data.chunk_count
          });
          
          // For background processing, use local embedding for immediate storage
          embedding = await embeddingService.generateEmbedding(text, req.headers.authorization);
          embeddingSource = 'local_with_runpod_processing';
        } else if (txAgentResponse.data.embedding) {
          // Direct embedding response
          embedding = txAgentResponse.data.embedding;
          embeddingSource = 'runpod';
          
          errorLogger.success('TxAgent embedding completed', {
            user_id: req.userId,
            document_id: documentId,
            dimensions: embedding.length,
            response_status: txAgentResponse.status
          });
        } else {
          throw new Error('Invalid TxAgent response format');
        }
      } else {
        throw new Error('TxAgent not configured');
      }
    } catch (embeddingError) {
      errorLogger.warn('TxAgent embedding failed, using local service', {
        user_id: req.userId,
        document_id: documentId,
        error: embeddingError.message,
        error_code: embeddingError.code,
        status: embeddingError.response?.status
      });
      
      // CRITICAL FIX: Pass user JWT to local embedding service
      embedding = await embeddingService.generateEmbedding(text, req.headers.authorization);
      embeddingSource = 'local';
      
      errorLogger.info('Local embedding completed', {
        user_id: req.userId,
        document_id: documentId,
        dimensions: embedding?.length
      });
    }

    // CRITICAL DEBUG: Log the exact values before Supabase insert
    errorLogger.debug('Attempting Supabase insert for document', {
      user_id_from_token: req.userId,
      user_id_type: typeof req.userId,
      user_id_length: req.userId?.length,
      filename: req.file.originalname,
      document_id: documentId,
      embedding_dimensions: embedding?.length,
      embedding_source: embeddingSource,
      component: 'UploadRoute'
    });

    // Store in Supabase
    errorLogger.info('Storing document in Supabase', {
      user_id: req.userId,
      document_id: documentId,
      filename: req.file.originalname,
      embedding_source: embeddingSource
    });

    const { data, error } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        filename: req.file.originalname,
        content: text,
        metadata: {
          ...metadata,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          embedding_source: embeddingSource,
          processing_time_ms: Date.now() - startTime
        },
        embedding,
        user_id: req.userId
      })
      .select()
      .single();

    if (error) {
      errorLogger.error('Supabase insert failed', error, {
        user_id: req.userId,
        document_id: documentId,
        filename: req.file.originalname,
        error_code: error.code,
        error_details: error.details,
        error_hint: error.hint,
        error_message: error.message,
        supabase_operation: 'insert',
        table: 'documents',
        component: 'UploadRoute'
      });
      throw error;
    }

    const processingTime = Date.now() - startTime;

    errorLogger.success('Document processed successfully', {
      user_id: req.userId,
      document_id: documentId,
      filename: req.file.originalname,
      content_length: text.length,
      vector_dimensions: embedding?.length,
      embedding_source: embeddingSource,
      processing_time_ms: processingTime,
      supabase_id: data.id
    });

    res.json({
      document_id: documentId,
      filename: req.file.originalname,
      content_length: text.length,
      vector_dimensions: embedding?.length,
      embedding_source: embeddingSource,
      processing_time_ms: processingTime,
      message: 'Document uploaded and processed successfully'
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    errorLogger.error('Upload processing failed', error, {
      user_id: req.userId,
      filename: req.file?.originalname,
      processing_time_ms: processingTime,
      error_stack: error.stack,
      error_type: error.constructor.name,
      supabase_error_details: error.details || null,
      component: 'UploadRoute'
    });
    
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// CRITICAL: SPA Fallback Route - Must be LAST
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    // REDUCED LOGGING: Don't log every SPA fallback
    res.sendFile(indexPath);
  } else {
    errorLogger.error('index.html not found for SPA fallback', {
      requested_path: req.path,
      index_path: indexPath
    });
    res.status(404).send('Application not found');
  }
});

// Error handling middleware with enhanced logging
app.use((error, req, res, next) => {
  errorLogger.error('Unhandled server error', error, {
    user_id: req.userId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    user_agent: req.get('User-Agent')?.substring(0, 100),
    error_stack: error.stack
  });
  
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Server error occurred'
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  errorLogger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  errorLogger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  errorLogger.error('Uncaught exception', error, {
    error_stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  errorLogger.error('Unhandled rejection', reason, { 
    promise: promise.toString(),
    reason_stack: reason?.stack
  });
  process.exit(1);
});

// Start server
app.listen(port, () => {
  errorLogger.success('🚀 Medical RAG Server running', {
    port: port,
    health_check: `http://localhost:${port}/health`,
    environment: process.env.NODE_ENV || 'development'
  });
  
  errorLogger.info('🔧 Services configured:');
  errorLogger.connectionCheck('Embedding', embeddingService.isConfigured());
  errorLogger.connectionCheck('OpenAI Chat', !!process.env.OPENAI_API_KEY);
  errorLogger.connectionCheck('Supabase', !!process.env.SUPABASE_URL);
  errorLogger.connectionCheck('RunPod TxAgent', !!process.env.RUNPOD_EMBEDDING_URL);
  
  errorLogger.info('📚 Available endpoints:');
  errorLogger.info('  - GET  /health (Health check)');
  errorLogger.info('  - POST /upload (Document upload)');
  errorLogger.info('  - POST /api/chat (Chat with TxAgent)');
  errorLogger.info('  - POST /api/openai-chat (Chat with OpenAI RAG)');
  errorLogger.info('  - POST /chat (Legacy chat - deprecated)');
  errorLogger.info('  - POST /api/agent/start (Start TxAgent)');
  errorLogger.info('  - POST /api/agent/stop (Stop TxAgent)');
  errorLogger.info('  - GET  /api/agent/status (Agent status)');
  errorLogger.info('  - POST /api/embed (RunPod embedding)');
  errorLogger.info('  - POST /agent/* (Legacy endpoints - deprecated)');
  errorLogger.info('  - GET  /* (SPA fallback to index.html)');
});