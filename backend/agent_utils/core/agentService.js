import { errorLogger } from '../shared/logger.js';

export class AgentService {
  constructor(supabaseClient) {
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client provided to AgentService');
    }
    this.supabase = supabaseClient;
  }

  /**
   * Get active agent for user - now includes 'initializing' status
   * @param {string} userId - User ID
   * @returns {Object|null} Active agent or null
   */
  async getActiveAgent(userId) {
    try {
      errorLogger.debug('Getting active agent for user', {
        userId,
        component: 'AgentService'
      });

      // ✅ UPDATED: Include both 'active' and 'initializing' statuses
      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'initializing']) // ✅ CRITICAL CHANGE: Include initializing agents
        .is('terminated_at', null)
        .order('last_active', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - no active agent
          errorLogger.debug('No active or initializing agent found for user', {
            userId,
            component: 'AgentService'
          });
          return null;
        }
        throw error;
      }

      errorLogger.debug('Active/initializing agent found for user', {
        userId,
        agentId: data.id,
        status: data.status,
        lastActive: data.last_active,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Failed to get active agent', error, {
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
   * @returns {Object} Created agent
   */
  async createAgentSession(userId, status = 'initializing', sessionData = {}) {
    try {
      errorLogger.info('Creating agent session', {
        userId,
        status,
        sessionData,
        component: 'AgentService'
      });

      // First, terminate any existing active sessions
      await this.terminateExistingSessions(userId);

      // Create new agent session
      const { data, error } = await this.supabase
        .from('agents')
        .insert({
          user_id: userId,
          status: status,
          session_data: sessionData,
          created_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        })
        .select()
        .single();

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
        agentId: data.id,
        status: data.status,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Failed to create agent session', error, {
        userId,
        status,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Update agent status
   * @param {string} agentId - Agent ID
   * @param {string} status - New status
   * @returns {Object} Updated agent
   */
  async updateAgentStatus(agentId, status) {
    try {
      errorLogger.debug('Updating agent status', {
        agentId,
        status,
        component: 'AgentService'
      });

      const { data, error } = await this.supabase
        .from('agents')
        .update({
          status: status,
          last_active: new Date().toISOString()
        })
        .eq('id', agentId)
        .select()
        .single();

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
        oldStatus: data.status,
        newStatus: status,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Failed to update agent status', error, {
        agentId,
        status,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Terminate agent session
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  async terminateAgentSession(userId) {
    try {
      errorLogger.info('Terminating agent session for user', {
        userId,
        component: 'AgentService'
      });

      const { data, error } = await this.supabase
        .from('agents')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .in('status', ['active', 'initializing']) // ✅ UPDATED: Terminate both active and initializing
        .is('terminated_at', null);

      if (error) {
        errorLogger.error('Failed to terminate agent session', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      const terminatedCount = data?.length || 0;
      
      errorLogger.success('Agent session(s) terminated successfully', {
        userId,
        terminatedCount,
        component: 'AgentService'
      });

      return terminatedCount > 0;
    } catch (error) {
      errorLogger.error('Failed to terminate agent session', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Terminate existing sessions for user (helper method)
   * @param {string} userId - User ID
   */
  async terminateExistingSessions(userId) {
    try {
      errorLogger.debug('Terminating existing sessions for user', {
        userId,
        component: 'AgentService'
      });

      const { error } = await this.supabase
        .from('agents')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .in('status', ['active', 'initializing']) // ✅ UPDATED: Terminate both active and initializing
        .is('terminated_at', null);

      if (error) {
        errorLogger.error('Failed to terminate existing sessions', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.debug('Existing sessions terminated successfully', {
        userId,
        component: 'AgentService'
      });
    } catch (error) {
      errorLogger.error('Failed to terminate existing sessions', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  /**
   * Update agent last active timestamp
   * @param {string} agentId - Agent ID
   */
  async updateLastActive(agentId) {
    try {
      const { error } = await this.supabase
        .from('agents')
        .update({
          last_active: new Date().toISOString()
        })
        .eq('id', agentId);

      if (error) {
        errorLogger.error('Failed to update agent last active', error, {
          agentId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.debug('Agent last active updated', {
        agentId,
        component: 'AgentService'
      });
    } catch (error) {
      errorLogger.error('Failed to update agent last active', error, {
        agentId,
        component: 'AgentService'
      });
      // Don't throw - this is a non-critical operation
    }
  }
}