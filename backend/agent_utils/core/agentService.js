import { errorLogger } from '../shared/logger.js';
import { httpClient } from '../shared/httpClient.js';
import { config } from '../../config/environment.js';

export class AgentService {
  constructor(supabaseClient) {
    // Validate Supabase client
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client: missing from() method');
    }
    
    this.supabase = supabaseClient;
    
    errorLogger.info('AgentService initialized', {
      has_supabase: !!this.supabase,
      supabase_methods: Object.getOwnPropertyNames(this.supabase).slice(0, 5),
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
        .maybeSingle();

      if (error) {
        errorLogger.error('Failed to get active agent', {
          userId,
          component: 'AgentService',
          error_message: error.message,
          error_code: error.code,
          error_details: error.details
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
      errorLogger.error('Failed to get active agent', {
        userId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async startAgent(userId) {
    try {
      errorLogger.info('Starting agent for user', {
        userId,
        component: 'AgentService'
      });

      // Check if user already has an active agent
      const existingAgent = await this.getActiveAgent(userId);
      
      if (existingAgent) {
        errorLogger.info('User already has active agent', {
          userId,
          existingAgentId: existingAgent.id,
          component: 'AgentService'
        });
        
        // Update last_active timestamp
        const { error: updateError } = await this.supabase
          .from('agents')
          .update({ last_active: new Date().toISOString() })
          .eq('id', existingAgent.id);

        if (updateError) {
          errorLogger.warn('Failed to update existing agent timestamp', {
            userId,
            agentId: existingAgent.id,
            error: updateError.message,
            component: 'AgentService'
          });
        }

        return {
          agent_id: existingAgent.id,
          container_id: existingAgent.session_data?.container_id || 'existing',
          status: 'already_active'
        };
      }

      // Create new agent session
      const agentData = {
        user_id: userId,
        status: 'active',
        session_data: {
          started_at: new Date().toISOString(),
          runpod_endpoint: config.runpod.url,
          capabilities: ['chat', 'embed', 'health_check']
        },
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };

      const { data: newAgent, error: insertError } = await this.supabase
        .from('agents')
        .insert(agentData)
        .select()
        .single();

      if (insertError) {
        errorLogger.error('Failed to create new agent', {
          userId,
          component: 'AgentService',
          error_message: insertError.message,
          error_code: insertError.code,
          error_details: insertError.details
        });
        throw insertError;
      }

      errorLogger.success('New agent created successfully', {
        userId,
        agentId: newAgent.id,
        component: 'AgentService'
      });

      return {
        agent_id: newAgent.id,
        container_id: 'new_session',
        status: 'created'
      };

    } catch (error) {
      errorLogger.error('Failed to start agent', {
        userId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async stopAgent(userId) {
    try {
      errorLogger.info('Stopping agent for user', {
        userId,
        component: 'AgentService'
      });

      // Get active agent
      const activeAgent = await this.getActiveAgent(userId);
      
      if (!activeAgent) {
        errorLogger.info('No active agent found to stop', {
          userId,
          component: 'AgentService'
        });
        return { status: 'no_active_agent' };
      }

      // Update agent status to terminated
      const { error: updateError } = await this.supabase
        .from('agents')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('id', activeAgent.id);

      if (updateError) {
        errorLogger.error('Failed to update agent status to terminated', {
          userId,
          agentId: activeAgent.id,
          component: 'AgentService',
          error_message: updateError.message,
          error_code: updateError.code
        });
        throw updateError;
      }

      errorLogger.success('Agent stopped successfully', {
        userId,
        agentId: activeAgent.id,
        component: 'AgentService'
      });

      return {
        agent_id: activeAgent.id,
        status: 'terminated'
      };

    } catch (error) {
      errorLogger.error('Failed to stop agent', {
        userId,
        component: 'AgentService',
        error_message: error.message,
        error_stack: error.stack
      });
      throw error;
    }
  }

  async testContainerHealth(agent) {
    try {
      if (!config.runpod.url) {
        throw new Error('RunPod URL not configured');
      }

      const healthUrl = `${config.runpod.url}/health`;
      
      errorLogger.debug('Testing container health', {
        agentId: agent.id,
        healthUrl,
        component: 'AgentService'
      });

      const response = await httpClient.get(healthUrl, {
        timeout: 5000,
        headers: {
          'Accept': 'application/json'
        }
      });

      errorLogger.success('Container health check passed', {
        agentId: agent.id,
        status: response.status,
        component: 'AgentService'
      });

      return {
        status: 'running',
        health: response.data
      };

    } catch (error) {
      errorLogger.warn('Container health check failed', {
        agentId: agent.id,
        error: error.message,
        component: 'AgentService'
      });

      return {
        status: 'unreachable',
        health: null,
        error: error.message
      };
    }
  }
}