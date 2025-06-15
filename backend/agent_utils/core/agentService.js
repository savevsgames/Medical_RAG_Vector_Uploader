import { errorLogger } from '../shared/logger.js';

export class AgentService {
  constructor(supabaseClient) {
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client provided to AgentService');
    }
    this.supabaseClient = supabaseClient;
  }

  async createAgentSession(userId, status = 'initializing', sessionData = {}) {
    try {
      errorLogger.info('Creating agent session', {
        userId,
        status,
        sessionData,
        component: 'AgentService'
      });

      const { data, error } = await this.supabaseClient
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

      errorLogger.success('Agent session created successfully', {
        userId,
        agentId: data?.[0]?.id,
        status: data?.[0]?.status,
        component: 'AgentService'
      });

      return data?.[0] || data;
    } catch (error) {
      errorLogger.error('Agent session creation failed', error, {
        userId,
        status,
        component: 'AgentService'
      });
      throw error;
    }
  }

  // FIXED: Add alias method to match route expectations
  async startAgent(userId, sessionData = {}) {
    errorLogger.info('Starting agent (alias for createAgentSession)', {
      userId,
      sessionData,
      component: 'AgentService'
    });
    
    return this.createAgentSession(userId, 'initializing', sessionData);
  }

  async getActiveAgent(userId) {
    try {
      errorLogger.debug('Getting active agent', {
        userId,
        component: 'AgentService'
      });

      const { data, error } = await this.supabaseClient
        .rpc('get_active_agent', {
          user_uuid: userId
        });

      if (error) {
        errorLogger.error('Failed to get active agent', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      const agent = data?.[0] || null;
      
      errorLogger.debug('Active agent retrieved', {
        userId,
        hasAgent: !!agent,
        agentId: agent?.id,
        component: 'AgentService'
      });

      return agent;
    } catch (error) {
      errorLogger.error('Get active agent failed', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  async terminateAgentSession(userId) {
    try {
      errorLogger.info('Terminating agent session', {
        userId,
        component: 'AgentService'
      });

      const { data, error } = await this.supabaseClient
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
        result: data,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Agent session termination failed', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  async updateAgentLastActive(agentId) {
    try {
      const { data, error } = await this.supabaseClient
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
      errorLogger.error('Update agent last active failed', error, {
        agentId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  async cleanupStaleAgents() {
    try {
      errorLogger.info('Cleaning up stale agents', {
        component: 'AgentService'
      });

      const { data, error } = await this.supabaseClient
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
      errorLogger.error('Cleanup stale agents failed', error, {
        component: 'AgentService'
      });
      throw error;
    }
  }

  async updateAgentStatus(agentId, status) {
    try {
      errorLogger.info('Updating agent status', {
        agentId,
        status,
        component: 'AgentService'
      });

      const { data, error } = await this.supabaseClient
        .from('agents')
        .update({ 
          status,
          last_active: new Date().toISOString()
        })
        .eq('id', agentId)
        .select();

      if (error) {
        errorLogger.error('Failed to update agent status', error, {
          agentId,
          status,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.success('Agent status updated successfully', {
        agentId,
        status,
        component: 'AgentService'
      });

      return data?.[0] || data;
    } catch (error) {
      errorLogger.error('Update agent status failed', error, {
        agentId,
        status,
        component: 'AgentService'
      });
      throw error;
    }
  }
}