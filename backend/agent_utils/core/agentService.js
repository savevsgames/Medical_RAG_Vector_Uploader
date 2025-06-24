import { errorLogger } from "../shared/logger.js";

export class AgentService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    
    // Validate that we have a proper Supabase client
    if (!supabaseClient || typeof supabaseClient.from !== "function") {
      throw new Error("Invalid Supabase client provided to AgentService");
    }

    errorLogger.info("AgentService initialized", {
      hasSupabaseClient: !!supabaseClient,
      clientType: supabaseClient.constructor?.name || "unknown",
      component: "AgentService"
    });
  }

  /**
   * Get active agent for a user using the RPC function
   * This uses SECURITY DEFINER to bypass RLS issues
   */
  async getActiveAgent(userId) {
    try {
      errorLogger.info("Fetching active agent via RPC function", {
        userId,
        component: "AgentService"
      });

      // ✅ CRITICAL FIX: Use the RPC function instead of direct table query
      const { data, error } = await this.supabase.rpc('get_active_agent', { 
        user_uuid: userId 
      });

      if (error) {
        errorLogger.error("Error fetching active agent via RPC", error, {
          userId,
          errorCode: error.code,
          errorMessage: error.message,
          component: "AgentService"
        });
        throw error;
      }

      // RPC returns an array, so take the first element (or null if empty)
      const agent = data && data.length > 0 ? data[0] : null;

      errorLogger.info("Active agent fetched successfully via RPC", {
        userId,
        hasAgent: !!agent,
        agentId: agent?.id,
        agentStatus: agent?.status,
        component: "AgentService"
      });

      return agent;
    } catch (error) {
      errorLogger.error("Failed to fetch active agent", error, {
        userId,
        errorStack: error.stack,
        component: "AgentService"
      });
      throw error;
    }
  }

  /**
   * Create a new agent session using the RPC function
   * This uses SECURITY DEFINER to bypass RLS issues
   */
  async createAgentSession(userId, status = 'initializing', sessionData = {}) {
    try {
      errorLogger.info("Creating agent session via RPC function", {
        userId,
        status,
        sessionData,
        component: "AgentService"
      });

      // ✅ CRITICAL FIX: Use the RPC function instead of direct table insert
      const { data, error } = await this.supabase.rpc('create_agent_session', {
        user_uuid: userId,
        initial_status: status,
        initial_session_data: sessionData
      });

      if (error) {
        errorLogger.error("Error creating agent session via RPC", error, {
          userId,
          status,
          sessionData,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          component: "AgentService"
        });
        throw error;
      }

      // RPC returns an array, so take the first element
      const agent = data && data.length > 0 ? data[0] : null;

      if (!agent) {
        const noDataError = new Error("RPC function returned no data for created agent");
        errorLogger.error("No agent data returned from RPC", noDataError, {
          userId,
          status,
          sessionData,
          rpcResponse: data,
          component: "AgentService"
        });
        throw noDataError;
      }

      errorLogger.success("Agent session created successfully via RPC", {
        userId,
        agentId: agent.id,
        agentStatus: agent.status,
        sessionData: agent.session_data,
        component: "AgentService"
      });

      return agent;
    } catch (error) {
      errorLogger.error("Failed to create agent session", error, {
        userId,
        status,
        sessionData,
        errorStack: error.stack,
        component: "AgentService"
      });
      throw error;
    }
  }

  /**
   * Update agent status - this can use direct table update since it's just updating existing records
   */
  async updateAgentStatus(agentId, newStatus) {
    try {
      errorLogger.info("Updating agent status", {
        agentId,
        newStatus,
        component: "AgentService"
      });

      const { data, error } = await this.supabase
        .from('agents')
        .update({ 
          status: newStatus, 
          last_active: new Date().toISOString() 
        })
        .eq('id', agentId)
        .select()
        .single();

      if (error) {
        errorLogger.error("Error updating agent status", error, {
          agentId,
          newStatus,
          errorCode: error.code,
          errorMessage: error.message,
          component: "AgentService"
        });
        throw error;
      }

      errorLogger.success("Agent status updated successfully", {
        agentId,
        newStatus,
        updatedAgent: data,
        component: "AgentService"
      });

      return data;
    } catch (error) {
      errorLogger.error("Failed to update agent status", error, {
        agentId,
        newStatus,
        errorStack: error.stack,
        component: "AgentService"
      });
      throw error;
    }
  }

  /**
   * Terminate agent session - update existing records to terminated status
   */
  async terminateAgentSession(userId) {
    try {
      errorLogger.info("Terminating agent session", {
        userId,
        component: "AgentService"
      });

      const { data, error } = await this.supabase
        .from('agents')
        .update({ 
          status: 'terminated', 
          terminated_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        })
        .eq('user_id', userId)
        .in('status', ['active', 'initializing']) // Terminate active or initializing sessions
        .select();

      if (error) {
        errorLogger.error("Error terminating agent session", error, {
          userId,
          errorCode: error.code,
          errorMessage: error.message,
          component: "AgentService"
        });
        throw error;
      }

      const terminatedCount = data ? data.length : 0;

      errorLogger.success("Agent session terminated successfully", {
        userId,
        terminatedCount,
        terminatedAgents: data,
        component: "AgentService"
      });

      return data;
    } catch (error) {
      errorLogger.error("Failed to terminate agent session", error, {
        userId,
        errorStack: error.stack,
        component: "AgentService"
      });
      throw error;
    }
  }

  /**
   * Get all agents for a user (for debugging/admin purposes)
   */
  async getAllAgentsForUser(userId) {
    try {
      errorLogger.info("Fetching all agents for user", {
        userId,
        component: "AgentService"
      });

      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        errorLogger.error("Error fetching all agents for user", error, {
          userId,
          errorCode: error.code,
          errorMessage: error.message,
          component: "AgentService"
        });
        throw error;
      }

      errorLogger.info("All agents fetched successfully", {
        userId,
        agentCount: data ? data.length : 0,
        component: "AgentService"
      });

      return data || [];
    } catch (error) {
      errorLogger.error("Failed to fetch all agents for user", error, {
        userId,
        errorStack: error.stack,
        component: "AgentService"
      });
      throw error;
    }
  }

  /**
   * Health check method to verify service functionality
   */
  async healthCheck() {
    try {
      errorLogger.info("Performing AgentService health check", {
        component: "AgentService"
      });

      // Test basic Supabase connectivity
      const { data, error } = await this.supabase
        .from('agents')
        .select('count', { count: 'exact', head: true })
        .limit(1);

      if (error) {
        errorLogger.error("AgentService health check failed", error, {
          errorCode: error.code,
          errorMessage: error.message,
          component: "AgentService"
        });
        return {
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }

      errorLogger.success("AgentService health check passed", {
        agentCount: data,
        component: "AgentService"
      });

      return {
        healthy: true,
        agentCount: data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      errorLogger.error("AgentService health check exception", error, {
        errorStack: error.stack,
        component: "AgentService"
      });
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}