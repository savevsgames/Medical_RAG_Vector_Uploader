import axios from 'axios';

export class ChatService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    console.log('ChatService initialized');
    console.log(`OpenAI configured: ${!!this.openaiKey}`);
  }

  async processQuery(userId, query) {
    if (!this.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Step 1: Generate embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(query);
      
      // Step 2: Search for relevant documents
      const relevantDocs = await this.searchRelevantDocuments(userId, queryEmbedding);
      
      // Step 3: Generate response using RAG
      const response = await this.generateRAGResponse(query, relevantDocs);
      
      return {
        response: response,
        sources: relevantDocs.map(doc => ({
          filename: doc.filename,
          similarity: doc.similarity
        }))
      };
      
    } catch (error) {
      console.error('Query processing failed:', error);
      throw error;
    }
  }

  async generateQueryEmbedding(query) {
    try {
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

      return response.data.data[0].embedding;
    } catch (error) {
      throw new Error(`Failed to generate query embedding: ${error.message}`);
    }
  }

  async searchRelevantDocuments(userId, queryEmbedding, limit = 5, threshold = 0.7) {
    try {
      // Use Supabase's vector similarity search
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        user_id: userId
      });

      if (error) {
        console.error('Vector search error:', error);
        // Fallback to regular document search if vector search fails
        return await this.fallbackDocumentSearch(userId);
      }

      return data || [];
    } catch (error) {
      console.error('Document search failed:', error);
      return await this.fallbackDocumentSearch(userId);
    }
  }

  async fallbackDocumentSearch(userId, limit = 3) {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('filename, content')
        .eq('user_id', userId)
        .limit(limit);

      if (error) throw error;

      return (data || []).map(doc => ({
        ...doc,
        similarity: 0.5 // Default similarity for fallback
      }));
    } catch (error) {
      console.error('Fallback document search failed:', error);
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

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}