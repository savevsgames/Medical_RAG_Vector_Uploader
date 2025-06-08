import axios from 'axios';
import { errorLogger } from '../../agent_utils/shared/logger.js';

export class ResponseGenerationService {
  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  isConfigured() {
    return !!this.openaiKey;
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

      logger.info('Calling OpenAI chat completion', {
        query_length: query.length,
        context_length: context.length,
        documents_count: relevantDocs.length,
        model: 'gpt-3.5-turbo',
        component: 'ResponseGenerationService'
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
        finish_reason: response.data.choices[0].finish_reason,
        component: 'ResponseGenerationService'
      });

      return generatedResponse;
    } catch (error) {
      if (error.response?.status === 429) {
        errorLogger.error('OpenAI rate limit exceeded', error, {
          error_response: error.response?.data,
          component: 'ResponseGenerationService'
        });
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }
      
      errorLogger.error('Failed to generate RAG response', error, {
        error_response: error.response?.data,
        error_status: error.response?.status,
        error_stack: error.stack,
        component: 'ResponseGenerationService'
      });
      
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}