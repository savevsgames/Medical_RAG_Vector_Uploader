import express from 'express';
import { EmbeddingService } from '../../lib/services/index.js';
import { verifyToken } from '../../middleware/auth.js';
import { errorLogger } from '../shared/logger.js';

const router = express.Router();

// Apply authentication to all container routes
router.use(verifyToken);

// Initialize services
const embeddingService = new EmbeddingService();

class ContainerRoutes {
  // Direct embedding endpoint
  async generateEmbedding(req, res) {
    try {
      const { documentText, file_path, metadata } = req.body;
      const userId = req.userId;
      
      if (!documentText || typeof documentText !== 'string') {
        return res.status(400).json({
          error: 'documentText is required and must be a string'
        });
      }

      errorLogger.info('Direct embedding request', {
        user_id: userId,
        text_length: documentText.length,
        file_path: file_path || 'unknown',
        has_metadata: !!metadata,
        component: 'ContainerRoutes'
      });

      // Generate embedding using the service
      const embedding = await embeddingService.generateEmbedding(
        documentText, 
        req.headers.authorization
      );

      errorLogger.success('Direct embedding completed', {
        user_id: userId,
        vector_dimensions: embedding?.length || 0,
        embedding_source: embeddingService.getLastUsedSource?.() || 'unknown',
        component: 'ContainerRoutes'
      });

      res.json({
        embedding,
        vector_dimensions: embedding?.length || 0,
        embedding_source: embeddingService.getLastUsedSource?.() || 'unknown',
        text_length: documentText.length,
        processing_time: Date.now(),
        metadata: metadata || {}
      });

    } catch (error) {
      errorLogger.error('Direct embedding failed', error, {
        user_id: req.userId,
        error_stack: error.stack,
        component: 'ContainerRoutes'
      });
      
      res.status(500).json({
        error: 'Embedding generation failed',
        details: error.message
      });
    }
  }
}

const containerRoutes = new ContainerRoutes();

// Container routes
router.post('/embed', (req, res) => containerRoutes.generateEmbedding(req, res));

export { router, containerRoutes };