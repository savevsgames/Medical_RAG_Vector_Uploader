import { useState, useEffect, useCallback, useRef } from "react";
import { api, apiHelpers } from "../lib/api"; // ✅ Add new API client
import { useApi } from "./useApi"; // ✅ Keep your existing useApi too
import { logger, logAgentOperation } from "../utils/logger";
import { useAuth } from "../contexts/AuthContext";
import toast from "react-hot-toast";

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  last_active: string | null;
  container_status?: string;
  container_health?: string | object;
  session_data?: any;
}

interface DetailedStatus {
  container_reachable: boolean;
  jwt_valid: boolean;
  endpoints_working: boolean;
  last_test_time: string;
  test_results: {
    health: { status: number; response?: any; error?: string };
    chat: { status: number; response?: any; error?: string };
    embed: { status: number; response?: any; error?: string };
  };
}

export function useAgents() {
  const { apiCall, loading } = useApi(); // ✅ Keep your existing hook as fallback
  const { user } = useAuth();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [detailedStatus, setDetailedStatus] = useState<DetailedStatus | null>(
    null
  );
  const [actionLoading, setActionLoading] = useState(false);
  const [statusTesting, setStatusTesting] = useState(false);

  // ✅ NEW: Debouncing refs to prevent multiple simultaneous operations
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const testingRef = useRef(false);

  // ✅ UPDATED: Use new API client with fallback to old one
  const fetchAgentStatus = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          logger.info("Fetching agent status", {
            user: user?.email,
            component: "useAgents",
          });
        }

        // ✅ Use new centralized API client
        const response = await apiHelpers.agent.getStatus();
        const data = response.data;

        setAgentStatus(data);

        if (!silent) {
          logAgentOperation("Status Fetched", user?.email, {
            agentActive: data.agent_active,
            containerStatus: data.container_status,
            component: "useAgents",
          });
        }

        return data;
      } catch (error: any) {
        if (!silent) {
          logger.error("Failed to fetch agent status", {
            component: "useAgents",
            user: user?.email,
            error:
              error.response?.data?.error || error.message || "Unknown error",
          });
        }
        throw error;
      }
    },
    [user]
  );

  // ✅ UPDATED: Use new API client with debouncing
  const startAgent = useCallback(async () => {
    // ✅ DEBOUNCING: Prevent multiple simultaneous start operations
    if (startingRef.current) {
      logger.warn("Start agent already in progress, ignoring duplicate request", {
        user: user?.email,
        component: "useAgents",
      });
      return;
    }

    startingRef.current = true;
    setActionLoading(true);
    
    try {
      logger.info("Starting agent session", {
        user: user?.email,
        component: "useAgents",
      });

      const response = await apiHelpers.agent.start();
      const data = response.data;

      // Update local state immediately
      setAgentStatus({
        agent_active: true,
        agent_id: data.agent_id,
        last_active: new Date().toISOString(),
        container_status: "running",
        session_data: data.session_data,
      });

      logAgentOperation("Started Successfully", user?.email, {
        agentId: data.agent_id,
        containerId: data.container_id,
        component: "useAgents",
      });

      toast.success("TxAgent session activated successfully!");

      // ✅ THROTTLED: Refresh status after a longer delay to reduce requests
      setTimeout(() => fetchAgentStatus(true), 3000); // ✅ Increased from 1s to 3s

      return data;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Unknown error";

      logAgentOperation("Start Failed", user?.email, {
        error: errorMessage,
        component: "useAgents",
      });

      toast.error(`Failed to start agent: ${errorMessage}`);
      throw error;
    } finally {
      setActionLoading(false);
      // ✅ DEBOUNCING: Reset the flag after operation completes
      startingRef.current = false;
    }
  }, [user, fetchAgentStatus]);

  // ✅ UPDATED: Use new API client with debouncing
  const stopAgent = useCallback(async () => {
    // ✅ DEBOUNCING: Prevent multiple simultaneous stop operations
    if (stoppingRef.current) {
      logger.warn("Stop agent already in progress, ignoring duplicate request", {
        user: user?.email,
        component: "useAgents",
      });
      return;
    }

    stoppingRef.current = true;
    setActionLoading(true);
    
    try {
      logger.info("Stopping agent session", {
        user: user?.email,
        component: "useAgents",
      });

      await apiHelpers.agent.stop();

      // Update local state immediately
      setAgentStatus({
        agent_active: false,
        agent_id: null,
        last_active: null,
        container_status: "stopped",
      });

      setDetailedStatus(null);

      logAgentOperation("Stopped Successfully", user?.email, {
        component: "useAgents",
      });

      toast.success("TxAgent session deactivated successfully!");

      // ✅ THROTTLED: Refresh status after a longer delay to reduce requests
      setTimeout(() => fetchAgentStatus(true), 3000); // ✅ Increased from 1s to 3s
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Unknown error";

      logAgentOperation("Stop Failed", user?.email, {
        error: errorMessage,
        component: "useAgents",
      });

      toast.error(`Failed to stop agent: ${errorMessage}`);
      throw error;
    } finally {
      setActionLoading(false);
      // ✅ DEBOUNCING: Reset the flag after operation completes
      stoppingRef.current = false;
    }
  }, [user, fetchAgentStatus]);

  // ✅ UPDATED: Use new API client for detailed testing with debouncing
  const performDetailedStatusCheck = useCallback(async () => {
    if (!agentStatus?.agent_active) {
      logger.warn("Cannot perform detailed status check - no active agent", {
        user: user?.email,
        component: "useAgents",
      });
      return;
    }

    // ✅ DEBOUNCING: Prevent multiple simultaneous test operations
    if (testingRef.current) {
      logger.warn("Detailed status check already in progress, ignoring duplicate request", {
        user: user?.email,
        component: "useAgents",
      });
      return;
    }

    testingRef.current = true;
    setStatusTesting(true);
    
    try {
      logger.info("Performing detailed status check", {
        user: user?.email,
        agentId: agentStatus.agent_id,
        component: "useAgents",
      });

      const testResults = {
        health: { status: 0, response: null, error: null },
        chat: { status: 0, response: null, error: null },
        embed: { status: 0, response: null, error: null },
      };

      // ✅ Test health endpoint with new API client
      try {
        const healthResponse = await apiHelpers.agent.healthCheck();
        testResults.health.status = 200;
        testResults.health.response = healthResponse.data;
      } catch (error: any) {
        testResults.health.error =
          error.response?.data?.error || error.message || "Unknown error";
      }

      // ✅ Test chat endpoint with new API client
      try {
        const chatResponse = await apiHelpers.chat(
          "Test connection - please respond with 'OK'",
          {
            context: [],
          }
        );
        testResults.chat.status = 200;
        testResults.chat.response = chatResponse.data;
      } catch (error: any) {
        testResults.chat.error =
          error.response?.data?.error || error.message || "Unknown error";
      }

      // ✅ Test embed endpoint with new API client
      try {
        const embedResponse = await apiHelpers.embed(
          "Test document for embedding",
          {
            metadata: { test: true },
          }
        );
        testResults.embed.status = 200;
        testResults.embed.response = embedResponse.data;
      } catch (error: any) {
        testResults.embed.error =
          error.response?.data?.error || error.message || "Unknown error";
      }

      const newDetailedStatus: DetailedStatus = {
        container_reachable: testResults.health.status === 200,
        jwt_valid: testResults.health.status !== 401,
        endpoints_working:
          testResults.chat.status === 200 || testResults.embed.status === 200,
        last_test_time: new Date().toISOString(),
        test_results: testResults,
      };

      setDetailedStatus(newDetailedStatus);

      logger.success("Detailed status check completed", {
        user: user?.email,
        container_reachable: newDetailedStatus.container_reachable,
        endpoints_working: newDetailedStatus.endpoints_working,
        component: "useAgents",
      });

      return newDetailedStatus;
    } catch (error: any) {
      logger.error("Detailed status check failed", {
        component: "useAgents",
        user: user?.email,
        error: error.response?.data?.error || error.message || "Unknown error",
      });
      throw error;
    } finally {
      setStatusTesting(false);
      // ✅ DEBOUNCING: Reset the flag after operation completes
      testingRef.current = false;
    }
  }, [user, agentStatus]);

  // ✅ THROTTLED: Auto-fetch status on mount with reduced frequency
  useEffect(() => {
    if (user) {
      fetchAgentStatus(true);
    }
  }, [fetchAgentStatus, user]);

  return {
    agentStatus,
    detailedStatus,
    loading,
    actionLoading,
    statusTesting,
    fetchAgentStatus,
    startAgent,
    stopAgent,
    performDetailedStatusCheck,
    // ✅ NEW: Expose debouncing state for UI feedback
    isStarting: startingRef.current,
    isStopping: stoppingRef.current,
    isTesting: testingRef.current,
  };
}