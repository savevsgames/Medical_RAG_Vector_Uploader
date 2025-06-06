import express from 'express';
import cors from 'cors';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
    supabase_connected: true // We'll assume it's connected for now
  });
});

// Document upload endpoint (placeholder - will need document processing logic)
app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const documentId = uuidv4();
    
    // TODO: Implement document processing logic
    // - Extract text from file
    // - Generate embeddings
    // - Store in Supabase
    
    res.json({
      document_id: documentId,
      filename: req.file.originalname,
      content_length: req.file.size,
      message: 'Upload endpoint ready - processing logic to be implemented'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Agent management endpoints
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
        session_data: {}
      })
      .select()
      .single();

    if (error) throw error;

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
      last_active: agent?.last_active || null
    });

  } catch (error) {
    console.error('Agent status error:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});