import { supabase } from '../../config/database.js';
import { errorLogger } from '../shared/logger.js';
import axios from 'axios';
import { config } from '../../config/environment.js';

export class AgentService {
  constructor() {
    this.supabase = supabase;
  }

  async getActiveAgent(userId) {
    errorLogger.debug('Fetching active agent for user', { 
      userId,
      component: 'AgentService'
    });

    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        errorLogger.error('Error fetching active agent from DB', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      // Check container health if agent exists and has session data
      let containerHealth = null;
      let containerStatus = 'stopped';

      if (data && data.session_data && data.session_data.runpod_endpoint) {
        try {
          const healthUrl = `${data.session_data.runpod_endpoint.replace(/\/+$/, '')}/health`;
          errorLogger.debug('Checking container health', {
            healthUrl,
            agentId: data.id,
            component: 'AgentService'
          });

          const response = await axios.get(healthUrl, { 
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          containerHealth = response.data;
          containerStatus = 'running';
          
          errorLogger.debug('Container health check successful', { 
            healthUrl, 
            containerHealth,
            agentId: data.id,
            component: 'AgentService'
          });
        } catch (healthError) {
          errorLogger.warn('Failed to get container health', {
            agentId: data.id,
            runpodEndpoint: data.session_data.runpod_endpoint,
            error: healthError.message,
            errorCode: healthError.code,
            component: 'AgentService'
          });
          containerHealth = { 
            status: 'unreachable', 
            error: healthError.message 
          };
          containerStatus = 'unreachable';
        }
      }

      const result = {
        agent_active: !!data && data.status !== 'terminated',
        agent_id: data ? data.id : null,
        last_active: data ? data.last_active : null,
        container_status: containerStatus,
        container_health: containerHealth,
        session_data: data ? data.session_data : null
      };

      errorLogger.debug('Agent status result', {
        userId,
        result,
        component: 'AgentService'
      });

      return result;
    } catch (error) {
      errorLogger.error('Failed to get active agent', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  async startAgent(userId) {
    errorLogger.info('Attempting to start agent for user', { 
      userId,
      component: 'AgentService'
    });

    try {
      // Check if agent already exists and is active
      const existingAgent = await this.getActiveAgent(userId);
      if (existingAgent.agent_active && existingAgent.container_status === 'running') {
        errorLogger.info('Agent already active for user', {
          userId,
          agentId: existingAgent.agent_id,
          component: 'AgentService'
        });
        return {
          id: existingAgent.agent_id,
          status: 'already_active',
          message: 'Agent session already active'
        };
      }

      // Create or update agent session
      const sessionData = {
        started_at: new Date().toISOString(),
        runpod_endpoint: config.runpod.url || 'http://localhost:8000/mock-runpod',
        capabilities: ['chat', 'embed', 'health_check']
      };

      const { data, error } = await this.supabase
        .from('agents')
        .upsert({
          user_id: userId,
          status: 'initializing',
          session_data: sessionData,
          last_active: new Date().toISOString()
        }, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) {
        errorLogger.error('Error starting agent in DB', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      // Update status to running after successful creation
      const { data: updatedData, error: updateError } = await this.supabase
        .from('agents')
        .update({ 
          status: 'running',
          last_active: new Date().toISOString()
        })
        .eq('id', data.id)
        .select()
        .single();

      if (updateError) {
        errorLogger.error('Error updating agent status to running', updateError, {
          userId,
          agentId: data.id,
          component: 'AgentService'
        });
        throw updateError;
      }

      errorLogger.success('Agent started successfully in DB', { 
        agentId: updatedData.id,
        userId,
        status: updatedData.status,
        component: 'AgentService'
      });

      return {
        id: updatedData.id,
        status: 'activated',
        container_id: `agent-${updatedData.id}`,
        message: 'Agent session activated successfully'
      };
    } catch (error) {
      errorLogger.error('Failed to start agent', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }

  async stopAgent(userId) {
    errorLogger.info('Attempting to stop agent for user', { 
      userId,
      component: 'AgentService'
    });

    try {
      const { data, error } = await this.supabase
        .from('agents')
        .update({ 
          status: 'terminated', 
          terminated_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        errorLogger.error('Error stopping agent in DB', error, {
          userId,
          component: 'AgentService'
        });
        throw error;
      }

      errorLogger.success('Agent stopped successfully in DB', { 
        agentId: data.id,
        userId,
        component: 'AgentService'
      });

      return {
        id: data.id,
        status: 'terminated',
        message: 'Agent session terminated successfully'
      };
    } catch (error) {
      errorLogger.error('Failed to stop agent', error, {
        userId,
        component: 'AgentService'
      });
      throw error;
    }
  }
}