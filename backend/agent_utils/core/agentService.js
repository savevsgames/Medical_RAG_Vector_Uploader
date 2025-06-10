import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/environment.js';
import { errorLogger } from '../shared/logger.js';
import axios from 'axios';

export class AgentService {
  constructor(supabaseClient) {
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client provided to AgentService');
    }
    this.supabase = supabaseClient;
  }

  /**
   * Get agent status with live health check
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Agent status with live container health
   */
  async getAgentStatus(userId) {
    try {
      errorLogger.info('Getting agent status with live health check', {
        userId,
        component: 'AgentService'
      });

      // Get agent record from database
      const { data: agent, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('terminated_at', null)
        .order('last_active', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        errorLogger.error('Failed to fetch agent from database', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      // Base status object
      let agentStatus = {
        agent_active: false,
        agent_id: null,
        last_active: null,
        container_status: 'stopped',
        container_health: null,
        session_data: null
      };

      // If no agent found in database, return inactive status
      if (!agent) {
        errorLogger.info('No active agent found in database', {
          userId,
          component: 'AgentService'
        });
        return agentStatus;
      }

      // Agent exists in database, now check live container health
      errorLogger.info('Agent found in database, checking live container health', {
        userId,
        agentId: agent.id,
        dbStatus: agent.status,
        component: 'AgentService'
      });

      // Update status with database info
      agentStatus = {
        agent_active: agent.status === 'active',
        agent_id: agent.id,
        last_active: agent.last_active,
        container_status: 'checking',
        container_health: null,
        session_data: agent.session_data
      };

      // Perform live health check if RunPod URL is configured
      if (config.runpod.url) {
        try {
          const healthUrl = `${config.runpod.url.replace(/\/+$/, '')}/health`;
          
          errorLogger.debug('Performing live health check', {
            healthUrl,
            userId,
            agentId: agent.id,
            component: 'AgentService'
          });

          const healthResponse = await axios.get(healthUrl, {
            timeout: 10000, // 10 second timeout
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Medical-RAG-Backend/1.0'
            }
          });

          if (healthResponse.status === 200 && healthResponse.data) {
            const healthData = healthResponse.data;
            
            errorLogger.success('Container health check successful', {
              healthData,
              userId,
              agentId: agent.id,
              component: 'AgentService'
            });

            // Container is healthy and responding
            agentStatus.container_status = 'running';
            agentStatus.container_health = healthData;
            agentStatus.agent_active = true; // Confirm agent is truly active

            // Update last_active timestamp in database
            await this.updateAgentLastActive(agent.id);

          } else {
            errorLogger.warn('Container health check returned unexpected response', {
              status: healthResponse.status,
              data: healthResponse.data,
              userId,
              agentId: agent.id,
              component: 'AgentService'
            });

            agentStatus.container_status = 'unhealthy';
            agentStatus.agent_active = false; // Container not healthy
          }

        } catch (healthError) {
          errorLogger.error('Container health check failed', healthError, {
            userId,
            agentId: agent.id,
            healthUrl: config.runpod.url,
            errorType: healthError.constructor.name,
            errorMessage: healthError.message,
            component: 'AgentService'
          });

          // Container is unreachable or unhealthy
          agentStatus.container_status = 'unreachable';
          agentStatus.agent_active = false; // Container not reachable
          agentStatus.container_health = {
            error: healthError.message,
            error_type: healthError.constructor.name,
            last_check: new Date().toISOString()
          };

          // Consider terminating the agent session if container is unreachable
          if (healthError.code === 'ECONNREFUSED' || healthError.code === 'ETIMEDOUT') {
            errorLogger.warn('Container appears to be down, considering session termination', {
              userId,
              agentId: agent.id,
              errorCode: healthError.code,
              component: 'AgentService'
            });

            // Optionally terminate the session after multiple failed checks
            // This could be implemented with a retry counter in session_data
          }
        }
      } else {
        errorLogger.warn('RunPod URL not configured, cannot perform health check', {
          userId,
          agentId: agent.id,
          component: 'AgentService'
        });

        agentStatus.container_status = 'unknown';
        agentStatus.container_health = {
          error: 'RunPod URL not configured',
          last_check: new Date().toISOString()
        };
      }

      errorLogger.info('Agent status determined', {
        userId,
        agentId: agent.id,
        agentActive: agentStatus.agent_active,
        containerStatus: agentStatus.container_status,
        component: 'AgentService'
      });

      return agentStatus;

    } catch (error) {
      errorLogger.error('Failed to get agent status', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Create a new agent session
   * @param {string} userId - User ID
   * @param {string} status - Initial status (default: 'initializing')
   * @param {Object} sessionData - Session data
   * @returns {Promise<Object>} Created agent
   */
  async createAgentSession(userId, status = 'initializing', sessionData = {}) {
    try {
      errorLogger.info('Creating agent session', {
        userId,
        status,
        sessionData,
        component: 'AgentService'
      });

      // Use the database function to create agent session
      const { data, error } = await this.supabase
        .rpc('create_agent_session', {
          user_uuid: userId,
          initial_status: status,
          initial_session_data: sessionData
        });

      if (error) {
        errorLogger.error('Failed to create agent session', error, {
          userId,
          status,
          component: 'AgentService'
        });
        throw error;
      }

      const agent = data[0]; // RPC returns array
      
      errorLogger.success('Agent session created successfully', {
        userId,
        agentId: agent.id,
        status: agent.status,
        component: 'AgentService'
      });

      return agent;

    } catch (error) {
      errorLogger.error('Failed to create agent session', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Terminate agent session
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async terminateAgentSession(userId) {
    try {
      errorLogger.info('Terminating agent session', {
        userId,
        component: 'AgentService'
      });

      // Use the database function to terminate agent session
      const { data, error } = await this.supabase
        .rpc('terminate_agent_session', {
          user_uuid: userId
        });

      if (error) {
        errorLogger.error('Failed to terminate agent session', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.success('Agent session terminated successfully', {
        userId,
        terminated: data,
        component: 'AgentService'
      });

      return data;

    } catch (error) {
      errorLogger.error('Failed to terminate agent session', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Update agent last active timestamp
   * @param {string} agentId - Agent ID
   * @returns {Promise<boolean>} Success status
   */
  async updateAgentLastActive(agentId) {
    try {
      // Use the database function to update last active
      const { data, error } = await this.supabase
        .rpc('update_agent_last_active', {
          agent_uuid: agentId
        });

      if (error) {
        errorLogger.error('Failed to update agent last active', error, {
          agentId,
          component: 'AgentService'
        });
        throw error;
      }

      return data;

    } catch (error) {
      errorLogger.error('Failed to update agent last active', error, {
        agentId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Cleanup stale agents
   * @returns {Promise<number>} Number of agents cleaned up
   */
  async cleanupStaleAgents() {
    try {
      errorLogger.info('Cleaning up stale agents', {
        component: 'AgentService'
      });

      // Use the database function to cleanup stale agents
      const { data, error } = await this.supabase
        .rpc('cleanup_stale_agents');

      if (error) {
        errorLogger.error('Failed to cleanup stale agents', error, {
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.success('Stale agents cleaned up', {
        cleanedCount: data,
        component: 'AgentService'
      });

      return data;

    } catch (error) {
      errorLogger.error('Failed to cleanup stale agents', error, {
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Perform detailed status check with endpoint testing
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Detailed status information
   */
  async performDetailedStatusCheck(userId) {
    try {
      errorLogger.info('Performing detailed status check', {
        userId,
        component: 'AgentService'
      });

      // First get basic agent status
      const agentStatus = await this.getAgentStatus(userId);

      if (!agentStatus.agent_active || !config.runpod.url) {
        return {
          container_reachable: false,
          jwt_valid: false,
          endpoints_working: false,
          last_test_time: new Date().toISOString(),
          test_results: {
            health: { status: 0, error: 'Agent not active or RunPod URL not configured' },
            chat: { status: 0, error: 'Agent not active' },
            embed: { status: 0, error: 'Agent not active' }
          }
        };
      }

      const testResults = {
        health: { status: 0, response: null, error: null },
        chat: { status: 0, response: null, error: null },
        embed: { status: 0, response: null, error: null }
      };

      const baseUrl = config.runpod.url.replace(/\/+$/, '');

      // Test health endpoint
      try {
        const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
        testResults.health.status = healthResponse.status;
        testResults.health.response = healthResponse.data;
      } catch (error) {
        testResults.health.error = error.message;
      }

      // Test embed endpoint
      try {
        const embedResponse = await axios.post(`${baseUrl}/embed`, {
          text: 'Test embedding generation'
        }, { timeout: 10000 });
        testResults.embed.status = embedResponse.status;
        testResults.embed.response = embedResponse.data;
      } catch (error) {
        testResults.embed.error = error.message;
      }

      // Test chat endpoint
      try {
        const chatResponse = await axios.post(`${baseUrl}/chat`, {
          message: 'Test connection',
          context: []
        }, { timeout: 10000 });
        testResults.chat.status = chatResponse.status;
        testResults.chat.response = chatResponse.data;
      } catch (error) {
        testResults.chat.error = error.message;
      }

      const detailedStatus = {
        container_reachable: testResults.health.status === 200,
        jwt_valid: testResults.health.status !== 401,
        endpoints_working: testResults.chat.status === 200 || testResults.embed.status === 200,
        last_test_time: new Date().toISOString(),
        test_results: testResults
      };

      errorLogger.success('Detailed status check completed', {
        userId,
        detailedStatus,
        component: 'AgentService'
      });

      return detailedStatus;

    } catch (error) {
      errorLogger.error('Detailed status check failed', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }
}