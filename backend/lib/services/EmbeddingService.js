import axios from 'axios';
import OpenAI from 'openai';
import { config } from '../../config/environment.js';
import { errorLogger } from '../../agent_utils/shared/logger.js';

export class EmbeddingService {
  constructor() {
    this.openai = config.openai.apiKey ? new OpenAI({
      apiKey: config.openai.apiKey
    }) : null;
    
    errorLogger.info('EmbeddingService initialized', {
      runpod_configured: !!config.runpod.url,
      openai_configured: !!config.openai.apiKey,
      component: 'EmbeddingService'
    });
  }

  async generateEmbedding(text, userJWT = null) {
    // Try TxAgent first if configured and JWT is provided
    if (config.runpod.url && userJWT) {
      try {
        return await this.generateTxAgentEmbedding(text, userJWT);
      } catch (error) {
        errorLogger.warn('TxAgent embedding failed, using local service', {
          error: error.message,
          error_code: error.code,
          status: error.response?.status,
          component: 'EmbeddingService'
        });
        
        // Fall back to OpenAI
        if (this.openai) {
          errorLogger.info('TxAgent failed, trying OpenAI fallback', {
            component: 'EmbeddingService'
          });
          return await this.generateOpenAIEmbedding(text);
        }
        
        throw new Error('No embedding service available');
      }
    }
    
    // Use OpenAI if TxAgent not available
    if (this.openai) {
      return await this.generateOpenAIEmbedding(text);
    }
    
    throw new Error('No embedding service configured');
  }

  async generateTxAgentEmbedding(text, userJWT) {
    if (!config.runpod.url) {
      throw new Error('TxAgent URL not configured');
    }

    if (!userJWT) {
      throw new Error('User JWT required for TxAgent embedding');
    }

    // Clean the JWT - remove 'Bearer ' prefix if present
    const cleanJWT = userJWT.replace(/^Bearer\s+/i, '');

    const url = `${config.runpod.url.replace(/\/+$/, '')}/embed`;
    
    errorLogger.debug('TxAgent embedding request', {
      url,
      text_length: text.length,
      has_jwt: !!cleanJWT,
      component: 'EmbeddingService'
    });

    try {
      const response = await axios.post(url, {
        text: text.trim(),
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'document_upload'
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cleanJWT}`,
          'Accept': 'application/json'
        },
        timeout: 30000, // 30 second timeout
        validateStatus: function (status) {
          return status < 500; // Don't throw for 4xx errors, we want to handle them
        }
      });

      if (response.status === 401) {
        throw new Error('Authentication failed - invalid or expired JWT token');
      }

      if (response.status === 403) {
        throw new Error('Access forbidden - insufficient permissions');
      }

      if (response.status >= 400) {
        const errorData = response.data || {};
        throw new Error(`TxAgent embedding failed: ${errorData.detail || errorData.error || `HTTP ${response.status}`}`);
      }

      if (!response.data || !response.data.embedding) {
        throw new Error('Invalid response from TxAgent - missing embedding data');
      }

      const embedding = response.data.embedding;
      
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding format from TxAgent');
      }

      errorLogger.success('TxAgent embedding generated', {
        dimensions: embedding.length,
        processing_time: response.data.processing_time,
        component: 'EmbeddingService'
      });

      return embedding;

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        errorLogger.error('TxAgent container unreachable', {
          container_url: config.runpod.url,
          error_message: 'Connection refused',
          component: 'EmbeddingService'
        });
        throw new Error('TxAgent container is not reachable');
      }

      if (error.code === 'ETIMEDOUT') {
        errorLogger.error('TxAgent embedding timeout', {
          container_url: config.runpod.url,
          text_length: text.length,
          component: 'EmbeddingService'
        });
        throw new Error('TxAgent embedding request timed out');
      }

      if (axios.isAxiosError(error)) {
        errorLogger.error('TxAgent embedding failed', {
          container_url: config.runpod.url,
          text_length: text.length,
          component: 'EmbeddingService',
          error_message: error.message,
          error_stack: error.stack,
          error_code: error.code,
          response_status: error.response?.status,
          response_data: error.response?.data
        });
        
        if (error.response?.status === 500) {
          throw new Error('TxAgent internal server error - container may be overloaded or misconfigured');
        }
        
        throw new Error(`TxAgent embedding failed: ${error.message}`);
      }

      // Re-throw if it's already our custom error
      if (error.message.includes('TxAgent') || error.message.includes('Authentication') || error.message.includes('Access forbidden')) {
        throw error;
      }

      errorLogger.error('Embedding generation failed', {
        component: 'EmbeddingService',
        error_message: error.message,
        error_stack: error.stack
      });

      throw new Error(`TxAgent embedding failed: ${error.message}`);
    }
  }

  async generateOpenAIEmbedding(text) {
    if (!this.openai) {
      throw new Error('OpenAI not configured');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.trim(),
        dimensions: 768 // Match BioBERT dimensions
      });

      const embedding = response.data[0].embedding;
      
      errorLogger.success('OpenAI embedding generated', {
        dimensions: embedding.length,
        usage: response.usage,
        component: 'EmbeddingService'
      });

      return embedding;

    } catch (error) {
      errorLogger.error('OpenAI embedding failed', {
        component: 'EmbeddingService',
        error_message: error.message,
        error_stack: error.stack
      });
      
      throw new Error(`OpenAI embedding failed: ${error.message}`);
    }
  }
}