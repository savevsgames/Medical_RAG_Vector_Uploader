import { errorLogger } from '../shared/logger.js';

export class AgentService {
  constructor(supabaseClient) {
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client provided to AgentService');
    }
    this.supabase = supabaseClient;
  }

  /**
   * Create a new agent session using the SECURITY DEFINER function
   * @param {string} userId - User UUID
   * @param {string} status - Initial status (default: 'initializing')
   * @param {object} sessionData - Initial session data
   * @returns {Promise<object>} Created agent session details
   */
  async createAgentSession(userId, status = 'initializing', sessionData = {}) {
    try {
      errorLogger.info('Creating agent session', {
        userId,
        status,
        sessionData,
        component: 'AgentService'
      });

      // CRITICAL: Use the new SECURITY DEFINER function
      const { data, error } = await this.supabase.rpc('create_agent_session', {
        user_uuid: userId,
        initial_status: status,
        initial_session_data: sessionData
      });

      if (error) {
        errorLogger.error('Failed to create agent session via RPC', error, {
          userId,
          status,
          sessionData,
          component: 'AgentService'
        });
        throw error;
      }

      // The function returns a table, so data should be an array with one row
      const agentSession = Array.isArray(data) ? data[0] : data;

      if (!agentSession) {
        throw new Error('No agent session data returned from create_agent_session function');
      }

      errorLogger.success('Agent session created successfully', {
        agentId: agentSession.id,
        status: agentSession.status,
        userId,
        component: 'AgentService'
      });

      return {
        agent_id: agentSession.id,
        status: agentSession.status,
        session_data: agentSession.session_data,
        created_at: agentSession.created_at,
        agent_active: true
      };

    } catch (error) {
      errorLogger.error('Agent session creation failed', error, {
        userId,
        status,
        sessionData,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Get active agent session for user using SECURITY DEFINER function
   * @param {string} userId - User UUID
   * @returns {Promise<object|null>} Active agent session or null
   */
  async getActiveAgent(userId) {
    try {
      errorLogger.debug('Getting active agent for user', {
        userId,
        component: 'AgentService'
      });

      // CRITICAL: Use the new SECURITY DEFINER function
      const { data, error } = await this.supabase.rpc('get_active_agent', {
        user_uuid: userId
      });

      if (error) {
        errorLogger.error('Failed to get active agent via RPC', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      // The function returns a table, so data should be an array
      const activeAgent = Array.isArray(data) && data.length > 0 ? data[0] : null;

      if (activeAgent) {
        errorLogger.debug('Active agent found', {
          agentId: activeAgent.id,
          status: activeAgent.status,
          userId,
          component: 'AgentService'
        });

        return {
          agent_id: activeAgent.id,
          status: activeAgent.status,
          session_data: activeAgent.session_data,
          created_at: activeAgent.created_at,
          last_active: activeAgent.last_active,
          agent_active: true
        };
      } else {
        errorLogger.debug('No active agent found for user', {
          userId,
          component: 'AgentService'
        });
        return null;
      }

    } catch (error) {
      errorLogger.error('Failed to get active agent', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Terminate agent session using SECURITY DEFINER function
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Success status
   */
  async terminateAgentSession(userId) {
    try {
      errorLogger.info('Terminating agent session', {
        userId,
        component: 'AgentService'
      });

      // CRITICAL: Use the new SECURITY DEFINER function
      const { data, error } = await this.supabase.rpc('terminate_agent_session', {
        user_uuid: userId
      });

      if (error) {
        errorLogger.error('Failed to terminate agent session via RPC', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      const success = data === true;

      if (success) {
        errorLogger.success('Agent session terminated successfully', {
          userId,
          component: 'AgentService'
        });
      } else {
        errorLogger.warn('No active agent session found to terminate', {
          userId,
          component: 'AgentService'
        });
      }

      return success;

    } catch (error) {
      errorLogger.error('Agent session termination failed', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Update agent last active timestamp using SECURITY DEFINER function
   * @param {string} agentId - Agent UUID
   * @returns {Promise<boolean>} Success status
   */
  async updateAgentLastActive(agentId) {
    try {
      errorLogger.debug('Updating agent last active', {
        agentId,
        component: 'AgentService'
      });

      // CRITICAL: Use the new SECURITY DEFINER function
      const { data, error } = await this.supabase.rpc('update_agent_last_active', {
        agent_uuid: agentId
      });

      if (error) {
        errorLogger.error('Failed to update agent last active via RPC', error, {
          agentId,
          component: 'AgentService'
        });
        throw error;
      }

      const success = data === true;

      if (success) {
        errorLogger.debug('Agent last active updated successfully', {
          agentId,
          component: 'AgentService'
        });
      } else {
        errorLogger.warn('Agent not found for last active update', {
          agentId,
          component: 'AgentService'
        });
      }

      return success;

    } catch (error) {
      errorLogger.error('Failed to update agent last active', error, {
        agentId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Cleanup stale agents using SECURITY DEFINER function
   * @returns {Promise<number>} Number of agents cleaned up
   */
  async cleanupStaleAgents() {
    try {
      errorLogger.info('Cleaning up stale agents', {
        component: 'AgentService'
      });

      // CRITICAL: Use the new SECURITY DEFINER function
      const { data, error } = await this.supabase.rpc('cleanup_stale_agents');

      if (error) {
        errorLogger.error('Failed to cleanup stale agents via RPC', error, {
          component: 'AgentService'
        });
        throw error;
      }

      const cleanedCount = data || 0;

      errorLogger.success('Stale agents cleanup completed', {
        cleanedCount,
        component: 'AgentService'
      });

      return cleanedCount;

    } catch (error) {
      errorLogger.error('Stale agents cleanup failed', error, {
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Get comprehensive agent status for user
   * @param {string} userId - User UUID
   * @returns {Promise<object>} Complete agent status
   */
  async getAgentStatus(userId) {
    try {
      errorLogger.debug('Getting comprehensive agent status', {
        userId,
        component: 'AgentService'
      });

      // Get active agent using SECURITY DEFINER function
      const activeAgent = await this.getActiveAgent(userId);

      if (!activeAgent) {
        return {
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped',
          session_data: null
        };
      }

      // Update last active timestamp
      await this.updateAgentLastActive(activeAgent.agent_id);

      return {
        agent_active: true,
        agent_id: activeAgent.agent_id,
        last_active: activeAgent.last_active,
        container_status: activeAgent.status === 'active' ? 'running' : 'starting',
        session_data: activeAgent.session_data
      };

    } catch (error) {
      errorLogger.error('Failed to get agent status', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }
}