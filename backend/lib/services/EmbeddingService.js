import axios from 'axios';
import { config } from '../../config/environment.js';
import { errorLogger } from '../../agent_utils/shared/logger.js';

export class EmbeddingService {
  constructor() {
    this.runpodUrl = config.runpod.url;
    this.runpodKey = config.runpod.key;
    this.openaiKey = config.openai.apiKey;
    
    errorLogger.info('EmbeddingService initialized', {
      runpod_configured: !!this.runpodUrl,
      openai_configured: !!this.openaiKey,
      component: 'EmbeddingService'
    });
  }

  /**
   * Generate embedding for queries (chat search)
   * @param {string} text - Query text to embed
   * @param {string} userJWT - User JWT token for authentication
   * @returns {Promise<number[]>} - 768-dimensional embedding vector
   */
  async generateQueryEmbedding(text, userJWT = null) {
    return this._generateEmbedding(text, userJWT, 'query');
  }

  /**
   * Generate embedding for documents (upload processing)
   * @param {string} text - Document text to embed
   * @param {string} userJWT - User JWT token for authentication
   * @returns {Promise<number[]>} - 768-dimensional embedding vector
   */
  async generateEmbedding(text, userJWT = null) {
    return this._generateEmbedding(text, userJWT, 'document');
  }

  /**
   * Internal method to generate embeddings with type-specific handling
   * @param {string} text - Text to embed
   * @param {string} userJWT - User JWT token for authentication
   * @param {string} type - Type of embedding ('query' or 'document')
   * @returns {Promise<number[]>} - 768-dimensional embedding vector
   * @private
   */
  async _generateEmbedding(text, userJWT = null, type = 'document') {
    const startTime = Date.now();
    
    errorLogger.debug('Starting embedding generation', {
      text_length: text.length,
      text_preview: text.substring(0, 100),
      type,
      has_jwt: !!userJWT,
      runpod_available: !!this.runpodUrl,
      openai_available: !!this.openaiKey,
      component: 'EmbeddingService'
    });

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Invalid text input for embedding generation');
    }

    // Try TxAgent (RunPod) first if available
    if (this.runpodUrl && this.runpodKey) {
      try {
        const embedding = await this._generateTxAgentEmbedding(text, userJWT, type);
        
        const processingTime = Date.now() - startTime;
        errorLogger.success('TxAgent embedding completed', {
          type,
          text_length: text.length,
          embedding_dimensions: embedding.length,
          processing_time_ms: processingTime,
          component: 'EmbeddingService'
        });
        
        return embedding;
      } catch (error) {
        errorLogger.warn('TxAgent embedding failed, falling back to OpenAI', {
          type,
          error: error.message,
          error_code: error.code,
          status: error.response?.status,
          component: 'EmbeddingService'
        });
      }
    }

    // Fallback to OpenAI
    if (this.openaiKey) {
      try {
        const embedding = await this._generateOpenAIEmbedding(text, type);
        
        const processingTime = Date.now() - startTime;
        errorLogger.success('OpenAI embedding completed', {
          type,
          text_length: text.length,
          embedding_dimensions: embedding.length,
          processing_time_ms: processingTime,
          component: 'EmbeddingService'
        });
        
        return embedding;
      } catch (error) {
        errorLogger.error('OpenAI embedding failed', error, {
          type,
          text_length: text.length,
          component: 'EmbeddingService'
        });
        throw error;
      }
    }

