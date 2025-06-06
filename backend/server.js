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

// Diagnostic checks for file existence
console.log('=== DIAGNOSTIC CHECKS ===');
console.log('Current directory:', __dirname);
console.log('Looking for files in:', path.join(__dirname, 'lib'));

const documentProcessorPath = path.join(__dirname, 'lib', 'documentProcessor.js');
const embedderPath = path.join(__dirname, 'lib', 'embedder.js');
const chatServicePath = path.join(__dirname, 'lib', 'chatService.js');

console.log('DocumentProcessor exists:', fs.existsSync(documentProcessorPath));
console.log('Embedder exists:', fs.existsSync(embedderPath));
console.log('ChatService exists:', fs.existsSync(chatServicePath));

// List contents of lib directory if it exists
const libDir = path.join(__dirname, 'lib');
if (fs.existsSync(libDir)) {
  console.log('Contents of lib directory:', fs.readdirSync(libDir));
} else {
  console.log('lib directory does not exist');
}
console.log('=== END DIAGNOSTIC ===');

// Import our services
import { DocumentProcessor } from './lib/documentProcessor.js';
import { EmbeddingService } from './lib/embedder.js';
import { ChatService } from './lib/chatService.js';

const app = express();
const port = process.env.PORT || 8000;

// Initialize services
const documentProcessor = new DocumentProcessor();
const embeddingService = new EmbeddingService();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const chatService = new ChatService(supabase);

// Middleware
app.use(cors());
app.use(express.json());

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

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    req.userId = decoded.sub;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      supabase_connected: true,
      embedding_configured: embeddingService.isConfigured(),
      openai_configured: !!process.env.OPENAI_API_KEY,
      runpod_configured: !!(process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY)
    }
  });
});

// RunPod middleware API routes

// Embedding endpoint - forwards documents to RunPod TxAgent
app.post('/api/embed', verifyToken, async (req, res) => {
  try {
    const { documentText } = req.body;
    
    if (!documentText || typeof documentText !== 'string') {
      return res.status(400).json({ error: 'Document text is required' });
    }

    if (!process.env.RUNPOD_EMBEDDING_URL || !process.env.RUNPOD_EMBEDDING_KEY) {
      return res.status(503).json({ error: 'RunPod embedding service not configured' });
    }

    console.log(`Processing embedding request for user ${req.userId}`);

    const response = await axios.post(
      `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
      { 
        text: documentText,
        user_id: req.userId 
      },
      { 
        headers: { 
          'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    res.json({
      embedding: response.data.embedding,
      dimensions: response.data.dimensions,
      processing_time: response.data.processing_time,
      user_id: req.userId
    });

  } catch (error) {
    console.error('RunPod embedding error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'RunPod request timeout' });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: 'RunPod embedding failed',
        details: error.response.data?.error || error.response.statusText
      });
    }
    
    res.status(500).json({ error: 'Failed to embed document' });
  }
});

// Chat endpoint - forwards queries to RunPod TxAgent
app.post('/api/chat', verifyToken, async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.RUNPOD_EMBEDDING_URL || !process.env.RUNPOD_EMBEDDING_KEY) {
      return res.status(503).json({ error: 'RunPod chat service not configured' });
    }

    console.log(`Processing chat request for user ${req.userId}: ${message.substring(0, 100)}...`);

    const response = await axios.post(
      `${process.env.RUNPOD_EMBEDDING_URL}/chat`,
      { 
        query: message,
        user_id: req.userId,
        context: context || null
      },
      { 
        headers: { 
          'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout for chat
      }
    );

    res.json({
      response: response.data.response,
      sources: response.data.sources || [],
      agent_id: response.data.agent_id,
      processing_time: response.data.processing_time,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('RunPod chat error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'RunPod chat request timeout' });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: 'RunPod chat failed',
        details: error.response.data?.error || error.response.statusText
      });
    }
    
    res.status(500).json({ error: 'Chat request failed' });
  }
});

// TxAgent container management endpoints
app.post('/api/agent/start', verifyToken, async (req, res) => {
  try {
    if (!process.env.RUNPOD_EMBEDDING_URL || !process.env.RUNPOD_EMBEDDING_KEY) {
      return res.status(503).json({ error: 'RunPod service not configured' });
    }

    console.log(`Starting TxAgent container for user ${req.userId}`);

    const response = await axios.post(
      `${process.env.RUNPOD_EMBEDDING_URL}/agent/start`,
      { 
        user_id: req.userId,
        config: {
          memory_limit: '2GB',
          timeout: 3600, // 1 hour
          capabilities: ['embedding', 'chat', 'document_analysis']
        }
      },
      { 
        headers: { 
          'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Update agent status in Supabase
    const { error: dbError } = await supabase
      .from('agents')
      .upsert({
        user_id: req.userId,
        status: 'active',
        session_data: {
          container_id: response.data.container_id,
          started_at: new Date().toISOString(),
          runpod_endpoint: response.data.endpoint_url
        }
      });

    if (dbError) {
      console.error('Database update error:', dbError);
    }

    res.json({
      agent_id: response.data.container_id,
      endpoint_url: response.data.endpoint_url,
      status: 'started',
      message: 'TxAgent container initialized successfully'
    });

  } catch (error) {
    console.error('TxAgent start error:', error.message);
    res.status(500).json({ error: 'Failed to start TxAgent container' });
  }
});

app.post('/api/agent/stop', verifyToken, async (req, res) => {
  try {
    if (!process.env.RUNPOD_EMBEDDING_URL || !process.env.RUNPOD_EMBEDDING_KEY) {
      return res.status(503).json({ error: 'RunPod service not configured' });
    }

    console.log(`Stopping TxAgent container for user ${req.userId}`);

    const response = await axios.post(
      `${process.env.RUNPOD_EMBEDDING_URL}/agent/stop`,
      { user_id: req.userId },
      { 
        headers: { 
          'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Update agent status in Supabase
    const { error: dbError } = await supabase
      .from('agents')
      .update({
        status: 'terminated',
        terminated_at: new Date().toISOString()
      })
      .eq('user_id', req.userId)
      .eq('status', 'active');

    if (dbError) {
      console.error('Database update error:', dbError);
    }

    res.json({
      status: 'stopped',
      message: 'TxAgent container terminated successfully'
    });

  } catch (error) {
    console.error('TxAgent stop error:', error.message);
    res.status(500).json({ error: 'Failed to stop TxAgent container' });
  }
});

app.get('/api/agent/status', verifyToken, async (req, res) => {
  try {
    // Check local database first
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .single();

    if (!agent) {
      return res.json({
        agent_active: false,
        agent_id: null,
        last_active: null,
        container_status: 'not_found'
      });
    }

    // Check RunPod container status
    if (process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY) {
      try {
        const response = await axios.get(
          `${process.env.RUNPOD_EMBEDDING_URL}/agent/status`,
          { 
            headers: { 
              'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`
            },
            params: { user_id: req.userId },
            timeout: 10000
          }
        );

        res.json({
          agent_active: true,
          agent_id: agent.id,
          last_active: agent.last_active,
          container_status: response.data.status,
          container_health: response.data.health,
          session_data: agent.session_data
        });
      } catch (runpodError) {
        console.error('RunPod status check failed:', runpodError.message);
        res.json({
          agent_active: true,
          agent_id: agent.id,
          last_active: agent.last_active,
          container_status: 'unknown',
          session_data: agent.session_data
        });
      }
    } else {
      res.json({
        agent_active: true,
        agent_id: agent.id,
        last_active: agent.last_active,
        container_status: 'local_only',
        session_data: agent.session_data
      });
    }

  } catch (error) {
    console.error('Agent status error:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// Document upload endpoint (enhanced with RunPod integration)
app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log(`Processing upload: ${req.file.originalname} (${req.file.size} bytes)`);

    const documentId = uuidv4();
    
    // Extract text from document
    const { text, metadata } = await documentProcessor.extractText(
      req.file.buffer, 
      req.file.originalname
    );

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from document' });
    }

    // Try RunPod embedding first, fallback to local embedding service
    let embedding;
    try {
      if (process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY) {
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
        embedding = runpodResponse.data.embedding;
        console.log('Used RunPod embedding service');
      } else {
        embedding = await embeddingService.generateEmbedding(text);
        console.log('Used local embedding service');
      }
    } catch (embeddingError) {
      console.error('Embedding generation failed:', embeddingError);
      // Fallback to local service
      embedding = await embeddingService.generateEmbedding(text);
    }

    // Store in Supabase
    const { data, error } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        filename: req.file.originalname,
        content: text,
        metadata: {
          ...metadata,
          file_size: req.file.size,
          mime_type: req.file.mimetype
        },
        embedding,
        user_id: req.userId
      })
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      throw error;
    }

    console.log(`Document processed successfully: ${documentId}`);

    res.json({
      document_id: documentId,
      filename: req.file.originalname,
      content_length: text.length,
      vector_dimensions: embedding.length,
      message: 'Document uploaded and processed successfully'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// Legacy chat endpoint (keeping for backward compatibility)
app.post('/chat', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`Processing chat message from user ${req.userId}: ${message.substring(0, 100)}...`);

    const result = await chatService.processQuery(req.userId, message);

    res.json({
      response: result.response,
      sources: result.sources,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Chat processing failed', 
      details: error.message 
    });
  }
});

