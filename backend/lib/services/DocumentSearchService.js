import { errorLogger } from '../../agent_utils/shared/logger.js';

export class DocumentSearchService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  async searchRelevantDocuments(userId, queryEmbedding, limit = 5, threshold = 0.7) {
    try {
      errorLogger.info('Executing vector similarity search', {
        user_id: userId,
        embedding_dimensions: queryEmbedding.length,
        match_threshold: threshold,
        match_count: limit,
        component: 'DocumentSearchService'
      });

      // FIXED: Updated to use the new match_documents function signature
      // The function now uses SECURITY INVOKER and relies on RLS policies
      // to filter documents by the authenticated user's ID
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit
        // Removed user_id parameter - RLS will handle user filtering automatically
      });

      if (error) {
        errorLogger.error('Vector search error', error, {
          user_id: userId,
          error_code: error.code,
          error_details: error.details,
          component: 'DocumentSearchService'
        });
        
        // Fallback to regular document search if vector search fails
        errorLogger.warn('Falling back to regular document search', {
          user_id: userId,
          component: 'DocumentSearchService'
        });
        return await this.fallbackDocumentSearch(userId);
      }

      loerrorLoggerger.success('Vector search completed', {
        user_id: userId,
        results_count: data?.length || 0,
        results_preview: data?.slice(0, 3).map(d => ({
          filename: d.filename,
          similarity: d.similarity
        })) || [],
        component: 'DocumentSearchService'
      });

      return data || [];
    } catch (error) {
      errorLogger.error('Document search failed', error, {
        user_id: userId,
        error_stack: error.stack,
        component: 'DocumentSearchService'
      });
      return await this.fallbackDocumentSearch(userId);
    }
  }

  async fallbackDocumentSearch(userId, limit = 3) {
    try {
      errorLogger.info('Executing fallback document search', {
        user_id: userId,
        limit: limit,
        component: 'DocumentSearchService'
      });

      const { data, error } = await this.supabase
        .from('documents')
        .select('filename, content')
        .eq('user_id', userId)
        .limit(limit);

      if (error) {
        logger.error('Fallback document search failed', error, {
          user_id: userId,
          error_code: error.code,
          component: 'DocumentSearchService'
        });
        throw error;
      }

      const results = (data || []).map(doc => ({
        ...doc,
        similarity: 0.5 // Default similarity for fallback
      }));

      errorLogger.info('Fallback document search completed', {
        user_id: userId,
        results_count: results.length,
        component: 'DocumentSearchService'
      });

      return results;
    } catch (error) {
      errorLogger.error('Fallback document search failed', error, {
        user_id: userId,
        error_stack: error.stack,
        component: 'DocumentSearchService'
      });
      return [];
    }
  }
}