    throw new Error('No embedding service available (neither TxAgent nor OpenAI configured)');
  }

  /**
   * Generate embedding using TxAgent (BioBERT) via RunPod
   * @param {string} text - Text to embed
   * @param {string} userJWT - User JWT token
   * @param {string} type - Embedding type
   * @returns {Promise<number[]>} - 768-dimensional embedding vector
   * @private
   */
  async _generateTxAgentEmbedding(text, userJWT, type) {
    const embedUrl = `${this.runpodUrl.replace(/\/+$/, '')}/embed`;
    
    const requestPayload = {
      text: text,
      metadata: {
        type,
        timestamp: new Date().toISOString(),
        text_length: text.length
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.runpodKey
    };

    // Add user JWT if provided
    if (userJWT) {
      headers['Authorization'] = userJWT.startsWith('Bearer ') ? userJWT : `Bearer ${userJWT}`;
    }

    errorLogger.debug('TxAgent embedding request', {
      url: embedUrl,
      type,
      text_length: text.length,
      has_jwt: !!userJWT,
      has_api_key: !!this.runpodKey,
      component: 'EmbeddingService'
    });

    try {
      const response = await axios.post(embedUrl, requestPayload, {
        headers,
        timeout: 30000, // 30 second timeout
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      if (response.status !== 200) {
        throw new Error(`TxAgent embedding failed: HTTP ${response.status} - ${response.data?.error || response.statusText}`);
      }

      const embedding = response.data?.embedding || response.data?.vector || response.data;
      
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding response from TxAgent');
      }

      // Validate embedding dimensions (BioBERT should return 768 dimensions)
      if (embedding.length !== 768) {
        errorLogger.warn('Unexpected embedding dimensions from TxAgent', {
          expected: 768,
          actual: embedding.length,
          type,
          component: 'EmbeddingService'
        });
      }

      return embedding;

    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new Error('TxAgent container unreachable');
      }
      
      if (error.response?.status === 401) {
        throw new Error('TxAgent authentication failed - invalid JWT');
      }
      
      if (error.response?.status === 429) {
        throw new Error('TxAgent rate limit exceeded');
      }

      // Re-throw with original message for other errors
      throw error;
    }
  }

  /**
   * Generate embedding using OpenAI
   * @param {string} text - Text to embed
   * @param {string} type - Embedding type
   * @returns {Promise<number[]>} - 1536-dimensional embedding vector
   * @private
   */
  async _generateOpenAIEmbedding(text, type) {
    const embedUrl = 'https://api.openai.com/v1/embeddings';
    
    const requestPayload = {
      input: text,
      model: 'text-embedding-ada-002',
      encoding_format: 'float'
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.openaiKey}`
    };

    errorLogger.debug('OpenAI embedding request', {
      url: embedUrl,
      type,
      text_length: text.length,
      model: requestPayload.model,
      component: 'EmbeddingService'
    });

    try {
      const response = await axios.post(embedUrl, requestPayload, {
        headers,
        timeout: 30000, // 30 second timeout
        validateStatus: (status) => status < 500
      });

      if (response.status !== 200) {
        throw new Error(`OpenAI embedding failed: HTTP ${response.status} - ${response.data?.error?.message || response.statusText}`);
      }

      const embedding = response.data?.data?.[0]?.embedding;
      
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding response from OpenAI');
      }

      // OpenAI ada-002 returns 1536 dimensions
      if (embedding.length !== 1536) {
        errorLogger.warn('Unexpected embedding dimensions from OpenAI', {
          expected: 1536,
          actual: embedding.length,
          type,
          component: 'EmbeddingService'
        });
      }

      return embedding;

    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('OpenAI authentication failed - invalid API key');
      }
      
      if (error.response?.status === 429) {
        throw new Error('OpenAI rate limit exceeded');
      }
      
      if (error.response?.status === 400) {
        throw new Error(`OpenAI request invalid: ${error.response.data?.error?.message || 'Bad request'}`);
      }

      // Re-throw with original message for other errors
      throw error;
    }
  }

  /**
   * Get embedding service status and capabilities
   * @returns {Object} - Service status information
   */
  getServiceStatus() {
    return {
      txagent: {
        available: !!(this.runpodUrl && this.runpodKey),
        url: this.runpodUrl,
        dimensions: 768,
        model: 'BioBERT'
      },
      openai: {
        available: !!this.openaiKey,
        dimensions: 1536,
        model: 'text-embedding-ada-002'
      }
    };
  }

  /**
   * Validate embedding vector
   * @param {number[]} embedding - Embedding vector to validate
   * @param {string} source - Source of the embedding ('txagent' or 'openai')
   * @returns {boolean} - Whether the embedding is valid
   */
  validateEmbedding(embedding, source = 'unknown') {
    if (!Array.isArray(embedding)) {
      errorLogger.error('Embedding validation failed: not an array', {
        embedding_type: typeof embedding,
        source,
        component: 'EmbeddingService'
      });
      return false;
    }

    if (embedding.length === 0) {
      errorLogger.error('Embedding validation failed: empty array', {
        source,
        component: 'EmbeddingService'
      });
      return false;
    }

    // Check for expected dimensions
    const expectedDimensions = source === 'txagent' ? 768 : source === 'openai' ? 1536 : null;
    if (expectedDimensions && embedding.length !== expectedDimensions) {
      errorLogger.warn('Embedding dimensions mismatch', {
        expected: expectedDimensions,
        actual: embedding.length,
        source,
        component: 'EmbeddingService'
      });
    }

    // Check for valid numbers
    const hasInvalidValues = embedding.some(val => typeof val !== 'number' || !isFinite(val));
    if (hasInvalidValues) {
      errorLogger.error('Embedding validation failed: contains invalid values', {
        source,
        sample_values: embedding.slice(0, 5),
        component: 'EmbeddingService'
      });
      return false;
    }

    return true;
  }
}