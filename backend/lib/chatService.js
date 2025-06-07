import axios from 'axios';
import { errorLogger } from '../agent_utils/errorLogger.js';

export class ChatService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    console.log('ChatService initialized');
    console.log(`OpenAI configured: ${!!this.openaiKey}`);
    
    errorLogger.info('ChatService initialized', {
      openai_configured: !!this.openaiKey,
      supabase_configured: !!supabaseClient
    });
  }

  async processQuery(userId, query) {
    if (!this.openaiKey) {
      errorLogger.error('OpenAI API key not configured for chat processing', null, {
        user_id: userId
      });
      throw new Error('OpenAI API key not configured');
    }

    errorLogger.info('Processing chat query', {
      user_id: userId,
      query_length: query.length,
      query_preview: query.substring(0, 100)
    });

    try {
      // Step 1: Generate embedding for the query
      errorLogger.info('Generating query embedding', {
        user_id: userId,
        query_length: query.length
      });
      
      const queryEmbedding = await this.generateQueryEmbedding(query);
      
      // Step 2: Search for relevant documents
      errorLogger.info('Searching for relevant documents', {
        user_id: userId,
        embedding_dimensions: queryEmbedding.length
      });
      
      const relevantDocs = await this.searchRelevantDocuments(userId, queryEmbedding);
      
      // Step 3: Generate response using RAG
      errorLogger.info('Generating RAG response', {
        user_id: userId,
        relevant_docs_count: relevantDocs.length
      });
      
      const response = await this.generateRAGResponse(query, relevantDocs);
      
      errorLogger.success('Chat query processed successfully', {
        user_id: userId,
        response_length: response.length,
        sources_count: relevantDocs.length
      });
      
      return {
        response: response,
        sources: relevantDocs.map(doc => ({
          filename: doc.filename,
          similarity: doc.similarity
        }))
      };
      
    } catch (error) {
      errorLogger.error('Query processing failed', error, {
        user_id: userId,
        query_length: query.length,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async generateQueryEmbedding(query) {
    try {
      errorLogger.info('Calling OpenAI embeddings API', {
        query_length: query.length,
        model: 'text-embedding-3-small'
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

      errorLogger.success('OpenAI embedding generated', {
        dimensions: response.data.data[0].embedding.length,
        usage: response.data.usage
      });

      return response.data.data[0].embedding;
    } catch (error) {
      errorLogger.error('Failed to generate query embedding', error, {
        error_response: error.response?.data,
        error_status: error.response?.status
      });
      throw new Error(`Failed to generate query embedding: ${error.message}`);
    }
  }

  async searchRelevantDocuments(userId, queryEmbedding, limit = 5, threshold = 0.7) {
    try {
      errorLogger.info('Executing vector similarity search', {
        user_id: userId,
        embedding_dimensions: queryEmbedding.length,
        match_threshold: threshold,
        match_count: limit
      });

      // Use Supabase's vector similarity search
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        user_id: userId
      });

      if (error) {
        errorLogger.error('Vector search error', error, {
          user_id: userId,
          error_code: error.code,
          error_details: error.details
        });
        
        // Fallback to regular document search if vector search fails
        errorLogger.warn('Falling back to regular document search', {
          user_id: userId
        });
        return await this.fallbackDocumentSearch(userId);
      }

      errorLogger.success('Vector search completed', {
        user_id: userId,
        results_count: data?.length || 0,
        results_preview: data?.slice(0, 3).map(d => ({
          filename: d.filename,
          similarity: d.similarity
        })) || []
      });

      return data || [];
    } catch (error) {
      errorLogger.error('Document search failed', error, {
        user_id: userId,
        error_stack: error.stack
      });
      return await this.fallbackDocumentSearch(userId);
    }
  }

  async fallbackDocumentSearch(userId, limit = 3) {
    try {
      errorLogger.info('Executing fallback document search', {
        user_id: userId,
        limit: limit
      });

      const { data, error } = await this.supabase
        .from('documents')
        .select('filename, content')
        .eq('user_id', userId)
        .limit(limit);

      if (error) {
        errorLogger.error('Fallback document search failed', error, {
          user_id: userId,
          error_code: error.code
        });
        throw error;
      }

      const results = (data || []).map(doc => ({
        ...doc,
        similarity: 0.5 // Default similarity for fallback
      }));

      errorLogger.info('Fallback document search completed', {
        user_id: userId,
        results_count: results.length
      });

      return results;
    } catch (error) {
      errorLogger.error('Fallback document search failed', error, {
        user_id: userId,
        error_stack: error.stack
      });
      return [];
    }
  }

  async generateRAGResponse(query, relevantDocs) {
    try {
      // Prepare context from relevant documents
      const context = relevantDocs
        .map(doc => `Document: ${doc.filename}\nContent: ${doc.content?.substring(0, 1000) || 'No content available'}`)
        .join('\n\n');

      const systemPrompt = `You are a helpful medical AI assistant. Use the provided document context to answer the user's question. If the context doesn't contain relevant information, say so clearly. Always cite which documents you're referencing.

Context from user's documents:
${context}

Instructions:
- Provide accurate, helpful responses based on the document context
- If information is not in the documents, clearly state this
- Cite specific documents when referencing information
- Be concise but thorough
- Use medical terminology appropriately but explain complex terms`;

      errorLogger.info('Calling OpenAI chat completion', {
        query_length: query.length,
        context_length: context.length,
        documents_count: relevantDocs.length,
        model: 'gpt-3.5-turbo'
      });

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          max_tokens: 500,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const generatedResponse = response.data.choices[0].message.content;

      errorLogger.success('OpenAI chat completion generated', {
        response_length: generatedResponse.length,
        usage: response.data.usage,
        finish_reason: response.data.choices[0].finish_reason
      });

      return generatedResponse;
    } catch (error) {
      if (error.response?.status === 429) {
        errorLogger.error('OpenAI rate limit exceeded', error, {
          error_response: error.response?.data
        });
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }
      
      errorLogger.error('Failed to generate RAG response', error, {
        error_response: error.response?.data,
        error_status: error.response?.status,
        error_stack: error.stack
      });
      
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}