// Legacy agent management endpoints (keeping for backward compatibility)
app.post('/agent/start', verifyToken, async (req, res) => {
  try {
    // Check if user already has an active agent
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .single();

    if (existingAgent) {
      return res.json({
        agent_id: existingAgent.id,
        status: 'already_running',
        message: 'Agent is already active'
      });
    }

    // Create new agent session
    const { data: newAgent, error } = await supabase
      .from('agents')
      .insert({
        user_id: req.userId,
        status: 'active',
        session_data: {
          started_at: new Date().toISOString(),
          capabilities: ['document_search', 'chat', 'embedding_generation']
        }
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`Agent started for user ${req.userId}: ${newAgent.id}`);

    res.json({
      agent_id: newAgent.id,
      status: 'started',
      message: 'Agent initialized successfully'
    });

  } catch (error) {
    console.error('Agent start error:', error);
    res.status(500).json({ error: 'Failed to start agent' });
  }
});

app.post('/agent/stop', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('agents')
      .update({
        status: 'terminated',
        terminated_at: new Date().toISOString()
      })
      .eq('user_id', req.userId)
      .eq('status', 'active');

    if (error) throw error;

    console.log(`Agent stopped for user ${req.userId}`);

    res.json({
      status: 'stopped',
      message: 'Agent terminated successfully'
    });

  } catch (error) {
    console.error('Agent stop error:', error);
    res.status(500).json({ error: 'Failed to stop agent' });
  }
});

app.get('/agent/status', verifyToken, async (req, res) => {
  try {
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .single();

    res.json({
      agent_active: !!agent,
      agent_id: agent?.id || null,
      last_active: agent?.last_active || null,
      session_data: agent?.session_data || null
    });

  } catch (error) {
    console.error('Agent status error:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Medical RAG Server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🔧 Services configured:`);
  console.log(`   - Embedding: ${embeddingService.isConfigured() ? '✅' : '❌'}`);
  console.log(`   - OpenAI Chat: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
  console.log(`   - Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
  console.log(`   - RunPod TxAgent: ${(process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY) ? '✅' : '❌'}`);
});