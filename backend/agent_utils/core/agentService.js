// Core agent service - consolidated business logic
import { supabaseManager } from '../shared/supabaseClient.js';
import { errorLogger } from '../shared/logger.js';
import { handleAgentError, createNotFoundError } from '../shared/errors.js';
import { AGENT_STATUS } from '../shared/constants.js';

export class AgentService {
  constructor() {
    this.supabase = supabaseManager.getServiceClient();
  }

  async createSession(userId, sessionData, userJWT) {
    try {
      errorLogger.debug('Creating agent session', {
        user_id: userId,
        session_data: sessionData
      });

      const userClient = supabaseManager.createUserClient(userJWT);
      
      const { data, error } = await userClient
        .from('agents')
        .upsert({
          user_id: userId,
          status: AGENT_STATUS.ACTIVE,
          session_data: sessionData,
          last_active: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      errorLogger.agentStart(userId, data.id, {
        session_data: sessionData,
        supabase_id: data.id
      });

      return data;
    } catch (error) {
      throw handleAgentError('create_session', error, userId, { session_data: sessionData });
    }
  }

  async terminateSession(userId, userJWT) {
    try {
      errorLogger.debug('Terminating agent session', { user_id: userId });

      const userClient = supabaseManager.createUserClient(userJWT);

      const { data, error } = await userClient
        .from('agents')
        .update({
          status: AGENT_STATUS.TERMINATED,
          terminated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', AGENT_STATUS.ACTIVE)
        .select();

      if (error) throw error;

      errorLogger.agentStop(userId, {
        terminated_sessions: data?.length || 0,
        session_ids: data?.map(d => d.id) || []
      });

      return data;
    } catch (error) {
      throw handleAgentError('terminate_session', error, userId);
    }
  }

  async getStatus(userId, userJWT) {
    try {
      const userClient = supabaseManager.createUserClient(userJWT);

      const { data: agent, error } = await userClient
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .eq('status', AGENT_STATUS.ACTIVE)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return {
        agent_active: !!agent,
        agent_id: agent?.id || null,
        last_active: agent?.last_active || null,
        session_data: agent?.session_data || null
      };
    } catch (error) {
      throw handleAgentError('get_status', error, userId);
    }
  }

  async updateLastActive(userId, userJWT) {
    try {
      const userClient = supabaseManager.createUserClient(userJWT);

      const { error } = await userClient
        .from('agents')
        .update({ last_active: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', AGENT_STATUS.ACTIVE);

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

  async getStats(userJWT = null) {
    try {
      const { data: activeAgents, error: activeError } = await this.supabase
        .from('agents')
        .select('user_id, id, created_at, last_active')
        .eq('status', AGENT_STATUS.ACTIVE);

      const { data: totalAgents, error: totalError } = await this.supabase
        .from('agents')
        .select('user_id, status, created_at', { count: 'exact' });

      if (activeError || totalError) {
        throw activeError || totalError;
      }

      return {
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
    } catch (error) {
      throw handleAgentError('get_stats', error, null);
    }
  }

  async cleanupStaleAgents(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      const { data, error } = await this.supabase
        .from('agents')
        .update({
          status: AGENT_STATUS.TERMINATED,
          terminated_at: new Date().toISOString()
        })
        .eq('status', AGENT_STATUS.ACTIVE)
        .lt('last_active', cutoffTime.toISOString())
        .select();

      if (error) throw error;

      const cleanedCount = data?.length || 0;
      
      if (cleanedCount > 0) {
        errorLogger.info('Cleaned up stale agents', {
          count: cleanedCount,
          max_age_hours: maxAgeHours,
          cleaned_agent_ids: data.map(d => d.id)
        });
      }

      return cleanedCount;
    } catch (error) {
      errorLogger.error('Error during agent cleanup', error, { max_age_hours: maxAgeHours });
      return 0;
    }
  }
}