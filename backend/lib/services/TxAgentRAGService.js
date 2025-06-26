import axios from 'axios';
import { errorLogger } from '../../agent_utils/shared/logger.js';

export class TxAgentRAGService {
  constructor(supabaseClient, txAgentUrl, authToken) {
    this.supabaseClient = supabaseClient;
    this.txAgentUrl = txAgentUrl.replace(/\/+$/, ''); // Remove trailing slashes
    this.authToken = authToken;
  }

  /**
   * Generate embedding for a query using TxAgent
   * @param {string} query - The user's query text
   * @returns {Promise<number[]>} - 768-dimensional embedding vector
   */
  async generateQueryEmbedding(query) {
    try {
      errorLogger.info('Generating query embedding with TxAgent', {
        queryLength: query.length,
        queryPreview: query.substring(0, 100),
        txAgentUrl: this.txAgentUrl,
        component: 'TxAgentRAGService'
      });

      const response = await axios.post(
        `${this.txAgentUrl}/embed`,
        {
          text: query,
          normalize: true
        },
        {
          headers: {
            'Authorization': this.authToken,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (!response.data.embedding || !Array.isArray(response.data.embedding)) {
        throw new Error('Invalid embedding response from TxAgent');
      }

      if (response.data.embedding.length !== 768) {
        throw new Error(`Expected 768-dimensional embedding, got ${response.data.embedding.length}`);
      }

      errorLogger.success('Query embedding generated successfully', {
        embeddingDimensions: response.data.embedding.length,
        model: response.data.model,
        processingTime: response.data.processing_time,
        component: 'TxAgentRAGService'
      });

      return response.data.embedding;

    } catch (error) {
      errorLogger.error('Failed to generate query embedding', error, {
        queryLength: query.length,
        txAgentUrl: this.txAgentUrl,
        error_message: error.message,
        error_status: error.response?.status,
        component: 'TxAgentRAGService'
      });
      throw new Error(`TxAgent embedding failed: ${error.message}`);
    }
  }

  /**
   * Retrieve relevant documents using vector similarity search
   * @param {number[]} queryEmbedding - 768-dimensional query embedding
   * @param {number} topK - Number of documents to retrieve (default: 5)
   * @param {number} threshold - Similarity threshold (default: 0.7)
   * @returns {Promise<Array>} - Array of relevant document chunks
   */
  async retrieveRelevantDocuments(queryEmbedding, topK = 5, threshold = 0.7) {
    try {
      errorLogger.info('Retrieving relevant documents using vector search', {
        embeddingDimensions: queryEmbedding.length,
        topK,
        threshold,
        component: 'TxAgentRAGService'
      });

      // Use the existing match_documents RPC function
      const { data, error } = await this.supabaseClient.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: topK
      });

      if (error) {
        errorLogger.error('Vector search error in RAG service', error, {
          error_code: error.code,
          error_details: error.details,
          component: 'TxAgentRAGService'
        });
        throw error;
      }

      const documents = data || [];

      errorLogger.success('Documents retrieved successfully', {
        documentsCount: documents.length,
        topSimilarity: documents.length > 0 ? documents[0].similarity : null,
        component: 'TxAgentRAGService'
      });

      return documents;

    } catch (error) {
      errorLogger.error('Failed to retrieve relevant documents', error, {
        embeddingDimensions: queryEmbedding.length,
        topK,
        threshold,
        component: 'TxAgentRAGService'
      });
      throw new Error(`Document retrieval failed: ${error.message}`);
    }
  }

  /**
   * Format retrieved documents into context string for LLM prompt
   * @param {Array} documents - Array of document chunks from vector search
   * @returns {string} - Formatted context string
   */
  formatDocumentsAsContext(documents) {
    if (!documents || documents.length === 0) {
      return '';
    }

    try {
      const contextParts = documents.map((doc, index) => {
        const filename = doc.filename || 'Unknown Document';
        const similarity = Math.round((doc.similarity || 0) * 100);
        const content = (doc.content || '').substring(0, 1000); // Limit content length
        
        return `[Document ${index + 1}: ${filename} (${similarity}% match)]
${content}${doc.content && doc.content.length > 1000 ? '...' : ''}`;
      });

      const formattedContext = contextParts.join('\n\n---\n\n');

      errorLogger.debug('Documents formatted as context', {
        documentsCount: documents.length,
        contextLength: formattedContext.length,
        component: 'TxAgentRAGService'
      });

      return formattedContext;

    } catch (error) {
      errorLogger.error('Failed to format documents as context', error, {
        documentsCount: documents?.length || 0,
        component: 'TxAgentRAGService'
      });
      return '';
    }
  }

  /**
   * Perform complete RAG workflow: embed query, retrieve docs, format context
   * @param {string} query - User's query
   * @param {number} topK - Number of documents to retrieve
   * @param {number} threshold - Similarity threshold
   * @returns {Promise<{context: string, sources: Array}>} - Formatted context and source documents
   */
  async performRAG(query, topK = 5, threshold = 0.7) {
    try {
      errorLogger.info('Starting complete RAG workflow', {
        queryLength: query.length,
        topK,
        threshold,
        component: 'TxAgentRAGService'
      });

      // Step 1: Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(query);

      // Step 2: Retrieve relevant documents
      const documents = await this.retrieveRelevantDocuments(queryEmbedding, topK, threshold);

      // Step 3: Format documents as context
      const context = this.formatDocumentsAsContext(documents);

      // Step 4: Prepare sources for frontend
      const sources = documents.map(doc => ({
        filename: doc.filename || 'Unknown Document',
        similarity: doc.similarity || 0,
        content: (doc.content || '').substring(0, 200) + '...', // Preview for frontend
        metadata: doc.metadata || {}
      }));

      errorLogger.success('RAG workflow completed successfully', {
        queryLength: query.length,
        documentsRetrieved: documents.length,
        contextLength: context.length,
        sourcesCount: sources.length,
        component: 'TxAgentRAGService'
      });

      return {
        context,
        sources,
        documentsFound: documents.length
      };

    } catch (error) {
      errorLogger.error('RAG workflow failed', error, {
        queryLength: query.length,
        topK,
        threshold,
        component: 'TxAgentRAGService'
      });
      
      // Return empty context and sources on failure
      return {
        context: '',
        sources: [],
        documentsFound: 0,
        error: error.message
      };
    }
  }

  /**
   * Create augmented prompt for TxAgent chat endpoint
   * @param {string} originalQuery - User's original query
   * @param {string} documentContext - Formatted document context
   * @param {Object} userProfile - User's medical profile (optional)
   * @param {Array} conversationHistory - Previous conversation messages (optional)
   * @returns {string} - Augmented prompt for TxAgent
   */
  createAugmentedPrompt(originalQuery, documentContext, userProfile = null, conversationHistory = []) {
    try {
      let augmentedPrompt = '';

      // Add system context if we have documents
      if (documentContext && documentContext.trim()) {
        augmentedPrompt += `Based on the following medical documents and information:\n\n${documentContext}\n\n`;
      }

      // Add user profile context if available
      if (userProfile) {
        augmentedPrompt += `User Profile Context:\n`;
        if (userProfile.age) augmentedPrompt += `- Age: ${userProfile.age}\n`;
        if (userProfile.gender) augmentedPrompt += `- Gender: ${userProfile.gender}\n`;
        if (userProfile.conditions && userProfile.conditions.length > 0) {
          augmentedPrompt += `- Medical Conditions: ${userProfile.conditions.join(', ')}\n`;
        }
        if (userProfile.medications && userProfile.medications.length > 0) {
          augmentedPrompt += `- Current Medications: ${userProfile.medications.join(', ')}\n`;
        }
        if (userProfile.allergies && userProfile.allergies.length > 0) {
          augmentedPrompt += `- Known Allergies: ${userProfile.allergies.join(', ')}\n`;
        }
        augmentedPrompt += '\n';
      }

      // Add conversation history if available
      if (conversationHistory && conversationHistory.length > 0) {
        augmentedPrompt += `Recent Conversation:\n`;
        conversationHistory.slice(-3).forEach(msg => { // Last 3 messages
          const role = msg.type === 'user' ? 'User' : 'Assistant';
          const content = typeof msg.content === 'string' ? msg.content : String(msg.content);
          augmentedPrompt += `${role}: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n`;
        });
        augmentedPrompt += '\n';
      }

      // Add the actual query
      augmentedPrompt += `Current Question: ${originalQuery}`;

      // Add instructions for the AI
      if (documentContext && documentContext.trim()) {
        augmentedPrompt += `\n\nPlease provide a comprehensive answer based on the medical documents provided above. `;
        augmentedPrompt += `Cite specific documents when referencing information. `;
      }
      
      if (userProfile) {
        augmentedPrompt += `Consider the user's medical profile when providing advice. `;
      }
      
      augmentedPrompt += `Always recommend consulting with healthcare professionals for personalized medical advice.`;

      errorLogger.debug('Augmented prompt created', {
        originalQueryLength: originalQuery.length,
        augmentedPromptLength: augmentedPrompt.length,
        hasDocumentContext: !!(documentContext && documentContext.trim()),
        hasUserProfile: !!userProfile,
        hasConversationHistory: conversationHistory.length > 0,
        component: 'TxAgentRAGService'
      });

      return augmentedPrompt;

    } catch (error) {
      errorLogger.error('Failed to create augmented prompt', error, {
        originalQueryLength: originalQuery.length,
        hasDocumentContext: !!(documentContext && documentContext.trim()),
        hasUserProfile: !!userProfile,
        component: 'TxAgentRAGService'
      });
      
      // Fallback to original query
      return originalQuery;
    }
  }
}