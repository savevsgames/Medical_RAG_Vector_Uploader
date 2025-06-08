import axios from 'axios';

export class EmbeddingService {
  constructor() {
    this.runpodUrl = process.env.RUNPOD_EMBEDDING_URL;
    this.runpodKey = process.env.RUNPOD_EMBEDDING_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    console.log('EmbeddingService initialized');
    console.log(`RunPod configured: ${!!this.runpodUrl}`);
    console.log(`OpenAI configured: ${!!this.openaiKey}`);
  }

  isConfigured() {
    return !!(this.runpodUrl && this.runpodKey) || !!this.openaiKey;
  }

  // CRITICAL FIX: Updated to accept userJWT parameter
  async generateEmbedding(text, userJWT = null) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text input is required for embedding generation');
    }

    // Clean and truncate text if needed
    const cleanText = text.trim().substring(0, 8000); // Limit to prevent token overflow
    
    try {
      // CRITICAL FIX: Try TxAgent BioBERT first with user's JWT (medical-specific)
      if (this.runpodUrl && userJWT) {
        console.log('🔧 Using TxAgent BioBERT with user JWT authentication');
        return await this.generateTxAgentEmbedding(cleanText, userJWT);
      }
      
      // Fallback to OpenAI if no JWT or TxAgent not available
      if (this.openaiKey) {
        console.log('🔧 Falling back to OpenAI embedding service');
        return await this.generateOpenAIEmbedding(cleanText);
      }
      
      throw new Error('No embedding service configured or JWT token missing');
      
    } catch (error) {
      console.error('Embedding generation failed:', error);
      
      // If TxAgent fails, try OpenAI as fallback
      if (this.runpodUrl && this.openaiKey && userJWT) {
        console.log('TxAgent failed, trying OpenAI fallback...');
        try {
          return await this.generateOpenAIEmbedding(cleanText);
        } catch (fallbackError) {
          console.error('OpenAI fallback also failed:', fallbackError);
          throw new Error('All embedding services failed');
        }
      }
      
      throw error;
    }
  }

  // CRITICAL FIX: New method for TxAgent container with proper JWT authentication
  async generateTxAgentEmbedding(text, userJWT) {
    try {
      console.log('🚀 Calling TxAgent container for BioBERT embedding');
      console.log(`📍 TxAgent URL: ${this.runpodUrl}`);
      console.log(`🔐 Using user JWT authentication: ${userJWT ? 'YES' : 'NO'}`);
      console.log(`📝 Text length: ${text.length} characters`);

      // CRITICAL FIX: Use user's Supabase JWT instead of RunPod API key
      const response = await axios.post(
        `${this.runpodUrl}/embed`,
        {
          file_path: `inline_text_${Date.now()}`,
          metadata: {
            text_length: text.length,
            source: 'direct_embedding',
            inline_text: text,
            timestamp: new Date().toISOString()
          }
        },
        {
          headers: {
            'Authorization': userJWT, // CRITICAL: Use user's JWT, not RunPod key
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      console.log('✅ TxAgent embedding response received');
      console.log(`📊 Response status: ${response.status}`);
      console.log(`📋 Response data keys: ${Object.keys(response.data)}`);

      // Handle different TxAgent response formats
      if (response.data.embedding && Array.isArray(response.data.embedding)) {
        console.log(`🎯 Direct embedding received: ${response.data.embedding.length} dimensions`);
        return response.data.embedding;
      }
      
      if (response.data.document_ids && response.data.document_ids.length > 0) {
        console.log(`📄 Background processing initiated: ${response.data.document_ids.length} documents`);
        // For background processing, we need to return a placeholder embedding
        // The actual embeddings will be stored in the database by the TxAgent
        throw new Error('TxAgent background processing - use fallback embedding');
      }
      
      throw new Error('Invalid TxAgent response format - no embedding found');
      
    } catch (error) {
      console.error('❌ TxAgent embedding failed:', error.message);
      
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

  // LEGACY: Keep RunPod method for backward compatibility (but not used with JWT)
  async generateRunPodEmbedding(text) {
    try {
      console.log('⚠️  LEGACY: Using RunPod API key method (deprecated)');
      
      const response = await axios.post(
        this.runpodUrl,
        {
          input: {
            text: text,
            normalize: true,
            truncate: true
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.runpodKey}`, // Legacy RunPod API key
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      if (response.data && response.data.output && response.data.output.embedding) {
        return response.data.output.embedding;
      }
      
      throw new Error('Invalid RunPod response format');
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('RunPod request timeout');
      }
      throw new Error(`RunPod embedding failed: ${error.message}`);
    }
  }

  async generateOpenAIEmbedding(text) {
    try {
      console.log('🤖 Calling OpenAI embeddings API');
      console.log(`📝 Text length: ${text.length} characters`);
      
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
        console.log(`✅ OpenAI embedding generated: ${response.data.data[0].embedding.length} dimensions`);
        console.log(`📊 Usage: ${JSON.stringify(response.data.usage)}`);
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