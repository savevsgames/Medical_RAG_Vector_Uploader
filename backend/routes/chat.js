import express from 'express';
import { ChatService } from '../lib/services/ChatService.js';
import { supabase } from '../config/database.js';
import { config } from '../config/environment.js';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

const router = express.Router();

// Apply authentication to all chat routes
router.use(verifyToken);

// Initialize chat service
const chatService = new ChatService(supabase);

// OpenAI Chat endpoint - dedicated endpoint for OpenAI RAG
router.post('/openai-chat', async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.userId;
    
    if (!message || typeof message !== 'string') {
      errorLogger.warn('Invalid OpenAI chat request - missing message', { 
        user_id: userId,
        component: 'OpenAIChat'
      });
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!config.openai.apiKey) {
      errorLogger.warn('OpenAI chat service not configured', { 
        user_id: userId,
        component: 'OpenAIChat'
      });
      return res.status(503).json({ error: 'OpenAI chat service not configured' });
    }

    errorLogger.info('Processing OpenAI chat request', {
      user_id: userId,
      message_length: message.length,
      message_preview: message.substring(0, 100),
      component: 'OpenAIChat'
    });

    // Use ChatService for OpenAI RAG processing
    const result = await chatService.processQuery(userId, message);

    errorLogger.success('OpenAI chat completed', {
      user_id: userId,
      response_length: result.response.length,
      sources_count: result.sources.length,
      component: 'OpenAIChat'
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
      error_stack: error.stack,
      component: 'OpenAIChat'
    });
    
    res.status(500).json({ 
      error: 'OpenAI chat processing failed',
      details: errorMessage
    });
  }
});

export { router as chatRouter };