// Agent Manager - Handles agent lifecycle and Supabase operations
// Manages agent sessions, container tracking, and database operations

import { createClient } from '@supabase/supabase-js';
import { errorLogger } from './errorLogger.js';

class AgentManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient; // Service role client for admin operations
  }

  // Create a user-authenticated Supabase client for RLS operations
  createUserClient(userJWT) {
    if (!userJWT) {
      throw new Error('User JWT is required for authenticated operations');
    }

    // Extract the token from "Bearer <token>" format
    const token = userJWT.startsWith('Bearer ') ? userJWT.substring(7) : userJWT;

    // Create a new Supabase client with the user's JWT
    const userClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY, // Use anon key for user operations
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    return userClient;
  }

  // Create or update agent session in database
  async createAgentSession(userId, containerData, userJWT) {
    try {
      errorLogger.debug('Creating agent session - input validation', {
        user_id: userId,
        container_id: containerData.container_id,
        endpoint_url: containerData.endpoint_url,
        has_health_status: !!containerData.health_status,
        has_jwt: !!userJWT,
        component: 'AgentManager.createAgentSession'
      });

      const sessionData = {
        container_id: containerData.container_id,
        started_at: new Date().toISOString(),
        runpod_endpoint: containerData.endpoint_url,
        capabilities: ['embedding', 'chat', 'document_analysis'],
        health_status: containerData.health_status || null
      };

      errorLogger.debug('Prepared session data for Supabase insert', {
        user_id: userId,
        session_data: sessionData,
        component: 'AgentManager.createAgentSession'
      });

      // Use user-authenticated client for RLS compliance
      const userClient = this.createUserClient(userJWT);

      errorLogger.info('Inserting agent session into Supabase with user authentication', {
        user_id: userId,
        session_data: sessionData
      });

      const { data, error } = await userClient
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
        errorLogger.error('Supabase agent session insert failed', error, {
          user_id: userId,
          container_id: containerData.container_id,
          error_code: error.code,
          error_details: error.details,
          error_hint: error.hint,
          error_message: error.message,
          supabase_operation: 'upsert',
          table: 'agents',
          component: 'AgentManager.createAgentSession'
        });
        throw error;
      }

      errorLogger.debug('Supabase agent session insert successful', {
        user_id: userId,
        agent_id: data.id,
        status: data.status,
        created_at: data.created_at,
        component: 'AgentManager.createAgentSession'
      });

      errorLogger.agentStart(userId, data.id, {
        container_id: containerData.container_id,
        endpoint_url: containerData.endpoint_url,
        supabase_id: data.id
      });

      return data;

    } catch (error) {
      errorLogger.agentError(userId, 'create_session', error, {
        container_data: containerData,
        error_stack: error.stack,
        error_type: error.constructor.name,
        supabase_error_details: error.details || null,
        component: 'AgentManager.createAgentSession'
      });
      throw error;
    }
  }

  // Terminate agent session
  async terminateAgentSession(userId, userJWT) {
    try {
      errorLogger.debug('Terminating agent session - starting process', {
        user_id: userId,
        has_jwt: !!userJWT,
        component: 'AgentManager.terminateAgentSession'
      });

      errorLogger.info('Terminating agent session', { 
        user_id: userId 
      });

      // Use user-authenticated client for RLS compliance
      const userClient = this.createUserClient(userJWT);

      const { data, error } = await userClient
        .from('agents')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'active')
        .select();

      if (error) {
        errorLogger.error('Supabase agent session termination failed', error, { 
          user_id: userId,
          error_code: error.code,
          error_details: error.details,
          error_hint: error.hint,
          error_message: error.message,
          supabase_operation: 'update',
          table: 'agents',
          component: 'AgentManager.terminateAgentSession'
        });
        throw error;
      }

      errorLogger.debug('Supabase agent session termination successful', {
        user_id: userId,
        terminated_sessions: data?.length || 0,
        session_ids: data?.map(d => d.id) || [],
        component: 'AgentManager.terminateAgentSession'
      });

      errorLogger.agentStop(userId, {
        terminated_sessions: data?.length || 0,
        session_ids: data?.map(d => d.id) || []
      });

      return data;

    } catch (error) {
      errorLogger.agentError(userId, 'terminate_session', error, {
        error_stack: error.stack,
        error_type: error.constructor.name,
        supabase_error_details: error.details || null,
        component: 'AgentManager.terminateAgentSession'
      });
      throw error;
    }
  }

  // Get current agent status - REDUCED LOGGING FOR STATUS CHECKS
  async getAgentStatus(userId, userJWT) {
    try {
      // Only log debug info, not info level for status checks
      errorLogger.debug('Fetching agent status - starting query', {
        user_id: userId,
        has_jwt: !!userJWT,
        component: 'AgentManager.getAgentStatus'
      });

      // Use user-authenticated client for RLS compliance
      const userClient = this.createUserClient(userJWT);

      const { data: agent, error } = await userClient
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        errorLogger.error('Supabase agent status query failed', error, { 
          user_id: userId,
          error_code: error.code,
          error_details: error.details,
          error_hint: error.hint,
          error_message: error.message,
          supabase_operation: 'select',
          table: 'agents',
          component: 'AgentManager.getAgentStatus'
        });
        throw error;
      }

      if (error && error.code === 'PGRST116') {
        errorLogger.debug('No active agent found for user (PGRST116)', {
          user_id: userId,
          error_code: error.code,
          component: 'AgentManager.getAgentStatus'
        });
      }

      const status = {
        agent_active: !!agent,
        agent_id: agent?.id || null,
        last_active: agent?.last_active || null,
        session_data: agent?.session_data || null
      };

      errorLogger.debug('Agent status query completed', {
        user_id: userId,
        agent_active: status.agent_active,
        agent_id: status.agent_id,
        has_session_data: !!status.session_data,
        last_active: status.last_active,
        component: 'AgentManager.getAgentStatus'
      });

      // REDUCED: Only log when agent is actually active or there's an issue
      if (status.agent_active) {
        errorLogger.debug('Agent status retrieved - active agent found', {
          user_id: userId,
          agent_id: status.agent_id
        });
      }

      return status;

    } catch (error) {
      errorLogger.agentError(userId, 'get_status', error, {
        error_stack: error.stack,
        error_type: error.constructor.name,
        supabase_error_details: error.details || null,
        component: 'AgentManager.getAgentStatus'
      });
      throw error;
    }
  }

  // Update agent last active timestamp
  async updateLastActive(userId, userJWT) {
    try {
      errorLogger.debug('Updating agent last active timestamp', {
        user_id: userId,
        has_jwt: !!userJWT,
        component: 'AgentManager.updateLastActive'
      });

      // Use user-authenticated client for RLS compliance
      const userClient = this.createUserClient(userJWT);

      const { error } = await userClient
        .from('agents')
        .update({ last_active: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        errorLogger.warn('Failed to update last active in Supabase', {
          user_id: userId,
          error: error.message,
          error_code: error.code,
          error_details: error.details,
          component: 'AgentManager.updateLastActive'
        });
      } else {
        errorLogger.debug('Agent last active updated successfully', {
          user_id: userId,
          component: 'AgentManager.updateLastActive'
        });
      }

    } catch (error) {
      errorLogger.warn('Error updating last active', {
        user_id: userId,
        error: error.message,
        error_stack: error.stack,
        error_type: error.constructor.name,
        component: 'AgentManager.updateLastActive'
      });
    }
  }

  // Clean up stale agent sessions (utility method) - Uses service role for admin operations
  async cleanupStaleAgents(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      errorLogger.debug('Starting stale agent cleanup process', {
        max_age_hours: maxAgeHours,
        cutoff_time: cutoffTime.toISOString(),
        component: 'AgentManager.cleanupStaleAgents'
      });

      errorLogger.info('Starting stale agent cleanup', {
        max_age_hours: maxAgeHours,
        cutoff_time: cutoffTime.toISOString()
      });

      // Use service role client for admin cleanup operations
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
        errorLogger.error('Supabase stale agent cleanup failed', error, {
          error_code: error.code,
          error_details: error.details,
          error_hint: error.hint,
          max_age_hours: maxAgeHours,
          component: 'AgentManager.cleanupStaleAgents'
        });
        return 0;
      }

      const cleanedCount = data?.length || 0;
      
      errorLogger.debug('Stale agent cleanup completed', {
        cleaned_count: cleanedCount,
        max_age_hours: maxAgeHours,
        cleaned_agent_ids: data?.map(d => d.id) || [],
        component: 'AgentManager.cleanupStaleAgents'
      });

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
        error_stack: error.stack,
        error_type: error.constructor.name,
        component: 'AgentManager.cleanupStaleAgents'
      });
      return 0;
    }
  }

  // Get agent statistics (for monitoring) - Uses service role for admin operations
  async getAgentStats(userJWT = null) {
    try {
      errorLogger.debug('Fetching agent statistics', {
        has_jwt: !!userJWT,
        component: 'AgentManager.getAgentStats'
      });

      errorLogger.info('Fetching agent statistics');

      // Use service role client for admin stats operations
      const { data: activeAgents, error: activeError } = await this.supabase
        .from('agents')
        .select('user_id, id, created_at, last_active')
        .eq('status', 'active');

      const { data: totalAgents, error: totalError } = await this.supabase
        .from('agents')
        .select('user_id, status, created_at', { count: 'exact' });

      if (activeError || totalError) {
        const error = activeError || totalError;
        errorLogger.error('Supabase agent statistics query failed', error, {
          active_error: activeError?.message,
          total_error: totalError?.message,
          active_error_code: activeError?.code,
          total_error_code: totalError?.code,
          component: 'AgentManager.getAgentStats'
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

      errorLogger.debug('Agent statistics retrieved successfully', {
        active_count: stats.active_agents,
        total_count: stats.total_agents,
        component: 'AgentManager.getAgentStats'
      });

      errorLogger.info('Agent statistics retrieved', {
        active_count: stats.active_agents,
        total_count: stats.total_agents
      });
      
      return stats;

    } catch (error) {
      errorLogger.error('Failed to get agent statistics', error, {
        error_stack: error.stack,
        error_type: error.constructor.name,
        component: 'AgentManager.getAgentStats'
      });
      throw error;
    }
  }
}

export { AgentManager };