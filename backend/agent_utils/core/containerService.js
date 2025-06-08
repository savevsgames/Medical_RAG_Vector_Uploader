// Container communication service
import { httpClient } from '../shared/httpClient.js';
import { errorLogger } from '../shared/logger.js';
import { handleAgentError, ContainerError } from '../shared/errors.js';
import { TIMEOUTS } from '../shared/constants.js';

export class ContainerService {
  constructor() {
    this.baseUrl = process.env.RUNPOD_EMBEDDING_URL;
  }

  isConfigured() {
    return !!this.baseUrl;
  }

  async healthCheck(userJWT) {
    if (!this.isConfigured()) {
      throw new ContainerError('Container not configured', 503);
    }

    try {
      return await httpClient.healthCheck(this.baseUrl, userJWT);
    } catch (error) {
      throw handleAgentError('health_check', error, null, {
        container_url: this.baseUrl
      });
    }
  }

  async embed(documentText, metadata, userJWT) {
    if (!this.isConfigured()) {
      throw new ContainerError('Container not configured', 503);
    }

    try {
      const embedUrl = `${this.baseUrl.replace(/\/+$/, '')}/embed`;
      
      const requestPayload = {
        file_path: metadata.file_path || `inline_text_${Date.now()}`,
        metadata: {
          ...metadata,
          inline_text: documentText,
          timestamp: new Date().toISOString()
        }
      };

      errorLogger.debug('Sending embed request to container', {
        url: embedUrl,
        payload_size: JSON.stringify(requestPayload).length
      });

      const response = await httpClient.post(embedUrl, requestPayload, {
        timeout: TIMEOUTS.DEFAULT,
        userJWT
      });

      errorLogger.success('Container embedding completed', {
        response_keys: Object.keys(response),
        embedding_dimensions: response.embedding?.length
      });

      return response;
    } catch (error) {
      throw handleAgentError('embed', error, null, {
        container_url: this.baseUrl,
        text_length: documentText?.length
      });
    }
  }

  async chat(message, context, userJWT) {
    if (!this.isConfigured()) {
      throw new ContainerError('Container not configured', 503);
    }

    try {
      const chatUrl = `${this.baseUrl.replace(/\/+$/, '')}/chat`;
      
      const requestPayload = {
        query: message,
        history: context || [],
        timestamp: new Date().toISOString()
      };

      errorLogger.debug('Sending chat request to container', {
        url: chatUrl,
        message_length: message.length,
        context_length: context?.length || 0
      });

      const response = await httpClient.post(chatUrl, requestPayload, {
        timeout: TIMEOUTS.CHAT,
        userJWT
      });

      errorLogger.success('Container chat completed', {
        response_length: response.response?.length || 0,
        sources_count: response.sources?.length || 0
      });

      return {
        response: response.response || response.answer || 'No response generated',
        sources: response.sources || response.documents || [],
        agent_id: 'txagent',
        processing_time: response.processing_time,
        timestamp: new Date().toISOString(),
        status: response.status || 'success'
      };
    } catch (error) {
      throw handleAgentError('chat', error, null, {
        container_url: this.baseUrl,
        message_length: message?.length
      });
    }
  }

  async testConnection(userJWT = null) {
    try {
      if (!this.isConfigured()) {
        errorLogger.connectionCheck('Container', false, { reason: 'Not configured' });
        return false;
      }

      await this.healthCheck(userJWT);
      errorLogger.connectionCheck('Container', true, { url: this.baseUrl });
      return true;
    } catch (error) {
      errorLogger.connectionCheck('Container', false, {
        error: error.message,
        url: this.baseUrl
      });
      return false;
    }
  }
}