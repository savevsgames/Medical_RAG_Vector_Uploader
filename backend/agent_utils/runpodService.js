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
      const { documentText, file_path, metadata } = req.body;
      const userId = req.userId;
      const userJWT = req.headers.authorization; // Get the full Authorization header
      
      // Support both direct text and file path
      const textToEmbed = documentText || file_path;
      
      if (!textToEmbed || typeof textToEmbed !== 'string') {
        errorLogger.warn('Invalid embedding request - missing document text or file path', { user_id: userId });
        return res.status(400).json({ error: 'Document text or file path is required' });
      }

      if (!process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.warn('RunPod embedding service not configured', { user_id: userId });
        return res.status(503).json({ error: 'RunPod embedding service not configured' });
      }

      errorLogger.runpodRequest('embed', userId, {
        text_length: textToEmbed.length,
        text_preview: textToEmbed.substring(0, 100),
        has_jwt: !!userJWT,
        has_metadata: !!metadata
      });

      // Prepare request payload matching your FastAPI endpoint
      const requestPayload = {
        file_path: file_path || 'inline_text',
        metadata: metadata || {
          text_length: textToEmbed.length,
          source: 'direct_upload',
          user_id: userId
        }
      };

      // If we have direct text, include it in metadata
      if (documentText) {
        requestPayload.metadata.inline_text = documentText;
      }

      const response = await axios.post(
        `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
        requestPayload,
        { 
          headers: { 
            'Authorization': userJWT, // Send user's Supabase JWT
            'Content-Type': 'application/json'
          },
          timeout: this.defaultTimeout
        }
      );

      errorLogger.success('RunPod embedding completed', {
        user_id: userId,
        document_ids: response.data.document_ids?.length || 0,
        chunk_count: response.data.chunk_count || 0,
        status: response.data.status
      });

      res.json({
        document_ids: response.data.document_ids || [],
        chunk_count: response.data.chunk_count || 0,
        embedding: response.data.embedding,
        dimensions: response.data.dimensions,
        processing_time: response.data.processing_time,
        user_id: userId,
        status: response.data.status || 'success',
        message: response.data.message || 'Embedding completed successfully'
      });

    } catch (error) {
      this.handleRunPodError('embedding', error, req, res);
    }
  }

  async handleChat(req, res) {
    try {
      const { message, context, history, top_k = 5, temperature = 0.7 } = req.body;
      const userId = req.userId;
      const userJWT = req.headers.authorization; // Get the full Authorization header
      
      if (!message || typeof message !== 'string') {
        errorLogger.warn('Invalid chat request - missing message', { user_id: userId });
        return res.status(400).json({ error: 'Message is required' });
      }

      if (!process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.warn('RunPod chat service not configured', { user_id: userId });
        return res.status(503).json({ error: 'RunPod chat service not configured' });
      }

      errorLogger.runpodRequest('chat', userId, {
        message_length: message.length,
        message_preview: message.substring(0, 100),
        has_context: !!(context || history),
        has_jwt: !!userJWT,
        top_k,
        temperature
      });

      // Based on your TxAgent repository, try different endpoint patterns
      const endpoints = [
        '/chat',           // Standard FastAPI chat endpoint
        '/api/chat',       // Alternative API path
        '/query',          // Alternative query endpoint
        '/ask'             // Alternative ask endpoint
      ];

      let lastError = null;
      
      for (const endpoint of endpoints) {
        try {
          errorLogger.info(`Trying TxAgent endpoint: ${endpoint}`, {
            user_id: userId,
            endpoint_url: `${process.env.RUNPOD_EMBEDDING_URL}${endpoint}`
          });

          // Prepare request payload - try multiple formats
          const requestPayloads = [
            // Format 1: Standard chat format
            {
              query: message,
              history: history || context || [],
              top_k: top_k,
              temperature: temperature,
              stream: false
            },
            // Format 2: Simple message format
            {
              message: message,
              context: history || context || [],
              max_results: top_k,
              temperature: temperature
            },
            // Format 3: Question format
            {
              question: message,
              chat_history: history || context || [],
              k: top_k,
              temperature: temperature
            }
          ];

          for (const payload of requestPayloads) {
            try {
              const response = await axios.post(
                `${process.env.RUNPOD_EMBEDDING_URL}${endpoint}`,
                payload,
                { 
                  headers: { 
                    'Authorization': userJWT, // Send user's Supabase JWT
                    'Content-Type': 'application/json'
                  },
                  timeout: this.chatTimeout
                }
              );

              errorLogger.success('RunPod chat completed', {
                user_id: userId,
                endpoint: endpoint,
                payload_format: requestPayloads.indexOf(payload) + 1,
                response_length: response.data.response?.length || response.data.answer?.length || 0,
                sources_count: response.data.sources?.length || 0,
                status: response.data.status
              });

              // Handle different response formats
              const chatResponse = response.data.response || response.data.answer || response.data.result || 'No response generated';
              const sources = response.data.sources || response.data.documents || [];

              return res.json({
                response: chatResponse,
                sources: sources,
                agent_id: 'txagent',
                processing_time: response.data.processing_time,
                timestamp: new Date().toISOString(),
                status: response.data.status || 'success',
                endpoint_used: endpoint,
                payload_format: requestPayloads.indexOf(payload) + 1
              });

            } catch (payloadError) {
              errorLogger.warn(`Payload format ${requestPayloads.indexOf(payload) + 1} failed for ${endpoint}`, {
                user_id: userId,
                error: payloadError.message,
                status: payloadError.response?.status
              });
              lastError = payloadError;
              continue;
            }
          }
        } catch (endpointError) {
          errorLogger.warn(`Endpoint ${endpoint} failed`, {
            user_id: userId,
            error: endpointError.message,
            status: endpointError.response?.status
          });
          lastError = endpointError;
          continue;
        }
      }

      // If all endpoints failed, throw the last error
      throw lastError || new Error('All TxAgent endpoints failed');

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
      response_data: error.response?.data,
      has_jwt: !!req.headers.authorization,
      runpod_url: process.env.RUNPOD_EMBEDDING_URL
    });
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ 
        error: `RunPod ${operation} request timeout`,
        details: 'The TxAgent container may be starting up or overloaded'
      });
    }
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: `RunPod ${operation} authentication failed`,
        details: 'Invalid or expired user token. Please check Supabase JWT configuration.'
      });
    }
    
    if (error.response?.status === 405) {
      return res.status(502).json({
        error: `RunPod ${operation} method not allowed`,
        details: 'TxAgent container endpoints may not be properly configured. Check /embed and /chat endpoints.'
      });
    }

    if (error.response?.status === 404) {
      return res.status(502).json({
        error: `RunPod ${operation} endpoint not found`,
        details: `Verify TxAgent container is running and ${operation} endpoint exists`
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: `RunPod ${operation} failed`,
        details: error.response.data?.detail || error.response.data?.error || error.response.statusText,
        debug_info: {
          status: error.response.status,
          url: process.env.RUNPOD_EMBEDDING_URL,
          endpoint: `/${operation}`
        }
      });
    }
    
    res.status(500).json({ 
      error: `Failed to process ${operation} request`,
      details: 'RunPod service unavailable',
      debug_info: {
        runpod_url: process.env.RUNPOD_EMBEDDING_URL,
        error_message: error.message
      }
    });
  }

  // Utility method to test RunPod connection with user JWT
  async testConnection(userJWT = null) {
    try {
      if (!process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.connectionCheck('RunPod', false, { reason: 'Missing configuration' });
        return false;
      }

      const headers = { 'Content-Type': 'application/json' };
      if (userJWT) {
        headers['Authorization'] = userJWT;
      }

      const response = await axios.get(
        `${process.env.RUNPOD_EMBEDDING_URL}/health`,
        { 
          headers,
          timeout: 5000
        }
      );

      errorLogger.connectionCheck('RunPod', true, { 
        status: response.status,
        health: response.data,
        authenticated: !!userJWT
      });
      return true;

    } catch (error) {
      errorLogger.connectionCheck('RunPod', false, { 
        error: error.message,
        code: error.code,
        status: error.response?.status,
        authenticated: !!userJWT,
        url: process.env.RUNPOD_EMBEDDING_URL
      });
      return false;
    }
  }
}

export const runpodService = new RunPodService();