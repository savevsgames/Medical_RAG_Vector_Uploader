import express from 'express';
import { healthRouter } from './health.js';
import { createDocumentsRouter } from './documents.js';
import { createChatRouter } from './chat.js';
import { mountAgentRoutes } from '../agent_utils/index.js';
import { EmbeddingService } from '../lib/services/index.js';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

const router = express.Router();

export function setupRoutes(app, supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to setupRoutes');
  }

  // Health check (no auth required)
  app.use('/health', healthRouter);
  
  // Create routers with Supabase client dependency injection
  const documentsRouter = createDocumentsRouter(supabaseClient);
  const chatRouter = createChatRouter(supabaseClient);
  
  // Mount protected routes - auth is now handled within each router
  app.use('/api', chatRouter);
  app.use('/', documentsRouter);
  
  // Add direct embedding endpoint
  app.post('/api/embed', verifyToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { documentText, metadata = {} } = req.body;
      const userId = req.userId;
      
      if (!documentText || typeof documentText !== 'string') {
        errorLogger.warn('Invalid embed request - missing documentText', { 
          user_id: userId,
          component: 'EmbedEndpoint'
        });
        return res.status(400).json({ error: 'documentText is required and must be a string' });
      }

      errorLogger.info('Processing embed request', {
        user_id: userId,
        text_length: documentText.length,
        metadata,
        component: 'EmbedEndpoint'
      });

      // Initialize embedding service
      const embeddingService = new EmbeddingService();
      
      // Generate embedding with user JWT for authentication
      const embedding = await embeddingService.generateEmbedding(documentText, req.headers.authorization);

      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        errorLogger.error('Invalid embedding generated', new Error('Embedding validation failed'), {
          user_id: userId,
          embedding_type: typeof embedding,
          embedding_length: embedding?.length || 0,
          component: 'EmbedEndpoint'
        });
        throw new Error('Failed to generate valid embedding');
      }

      const processingTime = Date.now() - startTime;

      errorLogger.success('Embedding generated successfully', {
        user_id: userId,
        text_length: documentText.length,
        vector_dimensions: embedding.length,
        processing_time_ms: processingTime,
        component: 'EmbedEndpoint'
      });

      res.json({
        success: true,
        vector_dimensions: embedding.length,
        embedding_preview: embedding.slice(0, 5), // First 5 dimensions for preview
        processing_time_ms: processingTime,
        metadata: {
          ...metadata,
          text_length: documentText.length,
          generated_at: new Date().toISOString()
        },
        message: 'Embedding generated successfully'
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown embedding error';
      
      errorLogger.error('Embed request failed', error, {
        user_id: req.userId,
        processing_time_ms: processingTime,
        error_stack: error.stack,
        error_type: error.constructor.name,
        component: 'EmbedEndpoint'
      });
      
      res.status(500).json({ 
        error: 'Embedding generation failed', 
        details: errorMessage,
        processing_time_ms: processingTime
      });
    }
  });
  
  // Mount agent routes (includes both new API and legacy)
  // This function handles mounting containerRouter at /api path correctly
  mountAgentRoutes(app, supabaseClient);
}

export default setupRoutes