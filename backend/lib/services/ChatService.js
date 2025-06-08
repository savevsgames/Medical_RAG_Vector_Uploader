import { errorLogger } from '../../agent_utils/shared/logger.js';
import { EmbeddingService } from './EmbeddingService.js';
import { DocumentSearchService } from './DocumentSearchService.js';
import { ResponseGenerationService } from './ResponseGenerationService.js';

export class ChatService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.embeddingService = new EmbeddingService();
    this.searchService = new DocumentSearchService(supabaseClient);
    this.responseService = new ResponseGenerationService();
    
    errorLogger.info('ChatService initialized', {
      openai_configured: this.responseService.isConfigured(),
      supabase_configured: !!supabaseClient,
      component: 'ChatService'
    });
  }

  async processQuery(userId, query) {
    if (!this.responseService.isConfigured()) {
      errorLogger.error('OpenAI API key not configured for chat processing', null, {
        user_id: userId,
        component: 'ChatService'
      });
      throw new Error('OpenAI API key not configured');
    }

    errorLogger.info('Processing chat query', {
      user_id: userId,
      query_length: query.length,
      query_preview: query.substring(0, 100),
      component: 'ChatService'
    });

    try {
      // Step 1: Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(query);
      
      // Step 2: Search for relevant documents
      const relevantDocs = await this.searchService.searchRelevantDocuments(userId, queryEmbedding);
      
      // Step 3: Generate response using RAG
      const response = await this.responseService.generateRAGResponse(query, relevantDocs);
      
      errorLogger.success('Chat query processed successfully', {
        user_id: userId,
        response_length: response.length,
        sources_count: relevantDocs.length,
        component: 'ChatService'
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
        error_stack: error.stack,
        component: 'ChatService'
      });
      throw error;
    }
  }
}