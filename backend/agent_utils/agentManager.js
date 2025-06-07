// Agent Manager - Handles agent lifecycle and Supabase operations
// Manages agent sessions, container tracking, and database operations

import { errorLogger } from './errorLogger.js';

class AgentManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  // Create or update agent session in database
  async createAgentSession(userId, containerData) {
    try {
      errorLogger.info('Creating agent session', {
        user_id: userId,
        container_id: containerData.container_id
      });

      const sessionData = {
        container_id: containerData.container_id,
        started_at: new Date().toISOString(),
        runpod_endpoint: containerData.endpoint_url,
        capabilities: ['embedding', 'chat', 'document_analysis']
      };

      const { data, error } = await this.supabase
        .from('agents')
        .upsert({
          user_id: userId,
          status: 'active',
          session_data: sessionData,
          last_active: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        errorLogger.error('Failed to create agent session', error, {
          user_id: userId,
          container_id: containerData.container_id
        });
        throw error;
      }

      errorLogger.agentStart(userId, data.id, {
        container_id: containerData.container_id,
        endpoint_url: containerData.endpoint_url
      });

      return data;

    } catch (error) {
      errorLogger.agentError(userId, 'create_session', error);
      throw error;
    }
  }

  // Terminate agent session
  async terminateAgentSession(userId) {
    try {
      errorLogger.info('Terminating agent session', { user_id: userId });

      const { data, error } = await this.supabase
        .from('agents')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'active')
        .select();

      if (error) {
        errorLogger.error('Failed to terminate agent session', error, { user_id: userId });
        throw error;
      }

      errorLogger.agentStop(userId, {
        terminated_sessions: data?.length || 0
      });

      return data;

    } catch (error) {
      errorLogger.agentError(userId, 'terminate_session', error);
      throw error;
    }
  }

  // Get current agent status
  async getAgentStatus(userId) {
    try {
      const { data: agent, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        errorLogger.error('Failed to get agent status', error, { user_id: userId });
        throw error;
      }

      const status = {
        agent_active: !!agent,
        agent_id: agent?.id || null,
        last_active: agent?.last_active || null,
        session_data: agent?.session_data || null
      };

      errorLogger.info('Agent status retrieved', {
        user_id: userId,
        agent_active: status.agent_active,
        agent_id: status.agent_id
      });

      return status;

    } catch (error) {
      errorLogger.agentError(userId, 'get_status', error);
      throw error;
    }
  }

  // Update agent last active timestamp
  async updateLastActive(userId) {
    try {
      const { error } = await this.supabase
        .from('agents')
        .update({ last_active: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        errorLogger.warn('Failed to update last active', {
          user_id: userId,
          error: error.message
        });
      }

    } catch (error) {
      errorLogger.warn('Error updating last active', {
        user_id: userId,
        error: error.message
      });
    }
  }

  // Clean up stale agent sessions (utility method)
  async cleanupStaleAgents(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      const { data, error } = await this.supabase
        .from('agents')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('status', 'active')
        .lt('last_active', cutoffTime.toISOString())
        .select();

      if (error) {
        errorLogger.error('Failed to cleanup stale agents', error);
        return 0;
      }

      const cleanedCount = data?.length || 0;
      if (cleanedCount > 0) {
        errorLogger.info('Cleaned up stale agents', {
          count: cleanedCount,
          max_age_hours: maxAgeHours
        });
      }

      return cleanedCount;

    } catch (error) {
      errorLogger.error('Error during agent cleanup', error);
      return 0;
    }
  }

  // Get agent statistics (for monitoring)
  async getAgentStats() {
    try {
      const { data: activeAgents, error: activeError } = await this.supabase
        .from('agents')
        .select('user_id')
        .eq('status', 'active');

      const { data: totalAgents, error: totalError } = await this.supabase
        .from('agents')
        .select('user_id', { count: 'exact' });

      if (activeError || totalError) {
        throw activeError || totalError;
      }

      const stats = {
        active_agents: activeAgents?.length || 0,
        total_agents: totalAgents?.length || 0,
        timestamp: new Date().toISOString()
      };

      errorLogger.info('Agent statistics retrieved', stats);
      return stats;

    } catch (error) {
      errorLogger.error('Failed to get agent statistics', error);
      throw error;
    }
  }
}

export { AgentManager };