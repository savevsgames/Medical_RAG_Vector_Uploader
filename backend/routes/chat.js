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

  // Initialize chat service with injected Supabase client
  const chatService = new ChatService(supabaseClient);
  const agentService = new AgentService(supabaseClient);
  const searchService = new DocumentSearchService(supabaseClient);

  // POST /chat – proxy to the user's TxAgent container
  router.post('/chat', async (req, res) => {
    const { message, top_k = 5, temperature = 0.7 } = req.body || {};
    if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  
  try {
    // 1. find active agent session to get runpod_endpoint
    const agent = await agentService.getActiveAgent(req.userId);
    if (!agent?.session_data?.runpod_endpoint) {
      return res.status(503).json({ error: 'TxAgent not running' });
    }
  
    const chatUrl = `${agent.session_data.runpod_endpoint.replace(/\/+$/, '')}/chat`;
  
    const { data } = await axios.post(
      chatUrl,
      { query: message, top_k, temperature },
      { headers: { Authorization: req.headers.authorization } }
    );
  
    return res.json(data);              

    // Use Embeddings to search Vector DB
    const baseUrl = agent.session_data.runpod_endpoint.replace(/\/+$/, '');
+
+    // 2️⃣ Get a BioBERT embedding for the **query**  (container /embed)
+    const { data: embedResp } = await axios.post(
+      `${baseUrl}/embed`,
+      { text: message },
+      { headers: { Authorization: req.headers.authorization } }
+    );
+    const queryEmbedding = embedResp.embedding;           // ← 768-dim array
+
+    // 3️⃣ Similarity search in Supabase (top_k docs)
+    const similarDocs = await searchService.searchRelevantDocuments(
+      req.userId,
+      queryEmbedding,
+      top_k
+    );
+
+    // 4️⃣ Call the container’s /chat endpoint, sending the docs for context
+    const chatUrl = `${baseUrl}/chat`;
+    const { data: chatResp } = await axios.post(
+      chatUrl,
+      {
+        query: message,
+        context: similarDocs,          // container can skip its own DB hit
+        temperature
+      },
+      { headers: { Authorization: req.headers.authorization } }
+    );
+
+    // 5️⃣ Return the formatted response to the frontend
+    return res.json({
+      response: chatResp.response,
+      sources : chatResp.sources || similarDocs,   // safety-fallback
+      agent_id: 'txagent',
+      processing_time: chatResp.processing_time ?? null,
+      status: 'success'
+    });
    
  } catch (err) {
    errorLogger.error('TxAgent chat failed', err);
    return res.status(502).json({ error: err.message });
  }
  });
  
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
      const result = await chatService.processQuery(req.userId, message, 'openai');

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

  return router;
}

// Legacy export for backward compatibility
export const chatRouter = createChatRouter;