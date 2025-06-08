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
      
      errorLogger.debug('Embedding request initiated', {
        user_id: userId,
        has_document_text: !!documentText,
        has_file_path: !!file_path,
        has_metadata: !!metadata,
        has_jwt: !!userJWT,
        jwt_preview: userJWT ? userJWT.substring(0, 50) + '...' : 'none',
        component: 'RunPodService.handleEmbedding'
      });

      // Support both direct text and file path
      const textToEmbed = documentText || file_path;
      
      if (!textToEmbed || typeof textToEmbed !== 'string') {
        errorLogger.warn('Invalid embedding request - missing document text or file path', { 
          user_id: userId,
          has_document_text: !!documentText,
          has_file_path: !!file_path,
          text_type: typeof textToEmbed,
          component: 'RunPodService.handleEmbedding'
        });
        return res.status(400).json({ error: 'Document text or file path is required' });
      }

      if (!process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.warn('RunPod embedding service not configured', { 
          user_id: userId,
          component: 'RunPodService.handleEmbedding'
        });
        return res.status(503).json({ error: 'RunPod embedding service not configured' });
      }

      errorLogger.runpodRequest('embed', userId, {
        text_length: textToEmbed.length,
        text_preview: textToEmbed.substring(0, 100),
        has_jwt: !!userJWT,
        has_metadata: !!metadata,
        request_method: 'POST'
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

      errorLogger.debug('Sending POST request to TxAgent /embed', {
        user_id: userId,
        endpoint: `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
        method: 'POST',
        payload: requestPayload,
        has_auth: !!userJWT,
        payload_size: JSON.stringify(requestPayload).length,
        component: 'RunPodService.handleEmbedding'
      });

      // FIXED: Ensure we're using a clean URL without double slashes
      const embedUrl = `${process.env.RUNPOD_EMBEDDING_URL.replace(/\/+$/, '')}/embed`;
      
      // FIXED: Use explicit axios configuration to force POST method
      const axiosConfig = {
        method: 'POST', // Explicitly set method
        url: embedUrl, // Clean URL without double slashes
        data: requestPayload, // Use 'data' property for POST body
        headers: { 
          'Authorization': userJWT, // Send user's Supabase JWT
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: this.defaultTimeout,
        // Force axios to use POST even with redirects
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 500; // Accept 4xx as valid to handle our own errors
        }
      };

      errorLogger.debug('🚀 AXIOS CONFIG - About to send embed request', {
        user_id: userId,
        method: axiosConfig.method,
        url: axiosConfig.url,
        has_auth: !!userJWT,
        payload_size: JSON.stringify(requestPayload).length,
        axios_method: axiosConfig.method,
        axios_url: axiosConfig.url,
        axios_timeout: axiosConfig.timeout,
        request_body_keys: Object.keys(requestPayload),
        component: 'RunPodService.handleEmbedding'
      });

      // FIXED: Use axios() with explicit config instead of axios.post()
      const response = await axios(axiosConfig);

      errorLogger.debug('TxAgent embedding response received', {
        user_id: userId,
        status: response.status,
        status_text: response.statusText,
        response_data: response.data,
        response_headers: response.headers,
        component: 'RunPodService.handleEmbedding'
      });

      errorLogger.success('RunPod embedding completed', {
        user_id: userId,
        document_ids: response.data.document_ids?.length || 0,
        chunk_count: response.data.chunk_count || 0,
        status: response.data.status,
        response_status: response.status
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
      
      errorLogger.debug('Chat request initiated', {
        user_id: userId,
        message_length: message?.length || 0,
        message_preview: message ? message.substring(0, 100) : 'none',
        has_context: !!(context || history),
        has_jwt: !!userJWT,
        jwt_preview: userJWT ? userJWT.substring(0, 50) + '...' : 'none',
        top_k,
        temperature,
        component: 'RunPodService.handleChat'
      });
      
      if (!message || typeof message !== 'string') {
        errorLogger.warn('Invalid chat request - missing message', { 
          user_id: userId,
          message_type: typeof message,
          message_length: message?.length || 0,
          component: 'RunPodService.handleChat'
        });
        return res.status(400).json({ error: 'Message is required' });
      }

      if (!process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.warn('RunPod chat service not configured', { 
          user_id: userId,
          component: 'RunPodService.handleChat'
        });
        return res.status(503).json({ error: 'RunPod chat service not configured' });
      }

      errorLogger.runpodRequest('chat', userId, {
        message_length: message.length,
        message_preview: message.substring(0, 100),
        has_context: !!(context || history),
        has_jwt: !!userJWT,
        top_k,
        temperature,
        request_method: 'POST'
      });

      // FIXED: Ensure we're using a clean URL without double slashes
      const chatUrl = `${process.env.RUNPOD_EMBEDDING_URL.replace(/\/+$/, '')}/chat`;

      // CRITICAL FIX: Ensure we have a proper request body that axios won't convert to GET
      const requestPayload = {
        query: message,
        history: history || context || [],
        top_k: top_k,
        temperature: temperature,
        // CRITICAL: Add a timestamp to ensure body is never empty/null
        timestamp: new Date().toISOString(),
        user_id: userId
      };

      // CRITICAL FIX: Use explicit axios configuration to force POST method
      const axiosConfig = {
        method: 'POST', // Explicitly set method
        url: chatUrl, // Clean URL without double slashes
        data: requestPayload, // Use 'data' property for POST body
        headers: { 
          'Authorization': userJWT,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: this.chatTimeout,
        // CRITICAL: Force axios to use POST even with redirects
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 500; // Accept 4xx as valid to handle our own errors
        }
      };

      errorLogger.debug('🚀 AXIOS CONFIG - About to send chat request', {
        user_id: userId,
        method: axiosConfig.method,
        url: axiosConfig.url,
        has_auth: !!userJWT,
        payload_size: JSON.stringify(requestPayload).length,
        axios_method: axiosConfig.method,
        axios_url: axiosConfig.url,
        axios_timeout: axiosConfig.timeout,
        request_body_keys: Object.keys(requestPayload),
        component: 'RunPodService.handleChat'
      });

      // CRITICAL FIX: Use axios() with explicit config instead of axios.post()
      const response = await axios(axiosConfig);

      // CRITICAL DEBUG: Log what axios actually sent and received
      errorLogger.debug('📨 AXIOS RESPONSE - Request completed', {
        user_id: userId,
        sent_method: response.config?.method?.toUpperCase() || 'UNKNOWN',
        sent_url: response.config?.url || 'UNKNOWN',
        response_status: response.status,
        response_status_text: response.statusText,
        response_headers: response.headers,
        request_method_from_config: response.config?.method,
        request_method_from_request: response.request?.method,
        component: 'RunPodService.handleChat'
      });

      errorLogger.success('RunPod chat completed', {
        user_id: userId,
        response_length: response.data.response?.length || response.data.answer?.length || 0,
        sources_count: response.data.sources?.length || 0,
        status: response.data.status,
        response_status: response.status,
        sent_method: response.config?.method?.toUpperCase()
      });

      // Handle TxAgent response format
      const chatResponse = response.data.response || response.data.answer || response.data.result || 'No response generated';
      const sources = response.data.sources || response.data.documents || [];

      return res.json({
        response: chatResponse,
        sources: sources,
        agent_id: 'txagent',
        processing_time: response.data.processing_time,
        timestamp: new Date().toISOString(),
        status: response.data.status || 'success',
        endpoint_used: '/chat'
      });

    } catch (error) {
      this.handleRunPodError('chat', error, req, res);
    }
  }

  handleRunPodError(operation, error, req, res) {
    const userId = req.userId;
    
    // CRITICAL DEBUG: Log detailed error information including method details
    errorLogger.runpodError(operation, error, {
      user_id: userId,
      error_code: error.code,
      error_type: error.constructor.name,
      response_status: error.response?.status,
      response_data: error.response?.data,
      response_headers: error.response?.headers,
      has_jwt: !!req.headers.authorization,
      runpod_url: process.env.RUNPOD_EMBEDDING_URL,
      request_method: 'POST',
      // ENHANCED: Log axios configuration details from error
      axios_config: error.config ? {
        method: error.config.method?.toUpperCase(),
        url: error.config.url,
        timeout: error.config.timeout,
        headers: error.config.headers ? Object.keys(error.config.headers) : [],
        data_size: error.config.data ? JSON.stringify(error.config.data).length : 0
      } : null,
      // ENHANCED: Log request details if available
      axios_request: error.request ? {
        method: error.request.method,
        path: error.request.path,
        host: error.request.host,
        protocol: error.request.protocol
      } : null,
      component: `RunPodService.handleRunPodError.${operation}`
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
      // ENHANCED: Provide more detailed 405 error information
      return res.status(502).json({
        error: `RunPod ${operation} method not allowed`,
        details: 'TxAgent container endpoints may not be properly configured. Verify POST endpoints are available.',
        debug_info: {
          sent_method: error.config?.method?.toUpperCase() || 'UNKNOWN',
          endpoint: error.config?.url || 'UNKNOWN',
          expected_method: 'POST',
          container_response: error.response?.data
        }
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
          endpoint: `/${operation}`,
          method: 'POST',
          sent_method: error.config?.method?.toUpperCase() || 'UNKNOWN'
        }
      });
    }
    
    res.status(500).json({ 
      error: `Failed to process ${operation} request`,
      details: 'RunPod service unavailable',
      debug_info: {
        runpod_url: process.env.RUNPOD_EMBEDDING_URL,
        error_message: error.message,
        method: 'POST',
        sent_method: error.config?.method?.toUpperCase() || 'UNKNOWN'
      }
    });
  }

  // Utility method to test RunPod connection with user JWT
  async testConnection(userJWT = null) {
    try {
      if (!process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.connectionCheck('RunPod', false, { 
          reason: 'Missing configuration',
          component: 'RunPodService.testConnection'
        });
        return false;
      }

      const headers = { 'Content-Type': 'application/json' };
      if (userJWT) {
        headers['Authorization'] = userJWT;
      }

      errorLogger.debug('Testing RunPod connection', {
        url: process.env.RUNPOD_EMBEDDING_URL,
        method: 'GET',
        endpoint: '/health',
        has_auth: !!userJWT,
        component: 'RunPodService.testConnection'
      });

      const response = await axios.get(
        `${process.env.RUNPOD_EMBEDDING_URL.replace(/\/+$/, '')}/health`,
        { 
          headers,
          timeout: 5000
        }
      );

      errorLogger.debug('RunPod connection test successful', {
        status: response.status,
        status_text: response.statusText,
        response_data: response.data,
        authenticated: !!userJWT,
        component: 'RunPodService.testConnection'
      });

      errorLogger.connectionCheck('RunPod', true, { 
        status: response.status,
        health: response.data,
        authenticated: !!userJWT
      });
      return true;

    } catch (error) {
      errorLogger.debug('RunPod connection test failed', {
        error: error.message,
        error_type: error.constructor.name,
        code: error.code,
        status: error.response?.status,
        response_data: error.response?.data,
        authenticated: !!userJWT,
        url: process.env.RUNPOD_EMBEDDING_URL,
        component: 'RunPodService.testConnection'
      });

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