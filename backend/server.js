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

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import our services
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
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Missing Supabase configuration');
  }

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

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  errorLogger.info('Incoming request', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    user_agent: req.get('User-Agent')?.substring(0, 100),
    content_type: req.get('Content-Type'),
    content_length: req.get('Content-Length')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    
    errorLogger[level]('Request completed', {
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: duration,
      user_id: req.userId || 'anonymous'
    });
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

// JWT verification middleware with enhanced logging
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    errorLogger.warn('Authentication failed - no token provided', {
      ip: req.ip,
      path: req.path,
      user_agent: req.get('User-Agent')?.substring(0, 100)
    });
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    req.userId = decoded.sub;
    
    errorLogger.info('User authenticated', {
      user_id: req.userId,
      path: req.path,
      method: req.method
    });
    
    next();
  } catch (error) {
    errorLogger.warn('Authentication failed - invalid token', {
      ip: req.ip,
      path: req.path,
      error: error.message
    });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check endpoint with comprehensive status
app.get('/health', async (req, res) => {
  errorLogger.info('Health check requested', {
    ip: req.ip,
    user_agent: req.get('User-Agent')?.substring(0, 100)
  });
  
  const services = {
    supabase_connected: true,
    embedding_configured: embeddingService.isConfigured(),
    openai_configured: !!process.env.OPENAI_API_KEY,
    runpod_configured: !!(process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY)
  };

  // Test RunPod connection if configured
  if (services.runpod_configured) {
    try {
      const response = await axios.get(
        `${process.env.RUNPOD_EMBEDDING_URL}/health`,
        { 
          headers: { 'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}` },
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

  errorLogger.info('Health check completed', { services });

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services
  });
});

// Mount agent routes
try {
  mountAgentRoutes(app);
  errorLogger.success('Agent routes mounted successfully');
} catch (error) {
  errorLogger.error('Failed to mount agent routes', error);
  process.exit(1);
}

// Add the missing /api/chat endpoint
app.post('/api/chat', verifyToken, async (req, res) => {
  try {
    const { message, context } = req.body;
    const userId = req.userId;
    
    if (!message || typeof message !== 'string') {
      errorLogger.warn('Invalid chat request - missing message', { user_id: userId });
      return res.status(400).json({ error: 'Message is required' });
    }

    errorLogger.info('Processing chat request', {
      user_id: userId,
      message_length: message.length,
      has_context: !!context
    });

    // Try RunPod TxAgent first if configured
    if (process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY) {
      try {
        errorLogger.info('Attempting RunPod TxAgent chat', {
          user_id: userId,
          runpod_url: process.env.RUNPOD_EMBEDDING_URL
        });

        const response = await axios.post(
          `${process.env.RUNPOD_EMBEDDING_URL}/chat`,
          { 
            query: message,
            user_id: userId,
            context: context || null
          },
          { 
            headers: { 
              'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }
        );

        errorLogger.success('RunPod TxAgent chat completed', {
          user_id: userId,
          response_length: response.data.response?.length || 0,
          sources_count: response.data.sources?.length || 0
        });

        return res.json({
          response: response.data.response || response.data.answer || 'No response from TxAgent',
          sources: response.data.sources || [],
          agent_id: response.data.agent_id || 'txagent',
          processing_time: response.data.processing_time,
          timestamp: new Date().toISOString()
        });

      } catch (runpodError) {
        errorLogger.warn('RunPod TxAgent failed, falling back to local chat', {
          user_id: userId,
          error: runpodError.message,
          error_code: runpodError.code
        });
      }
    }

    // Fallback to local OpenAI chat service
    errorLogger.info('Using local OpenAI chat service', {
      user_id: userId
    });

    const result = await chatService.processQuery(userId, message);

    errorLogger.success('Local chat service completed', {
      user_id: userId,
      response_length: result.response.length,
      sources_count: result.sources.length
    });

    res.json({
      response: result.response,
      sources: result.sources,
      agent_id: 'local',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    errorLogger.error('Chat request failed', error, {
      user_id: req.userId,
      message_length: req.body?.message?.length,
      error_stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Chat processing failed',
      details: error.message
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

    // Try RunPod embedding first, fallback to local embedding service
    let embedding;
    let embeddingSource = 'local';
    
    try {
      if (process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY) {
        errorLogger.info('Attempting RunPod embedding', {
          user_id: req.userId,
          document_id: documentId,
          text_length: text.length,
          runpod_url: process.env.RUNPOD_EMBEDDING_URL
        });

        const runpodResponse = await axios.post(
          `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
          { 
            text: text,
            user_id: req.userId 
          },
          { 
            headers: { 
              'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        embedding = runpodResponse.data.embedding || runpodResponse.data;
        embeddingSource = 'runpod';
        
        errorLogger.success('RunPod embedding completed', {
          user_id: req.userId,
          document_id: documentId,
          dimensions: runpodResponse.data.dimensions || embedding?.length,
          response_status: runpodResponse.status
        });
      } else {
        throw new Error('RunPod not configured');
      }
    } catch (embeddingError) {
      errorLogger.warn('RunPod embedding failed, using local service', {
        user_id: req.userId,
        document_id: documentId,
        error: embeddingError.message,
        error_code: embeddingError.code
      });
      
      embedding = await embeddingService.generateEmbedding(text);
      embeddingSource = 'local';
      
      errorLogger.info('Local embedding completed', {
        user_id: req.userId,
        document_id: documentId,
        dimensions: embedding?.length
      });
    }

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
        error_details: error.details
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
      error_stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
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

// 404 handler with logging
app.use((req, res) => {
  errorLogger.warn('Route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    user_agent: req.get('User-Agent')?.substring(0, 100)
  });
  
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
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
  errorLogger.connectionCheck('RunPod TxAgent', !!(process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY));
  
  errorLogger.info('📚 Available endpoints:');
  errorLogger.info('  - GET  /health (Health check)');
  errorLogger.info('  - POST /upload (Document upload)');
  errorLogger.info('  - POST /api/chat (Chat with TxAgent/OpenAI)');
  errorLogger.info('  - POST /api/agent/start (Start TxAgent)');
  errorLogger.info('  - POST /api/agent/stop (Stop TxAgent)');
  errorLogger.info('  - GET  /api/agent/status (Agent status)');
  errorLogger.info('  - POST /api/embed (RunPod embedding)');
  errorLogger.info('  - POST /agent/* (Legacy endpoints - deprecated)');
  errorLogger.info('  - POST /chat (Legacy chat - deprecated)');
});