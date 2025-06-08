// Centralized HTTP client for container communication
import axios from 'axios';
import { errorLogger } from './logger.js';
import { ContainerError, createTimeoutError } from './errors.js';
import { TIMEOUTS, HTTP_STATUS } from './constants.js';

class HttpClient {
  constructor() {
    this.defaultTimeout = TIMEOUTS.DEFAULT;
  }

  async makeRequest(url, options = {}) {
    const {
      method = 'GET',
      data = null,
      headers = {},
      timeout = this.defaultTimeout,
      userJWT = null
    } = options;

    const config = {
      method,
      url,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      },
      validateStatus: (status) => status >= 200 && status < 500
    };

    if (userJWT) {
      config.headers['Authorization'] = userJWT;
    }

    if (data && method !== 'GET') {
      config.data = data;
    }

    try {
      const response = await axios(config);
      
      if (response.status >= 400) {
        throw new ContainerError(
          response.data?.error || response.statusText,
          response.status,
          response.data
        );
      }

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw createTimeoutError('HTTP request', timeout);
      }
      
      if (error instanceof ContainerError) {
        throw error;
      }

      throw new ContainerError(error.message, error.response?.status || 500, error.response?.data);
    }
  }

  async get(url, options = {}) {
    return this.makeRequest(url, { ...options, method: 'GET' });
  }

  async post(url, data, options = {}) {
    return this.makeRequest(url, { ...options, method: 'POST', data });
  }

  async healthCheck(url, userJWT = null) {
    try {
      const healthUrl = `${url.replace(/\/+$/, '')}/health`;
      const response = await this.get(healthUrl, {
        timeout: TIMEOUTS.HEALTH_CHECK,
        userJWT
      });
      
      errorLogger.connectionCheck('Container Health', true, response);
      return response;
    } catch (error) {
      errorLogger.connectionCheck('Container Health', false, { error: error.message });
      throw error;
    }
  }
}

export const httpClient = new HttpClient();