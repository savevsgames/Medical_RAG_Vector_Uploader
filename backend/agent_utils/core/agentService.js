import { errorLogger } from '../shared/logger.js';

export class AgentService {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('AgentService requires a Supabase client instance');
    }
    
    this.supabase = supabaseClient;
    
    // Validate that the client has the expected methods
    if (typeof this.supabase.from !== 'function') {
      throw new Error('Invalid Supabase client: missing from() method');
    }
    
    errorLogger.debug('AgentService initialized with Supabase client', {
      hasFromMethod: typeof this.supabase.from === 'function',
      component: 'AgentService'
    });
  }

  async getActiveAgent(userId) {
    try {
      errorLogger.debug('Getting active agent for user', {
        userId,
        component: 'AgentService'
      });

      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        errorLogger.error('Failed to get active agent', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.debug('Active agent query completed', {
        userId,
        hasActiveAgent: !!data,
        agentId: data?.id,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Failed to get active agent', error, {
        userId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async startAgent(userId, sessionData = {}) {
    try {
      errorLogger.info('Starting agent session', {
        userId,
        sessionData,
        component: 'AgentService'
      });

      // First, terminate any existing active agents for this user
      await this.terminateActiveAgents(userId);

      // Create new agent session
      const { data, error } = await this.supabase
        .from('agents')
        .insert({
          user_id: userId,
          status: 'active',
          session_data: sessionData,
          last_active: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        errorLogger.error('Failed to create agent session', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.success('Agent session started successfully', {
        userId,
        agentId: data.id,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Failed to start agent', error, {
        userId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async stopAgent(userId, agentId = null) {
    try {
      errorLogger.info('Stopping agent session', {
        userId,
        agentId,
        component: 'AgentService'
      });

      let query = this.supabase
        .from('agents')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (agentId) {
        query = query.eq('id', agentId);
      } else {
        query = query.eq('status', 'active');
      }

      const { data, error } = await query.select();

      if (error) {
        errorLogger.error('Failed to stop agent session', error, {
          userId,
          agentId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.success('Agent session stopped successfully', {
        userId,
        agentId,
        stoppedAgents: data?.length || 0,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Failed to stop agent', error, {
        userId,
        agentId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async updateAgentActivity(userId, agentId = null) {
    try {
      let query = this.supabase
        .from('agents')
        .update({
          last_active: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (agentId) {
        query = query.eq('id', agentId);
      }

      const { data, error } = await query.select();

      if (error) {
        errorLogger.error('Failed to update agent activity', error, {
          userId,
          agentId,
          component: 'AgentService'
        });
        throw error;
      }

      return data;
    } catch (error) {
      errorLogger.error('Failed to update agent activity', error, {
        userId,
        agentId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async terminateActiveAgents(userId) {
    try {
      errorLogger.debug('Terminating existing active agents', {
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
        .eq('status', 'active')
        .select();

      if (error) {
        errorLogger.error('Failed to terminate active agents', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.debug('Terminated active agents', {
        userId,
        terminatedCount: data?.length || 0,
        component: 'AgentService'
      });

      return data;
    } catch (error) {
      errorLogger.error('Failed to terminate active agents', error, {
        userId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async getAgentStatus(userId) {
    try {
      const activeAgent = await this.getActiveAgent(userId);
      
      const status = {
        agent_active: !!activeAgent,
        agent_id: activeAgent?.id || null,
        last_active: activeAgent?.last_active || null,
        container_status: activeAgent?.session_data?.container_status || 'unknown',
        container_health: activeAgent?.session_data?.container_health || null,
        session_data: activeAgent?.session_data || {}
      };

      errorLogger.debug('Agent status retrieved', {
        userId,
        status,
        component: 'AgentService'
      });

      return status;
    } catch (error) {
      errorLogger.error('Failed to get agent status', error, {
        userId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }
}