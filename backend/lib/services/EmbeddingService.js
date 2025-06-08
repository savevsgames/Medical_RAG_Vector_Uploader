import axios from 'axios';
import { logger } from '../../agent_utils/shared/logger.js';

export class EmbeddingService {
  constructor() {
    this.runpodUrl = process.env.RUNPOD_EMBEDDING_URL;
    this.runpodKey = process.env.RUNPOD_EMBEDDING_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    logger.info('EmbeddingService initialized', {
      runpod_configured: !!this.runpodUrl,
      openai_configured: !!this.openaiKey,
      component: 'EmbeddingService'
    });
  }

  isConfigured() {
    return !!(this.runpodUrl && this.runpodKey) || !!this.openaiKey;
  }

  async generateEmbedding(text, userJWT = null) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text input is required for embedding generation');
    }

    const cleanText = text.trim().substring(0, 8000);
    
    try {
      // Try TxAgent BioBERT first with user's JWT (medical-specific)
      if (this.runpodUrl && userJWT) {
        logger.debug('Using TxAgent BioBERT with user JWT authentication', {
          component: 'EmbeddingService'
        });
        return await this.generateTxAgentEmbedding(cleanText, userJWT);
      }
      
      // Fallback to OpenAI if no JWT or TxAgent not available
      if (this.openaiKey) {
        logger.debug('Using OpenAI embedding service', {
          component: 'EmbeddingService'
        });
        return await this.generateOpenAIEmbedding(cleanText);
      }
      
      throw new Error('No embedding service configured or JWT token missing');
      
    } catch (error) {
      logger.error('Embedding generation failed', error, {
        component: 'EmbeddingService'
      });
      
      // If TxAgent fails, try OpenAI as fallback
      if (this.runpodUrl && this.openaiKey && userJWT) {
        logger.info('TxAgent failed, trying OpenAI fallback', {
          component: 'EmbeddingService'
        });
        try {
          return await this.generateOpenAIEmbedding(cleanText);
        } catch (fallbackError) {
          logger.error('OpenAI fallback also failed', fallbackError, {
            component: 'EmbeddingService'
          });
          throw new Error('All embedding services failed');
        }
      }
      
      throw error;
    }
  }

  async generateQueryEmbedding(query) {
    try {
      logger.info('Calling OpenAI embeddings API', {
        query_length: query.length,
        model: 'text-embedding-3-small',
        component: 'EmbeddingService'
      });

      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: 'text-embedding-3-small',
          input: query,
          encoding_format: 'float'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      logger.success('OpenAI embedding generated', {
        dimensions: response.data.data[0].embedding.length,
        usage: response.data.usage,
        component: 'EmbeddingService'
      });

      return response.data.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate query embedding', error, {
        error_response: error.response?.data,
        error_status: error.response?.status,
        component: 'EmbeddingService'
      });
      throw new Error(`Failed to generate query embedding: ${error.message}`);
    }
  }

  async generateTxAgentEmbedding(text, userJWT) {
    try {
      logger.debug('Calling TxAgent container for BioBERT embedding', {
        txagent_url: this.runpodUrl,
        text_length: text.length,
        component: 'EmbeddingService'
      });

      // CRITICAL FIX: Ensure clean URL without trailing slashes
      const embedUrl = `${this.runpodUrl.replace(/\/+$/, '')}/embed`;

      // CRITICAL FIX: Use explicit axios configuration to force POST method
      const axiosConfig = {
        method: 'POST',
        url: embedUrl,
        data: {
          file_path: `inline_text_${Date.now()}`,
          metadata: {
            text_length: text.length,
            source: 'direct_embedding',
            inline_text: text,
            timestamp: new Date().toISOString()
          }
        },
        headers: {
          'Authorization': userJWT,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      };

      logger.debug('Sending POST request to TxAgent /embed endpoint', {
        url: embedUrl,
        payload_size: JSON.stringify(axiosConfig.data).length,
        component: 'EmbeddingService'
      });

      const response = await axios(axiosConfig);

      logger.success('TxAgent embedding response received', {
        status: response.status,
        response_keys: Object.keys(response.data),
        component: 'EmbeddingService'
      });

      // Handle different TxAgent response formats
      if (response.data.embedding && Array.isArray(response.data.embedding)) {
        logger.success('Direct embedding received', {
          dimensions: response.data.embedding.length,
          component: 'EmbeddingService'
        });
        return response.data.embedding;
      }
      
      if (response.data.document_ids && response.data.document_ids.length > 0) {
        logger.info('Background processing initiated', {
          document_ids: response.data.document_ids.length,
          component: 'EmbeddingService'
        });
        throw new Error('TxAgent background processing - use fallback embedding');
      }
      
      throw new Error('Invalid TxAgent response format - no embedding found');
      
    } catch (error) {
      logger.error('TxAgent embedding failed', error, {
        container_url: this.runpodUrl,
        text_length: text?.length,
        component: 'EmbeddingService'
      });
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('TxAgent request timeout - container may be starting up');
      }
      
      if (error.response?.status === 401) {
        throw new Error('TxAgent authentication failed - invalid JWT token');
      }
      
      if (error.response?.status === 405) {
        throw new Error('TxAgent method not allowed - check container endpoints');
      }
      
      throw new Error(`TxAgent embedding failed: ${error.message}`);
    }
  }

  async generateOpenAIEmbedding(text) {
    try {
      logger.debug('Calling OpenAI embeddings API', {
        text_length: text.length,
        component: 'EmbeddingService'
      });
      
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text,
          encoding_format: 'float',
          dimensions: 768 // Force 768 dimensions to match Supabase documents table
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.data && response.data.data[0]) {
        logger.success('OpenAI embedding generated', {
          dimensions: response.data.data[0].embedding.length,
          usage: response.data.usage,
          component: 'EmbeddingService'
        });
        return response.data.data[0].embedding;
      }
      
      throw new Error('Invalid OpenAI response format');
      
    } catch (error) {
      if (error.response) {
        throw new Error(`OpenAI API error: ${error.response.data?.error?.message || error.response.statusText}`);
      }
      throw new Error(`OpenAI embedding failed: ${error.message}`);
    }
  }

  // Utility method to calculate cosine similarity
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}