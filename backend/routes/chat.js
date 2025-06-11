import express from 'express';
import { ChatService } from '../lib/services/ChatService.js';
import { config } from '../config/environment.js';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';
import { AgentService } from '../agent_utils/core/agentService.js';
import { DocumentSearchService } from '../lib/services/DocumentSearchService.js';
import axios from 'axios';

export function createChatRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to createChatRouter');
  }

  const router = express.Router();

  // Apply authentication to all chat routes
  router.use(verifyToken);

  // Initialize services with injected Supabase client
  const chatService = new ChatService(supabaseClient);
  const agentService = new AgentService(supabaseClient);
  const searchService = new DocumentSearchService(supabaseClient);

  // TxAgent Chat endpoint - UPDATED for new container API
  router.post('/chat', async (req, res) => {
    try {
      const { message, top_k = 5, temperature = 0.7 } = req.body || {};
      const userId = req.userId;
      
      if (!message || typeof message !== 'string') {
        errorLogger.warn('Invalid TxAgent chat request - missing message', { 
          user_id: userId,
          component: 'TxAgentChat'
        });
        return res.status(400).json({ error: 'Message is required' });
      }

      errorLogger.info('Processing TxAgent chat request', {
        user_id: userId,
        message_length: message.length,
        message_preview: message.substring(0, 100),
        component: 'TxAgentChat'
      });

      // 1. Find active agent session to get runpod_endpoint
      const agent = await agentService.getActiveAgent(userId);
      if (!agent?.session_data?.runpod_endpoint) {
        errorLogger.warn('TxAgent chat request failed - no active agent', { 
          user_id: userId,
          component: 'TxAgentChat'
        });
        return res.status(503).json({ 
          error: 'TxAgent not running. Please start the agent first.',
          details: 'No active TxAgent session found. Please activate TxAgent from the Monitor page.'
        });
      }
      
      const baseUrl = agent.session_data.runpod_endpoint.replace(/\/+$/, '');
      
      errorLogger.debug('TxAgent session found', {
        user_id: userId,
        agent_id: agent.id,
        base_url: baseUrl,
        component: 'TxAgentChat'
      });

      // 2. Call TxAgent's /chat endpoint directly with the new API format
      const chatUrl = `${baseUrl}/chat`;
      
      errorLogger.debug('Calling TxAgent chat endpoint', {
        user_id: userId,
        chat_url: chatUrl,
        component: 'TxAgentChat'
      });

      // UPDATED: Use the new TxAgent API format
      const chatPayload = {
        query: message,        // CRITICAL: TxAgent expects 'query' not 'message'
        history: [],           // Required by container - conversation history
        top_k,                 // Number of documents to retrieve
        temperature,           // Response randomness
        stream: false          // Required by container - disable streaming for now
      };
      
      console.log('🔍 CHAT REQUEST PAYLOAD:', JSON.stringify(chatPayload, null, 2));
      console.log('🔍 CHAT REQUEST URL:', chatUrl);
      console.log('🔍 CHAT REQUEST HEADERS:', {
        Authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'None',
        'Content-Type': 'application/json'
      });

      const { data: chatResp } = await axios.post(
        chatUrl,
        chatPayload,
        { 
          headers: { 
            'Authorization': req.headers.authorization,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // Longer timeout for chat processing
        }
      );

      console.log('🔍 CHAT RESPONSE:', JSON.stringify(chatResp, null, 2));

      // 3. Return the formatted response to the frontend
      errorLogger.success('TxAgent chat completed', {
        user_id: userId,
        response_length: chatResp.response?.length || 0,
        sources_count: chatResp.sources?.length || 0,
        processing_time: chatResp.processing_time,
        component: 'TxAgentChat'
      });

      res.json({
        response: chatResp.response,
        sources: chatResp.sources || [],
        agent_id: 'txagent',
        processing_time: chatResp.processing_time || null,
        model: chatResp.model || 'BioBERT',
        tokens_used: chatResp.tokens_used || null,
        timestamp: new Date().toISOString(),
        status: 'success'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.log('🔍 CHAT ERROR:', {
        message: errorMessage,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status
      });
      
      errorLogger.error('TxAgent chat request failed', error, {
        user_id: req.userId,
        error_message: errorMessage,
        error_stack: error.stack,
        response_status: error.response?.status,
        response_data: error.response?.data,
        component: 'TxAgentChat'
      });

      // Enhanced error handling for different scenarios
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.status(503).json({ 
          error: 'TxAgent container unreachable',
          details: 'The TxAgent container is not responding. Please check if it is running and accessible.'
        });
      }

      if (error.response?.status === 401) {
        return res.status(401).json({ 
          error: 'Authentication failed with TxAgent',
          details: 'Invalid or expired authentication token for TxAgent container.'
        });
      }

      if (error.response?.status === 422) {
        return res.status(422).json({ 
          error: 'Invalid request format for TxAgent',
          details: error.response?.data?.detail || 'Request format does not match TxAgent API expectations.'
        });
      }
      
      res.status(502).json({ 
        error: 'TxAgent chat processing failed',
        details: errorMessage
      });
    }
  });

  // OpenAI Chat endpoint - Enhanced fallback option
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
        return res.status(503).json({ 
          error: 'OpenAI chat service not configured',
          details: 'OpenAI API key is not configured. Please use TxAgent or configure OpenAI.'
        });
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
        model: 'GPT-4',
        tokens_used: null,
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

  return router;
}

// Legacy export for backward compatibility
export const chatRouter = createChatRouter;