// Container proxy routes
import express from 'express';
import { ContainerService } from '../core/containerService.js';
import { agentMiddleware } from '../middleware/agentMiddleware.js';
import { handleAgentError, createAuthError } from '../shared/errors.js';

class ContainerRoutes {
  constructor() {
    this.router = express.Router();
    this.containerService = new ContainerService();
    this.setupRoutes();
  }

  setupRoutes() {
    this.router.use(agentMiddleware.logRequest.bind(agentMiddleware));
    
    this.router.post('/embed', this.handleEmbed.bind(this));
    this.router.post('/chat', this.handleChat.bind(this));
  }

  async handleEmbed(req, res) {
    try {
      const { documentText, file_path, metadata } = req.body;
      const { userId } = req;
      const userJWT = req.headers.authorization;

      if (!userId || !userJWT) {
        throw createAuthError('embed');
      }

      const textToEmbed = documentText || file_path;
      
      if (!textToEmbed || typeof textToEmbed !== 'string') {
        return res.status(400).json({ 
          error: 'Document text or file path is required' 
        });
      }

      const response = await this.containerService.embed(
        textToEmbed,
        { file_path, ...metadata },
        userJWT
      );

      res.json({
        document_ids: response.document_ids || [],
        chunk_count: response.chunk_count || 0,
        embedding: response.embedding,
        dimensions: response.dimensions,
        processing_time: response.processing_time,
        user_id: userId,
        status: response.status || 'success',
        message: response.message || 'Embedding completed successfully'
      });

    } catch (error) {
      const errorResponse = handleAgentError('embed', error, req.userId);
      res.status(errorResponse.status).json(errorResponse);
    }
  }

  async handleChat(req, res) {
    try {
      const { message, context, history } = req.body;
      const { userId } = req;
      const userJWT = req.headers.authorization;

      if (!userId || !userJWT) {
        throw createAuthError('chat');
      }

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      const response = await this.containerService.chat(
        message,
        context || history,
        userJWT
      );

      res.json(response);

    } catch (error) {
      const errorResponse = handleAgentError('chat', error, req.userId);
      res.status(errorResponse.status).json(errorResponse);
    }
  }
}

export const containerRoutes = new ContainerRoutes();