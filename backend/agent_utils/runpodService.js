// RunPod Service - Handles all RunPod API interactions
// Manages embedding and chat requests to TxAgent containers

import express from 'express';
import axios from 'axios';
import { errorLogger } from './errorLogger.js';

class RunPodService {
  constructor() {
    this.router = express.Router();
    this.setupRoutes();
    this.defaultTimeout = 30000;
    this.chatTimeout = 60000;
  }

  setupRoutes() {
    // Embedding endpoint - forwards documents to RunPod TxAgent
    this.router.post('/embed', this.handleEmbedding.bind(this));
    
    // Chat endpoint - forwards queries to RunPod TxAgent
    this.router.post('/chat', this.handleChat.bind(this));
  }

  async handleEmbedding(req, res) {
    try {
      const { documentText } = req.body;
      const userId = req.userId;
      
      if (!documentText || typeof documentText !== 'string') {
        errorLogger.warn('Invalid embedding request - missing document text', { user_id: userId });
        return res.status(400).json({ error: 'Document text is required' });
      }

      if (!process.env.RUNPOD_EMBEDDING_URL || !process.env.RUNPOD_EMBEDDING_KEY) {
        errorLogger.warn('RunPod embedding service not configured', { user_id: userId });
        return res.status(503).json({ error: 'RunPod embedding service not configured' });
      }

      errorLogger.runpodRequest('embed', userId, {
        text_length: documentText.length,
        text_preview: documentText.substring(0, 100)
      });

      const response = await axios.post(
        `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
        { 
          text: documentText,
          user_id: userId 
        },
        { 
          headers: { 
            'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: this.defaultTimeout
        }
      );

      errorLogger.success('RunPod embedding completed', {
        user_id: userId,
        dimensions: response.data.dimensions || response.data.embedding?.length,
        processing_time: response.data.processing_time
      });

      res.json({
        embedding: response.data.embedding || response.data,
        dimensions: response.data.dimensions || response.data.embedding?.length,
        processing_time: response.data.processing_time,
        user_id: userId
      });

    } catch (error) {
      this.handleRunPodError('embedding', error, req, res);
    }
  }

  async handleChat(req, res) {
    try {
      const { message, context } = req.body;
      const userId = req.userId;
      
      if (!message || typeof message !== 'string') {
        errorLogger.warn('Invalid chat request - missing message', { user_id: userId });
        return res.status(400).json({ error: 'Message is required' });
      }

      if (!process.env.RUNPOD_EMBEDDING_URL || !process.env.RUNPOD_EMBEDDING_KEY) {
        errorLogger.warn('RunPod chat service not configured', { user_id: userId });
        return res.status(503).json({ error: 'RunPod chat service not configured' });
      }

      errorLogger.runpodRequest('chat', userId, {
        message_length: message.length,
        message_preview: message.substring(0, 100),
        has_context: !!context
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
          timeout: this.chatTimeout
        }
      );

      errorLogger.success('RunPod chat completed', {
        user_id: userId,
        agent_id: response.data.agent_id || 'txagent',
        processing_time: response.data.processing_time,
        sources_count: response.data.sources?.length || 0
      });

      res.json({
        response: response.data.response || response.data.answer || response.data,
        sources: response.data.sources || [],
        agent_id: response.data.agent_id || 'txagent',
        processing_time: response.data.processing_time,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleRunPodError('chat', error, req, res);
    }
  }

  handleRunPodError(operation, error, req, res) {
    const userId = req.userId;
    
    errorLogger.runpodError(operation, error, {
      user_id: userId,
      error_code: error.code,
      response_status: error.response?.status,
      response_data: error.response?.data
    });
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ 
        error: `RunPod ${operation} request timeout`,
        details: 'The TxAgent container may be starting up or overloaded'
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: `RunPod ${operation} failed`,
        details: error.response.data?.error || error.response.statusText
      });
    }
    
    res.status(500).json({ 
      error: `Failed to process ${operation} request`,
      details: 'RunPod service unavailable'
    });
  }

  // Utility method to test RunPod connection
  async testConnection() {
    try {
      if (!process.env.RUNPOD_EMBEDDING_URL || !process.env.RUNPOD_EMBEDDING_KEY) {
        errorLogger.connectionCheck('RunPod', false, { reason: 'Missing configuration' });
        return false;
      }

      const response = await axios.get(
        `${process.env.RUNPOD_EMBEDDING_URL}/health`,
        { 
          headers: { 
            'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`
          },
          timeout: 5000
        }
      );

      errorLogger.connectionCheck('RunPod', true, { 
        status: response.status,
        health: response.data
      });
      return true;

    } catch (error) {
      errorLogger.connectionCheck('RunPod', false, { 
        error: error.message,
        code: error.code
      });
      return false;
    }
  }
}

export const runpodService = new RunPodService();