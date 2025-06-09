import { errorLogger } from '../shared/logger.js';
import { ContainerService } from './containerService.js';

export class AgentService {
  constructor(supabaseClient) {
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client provided to AgentService');
    }
    this.supabase = supabaseClient;
    this.containerService = new ContainerService();
  }

  // CRITICAL FIX: Use supabase.rpc() instead of direct insert to bypass RLS
  async createSession(userId, sessionData = {}) {
    try {
      errorLogger.info('Creating agent session', {
        userId,
        sessionData,
        component: 'AgentService'
      });

      // FIXED: Use SECURITY DEFINER function instead of direct insert
      const { data, error } = await this.supabase.rpc('create_agent_session', {
        user_uuid: userId,
        initial_status: 'initializing',
        initial_session_data: {
          started_at: new Date().toISOString(),
          runpod_endpoint: process.env.RUNPOD_EMBEDDING_URL || null,
          capabilities: ['chat', 'embed', 'health_check'],
          ...sessionData
        }
      });

      if (error) {
        errorLogger.error('Failed to create agent session via RPC', error, {
          userId,
          error_code: error.code,
          error_message: error.message,
          error_details: error.details,
          component: 'AgentService'
        });
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error('No agent session data returned from create_agent_session function');
      }

      const agentSession = data[0];
      
      errorLogger.success('Agent session created successfully', {
        userId,
        agentId: agentSession.id,
        status: agentSession.status,
        component: 'AgentService'
      });

      return agentSession;

    } catch (error) {
      errorLogger.error('Failed to create agent session', error, {
        userId,
        sessionData,
        component: 'AgentService'
      });
      throw error;
    }
  }

  // FIXED: Use supabase.rpc() for getting active agent
  async getActiveSession(userId) {
    try {
      errorLogger.debug('Getting active agent session', {
        userId,
        component: 'AgentService'
      });

      const { data, error } = await this.supabase.rpc('get_active_agent', {
        user_uuid: userId
      });

      if (error) {
        errorLogger.error('Failed to get active agent session via RPC', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      const activeAgent = data && data.length > 0 ? data[0] : null;

      errorLogger.debug('Active agent session retrieved', {
        userId,
        hasActiveAgent: !!activeAgent,
        agentId: activeAgent?.id,
        status: activeAgent?.status,
        component: 'AgentService'
      });

      return activeAgent;

    } catch (error) {
      errorLogger.error('Failed to get active agent session', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  // FIXED: Use supabase.rpc() for terminating sessions
  async terminateSession(userId) {
    try {
      errorLogger.info('Terminating agent session', {
        userId,
        component: 'AgentService'
      });

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

      errorLogger.success('Agent session terminated successfully', {
        userId,
        terminated: data,
        component: 'AgentService'
      });

      return { success: true, terminated: data };

    } catch (error) {
      errorLogger.error('Failed to terminate agent session', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  // FIXED: Use supabase.rpc() for updating last active
  async updateLastActive(agentId) {
    try {
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

      return { success: true, updated: data };

    } catch (error) {
      errorLogger.error('Failed to update agent last active', error, {
        agentId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  async getSessionStatus(userId) {
    try {
      const activeSession = await this.getActiveSession(userId);
      
      if (!activeSession) {
        return {
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped'
        };
      }

      // Check container health if we have an active session
      let containerStatus = 'unknown';
      let containerHealth = null;

      try {
        if (process.env.RUNPOD_EMBEDDING_URL) {
          const healthCheck = await this.containerService.checkHealth();
          containerStatus = healthCheck.healthy ? 'running' : 'unreachable';
          containerHealth = healthCheck.data;
        }
      } catch (healthError) {
        errorLogger.warn('Container health check failed', {
          userId,
          agentId: activeSession.id,
          error: healthError.message,
          component: 'AgentService'
        });
        containerStatus = 'unreachable';
      }

      return {
        agent_active: true,
        agent_id: activeSession.id,
        last_active: activeSession.last_active,
        container_status: containerStatus,
        container_health: containerHealth,
        session_data: activeSession.session_data
      };

    } catch (error) {
      errorLogger.error('Failed to get session status', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  // FIXED: Use supabase.rpc() for cleanup
  async cleanupStaleSessions() {
    try {
      errorLogger.info('Cleaning up stale agent sessions', {
        component: 'AgentService'
      });

      const { data, error } = await this.supabase.rpc('cleanup_stale_agents');

      if (error) {
        errorLogger.error('Failed to cleanup stale sessions via RPC', error, {
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.success('Stale agent sessions cleaned up', {
        cleanedCount: data,
        component: 'AgentService'
      });

      return { success: true, cleanedCount: data };

    } catch (error) {
      errorLogger.error('Failed to cleanup stale sessions', error, {
        component: 'AgentService'
      });
      throw error;
    }
  }
}