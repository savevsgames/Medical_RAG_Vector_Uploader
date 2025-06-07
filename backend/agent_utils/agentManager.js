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
        container_id: containerData.container_id,
        endpoint_url: containerData.endpoint_url
      });

      const sessionData = {
        container_id: containerData.container_id,
        started_at: new Date().toISOString(),
        runpod_endpoint: containerData.endpoint_url,
        capabilities: ['embedding', 'chat', 'document_analysis'],
        health_status: containerData.health_status || null
      };

      errorLogger.info('Inserting agent session into Supabase', {
        user_id: userId,
        session_data: sessionData
      });

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
        errorLogger.error('Failed to create agent session in Supabase', error, {
          user_id: userId,
          container_id: containerData.container_id,
          error_code: error.code,
          error_details: error.details
        });
        throw error;
      }

      errorLogger.agentStart(userId, data.id, {
        container_id: containerData.container_id,
        endpoint_url: containerData.endpoint_url,
        supabase_id: data.id
      });

      return data;

    } catch (error) {
      errorLogger.agentError(userId, 'create_session', error, {
        container_data: containerData,
        error_stack: error.stack
      });
      throw error;
    }
  }

  // Terminate agent session
  async terminateAgentSession(userId) {
    try {
      errorLogger.info('Terminating agent session', { 
        user_id: userId 
      });

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
        errorLogger.error('Failed to terminate agent session in Supabase', error, { 
          user_id: userId,
          error_code: error.code,
          error_details: error.details
        });
        throw error;
      }

      errorLogger.agentStop(userId, {
        terminated_sessions: data?.length || 0,
        session_ids: data?.map(d => d.id) || []
      });

      return data;

    } catch (error) {
      errorLogger.agentError(userId, 'terminate_session', error, {
        error_stack: error.stack
      });
      throw error;
    }
  }

  // Get current agent status
  async getAgentStatus(userId) {
    try {
      errorLogger.info('Fetching agent status', { 
        user_id: userId 
      });

      const { data: agent, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        errorLogger.error('Failed to get agent status from Supabase', error, { 
          user_id: userId,
          error_code: error.code,
          error_details: error.details
        });
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
        agent_id: status.agent_id,
        has_session_data: !!status.session_data
      });

      return status;

    } catch (error) {
      errorLogger.agentError(userId, 'get_status', error, {
        error_stack: error.stack
      });
      throw error;
    }
  }

  // Update agent last active timestamp
  async updateLastActive(userId) {
    try {
      errorLogger.info('Updating agent last active timestamp', {
        user_id: userId
      });

      const { error } = await this.supabase
        .from('agents')
        .update({ last_active: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        errorLogger.warn('Failed to update last active in Supabase', {
          user_id: userId,
          error: error.message,
          error_code: error.code
        });
      } else {
        errorLogger.info('Agent last active updated successfully', {
          user_id: userId
        });
      }

    } catch (error) {
      errorLogger.warn('Error updating last active', {
        user_id: userId,
        error: error.message,
        error_stack: error.stack
      });
    }
  }

  // Clean up stale agent sessions (utility method)
  async cleanupStaleAgents(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      errorLogger.info('Starting stale agent cleanup', {
        max_age_hours: maxAgeHours,
        cutoff_time: cutoffTime.toISOString()
      });

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
        errorLogger.error('Failed to cleanup stale agents in Supabase', error, {
          error_code: error.code,
          error_details: error.details
        });
        return 0;
      }

      const cleanedCount = data?.length || 0;
      if (cleanedCount > 0) {
        errorLogger.info('Cleaned up stale agents', {
          count: cleanedCount,
          max_age_hours: maxAgeHours,
          cleaned_agent_ids: data.map(d => d.id)
        });
      } else {
        errorLogger.info('No stale agents found to cleanup', {
          max_age_hours: maxAgeHours
        });
      }

      return cleanedCount;

    } catch (error) {
      errorLogger.error('Error during agent cleanup', error, {
        max_age_hours: maxAgeHours,
        error_stack: error.stack
      });
      return 0;
    }
  }

  // Get agent statistics (for monitoring)
  async getAgentStats() {
    try {
      errorLogger.info('Fetching agent statistics');

      const { data: activeAgents, error: activeError } = await this.supabase
        .from('agents')
        .select('user_id, id, created_at, last_active')
        .eq('status', 'active');

      const { data: totalAgents, error: totalError } = await this.supabase
        .from('agents')
        .select('user_id, status, created_at', { count: 'exact' });

      if (activeError || totalError) {
        const error = activeError || totalError;
        errorLogger.error('Failed to get agent statistics from Supabase', error, {
          active_error: activeError?.message,
          total_error: totalError?.message
        });
        throw error;
      }

      const stats = {
        active_agents: activeAgents?.length || 0,
        total_agents: totalAgents?.length || 0,
        active_agent_details: activeAgents?.map(agent => ({
          id: agent.id,
          user_id: agent.user_id,
          created_at: agent.created_at,
          last_active: agent.last_active
        })) || [],
        timestamp: new Date().toISOString()
      };

      errorLogger.info('Agent statistics retrieved', {
        active_count: stats.active_agents,
        total_count: stats.total_agents
      });
      
      return stats;

    } catch (error) {
      errorLogger.error('Failed to get agent statistics', error, {
        error_stack: error.stack
      });
      throw error;
    }
  }
}

export { AgentManager };