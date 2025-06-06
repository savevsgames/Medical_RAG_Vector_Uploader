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

  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text input is required for embedding generation');
    }

    // Clean and truncate text if needed
    const cleanText = text.trim().substring(0, 8000); // Limit to prevent token overflow
    
    try {
      // Try RunPod BioBERT first (medical-specific)
      if (this.runpodUrl && this.runpodKey) {
        return await this.generateRunPodEmbedding(cleanText);
      }
      
      // Fallback to OpenAI
      if (this.openaiKey) {
        return await this.generateOpenAIEmbedding(cleanText);
      }
      
      throw new Error('No embedding service configured');
      
    } catch (error) {
      console.error('Embedding generation failed:', error);
      
      // If RunPod fails, try OpenAI as fallback
      if (this.runpodUrl && this.openaiKey) {
        console.log('RunPod failed, trying OpenAI fallback...');
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

  async generateRunPodEmbedding(text) {
    try {
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
            'Authorization': `Bearer ${this.runpodKey}`,
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
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text,
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

      if (response.data && response.data.data && response.data.data[0]) {
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