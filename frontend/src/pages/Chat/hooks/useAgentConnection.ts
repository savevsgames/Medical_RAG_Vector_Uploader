import { useState, useCallback, useRef } from "react";
import { api, apiHelpers } from "../../../lib/api"; // ✅ Add new API client
import { useApi } from "../../../hooks/useApi"; // ✅ Keep as fallback
import { useAuth } from "../../../contexts/AuthContext";
import { logger, logAgentOperation } from "../../../utils/logger";
import toast from "react-hot-toast";

interface ConnectionStatus {
  isConnected: boolean;
  canChat: boolean;
  canStart: boolean;
  status: "connected" | "disconnected" | "error" | "starting" | "checking";
  message: string;
  lastError?: string;
}

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  container_status?: string;
  container_health?: any;
  session_data?: any;
}

export function useAgentConnection() {
  const { apiCall } = useApi(); // ✅ Keep as fallback
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    canChat: false,
    canStart: true,
    status: "checking",
    message: "Checking connection...",
  });
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastConnectionCheck, setLastConnectionCheck] = useState<Date>(
    new Date()
  );

  // Prevent multiple simultaneous connection checks
  const checkingRef = useRef(false);

  const updateConnectionStatus = useCallback(
    (
      status: ConnectionStatus["status"],
      message: string,
      canChat: boolean = false,
      canStart: boolean = true,
      lastError?: string
    ) => {
      setConnectionStatus({
        isConnected: status === "connected",
        canChat,
        canStart,
        status,
        message,
        lastError,
      });
    },
    []
  );

  // ✅ UPDATED: Use new API client
  const checkConnection = useCallback(
    async (silent = false) => {
      // Prevent multiple simultaneous checks
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        if (!silent) {
          updateConnectionStatus("checking", "Checking agent connection...");
        }

        // Step 1: Check agent status with new API client
        const response = await apiHelpers.agent.getStatus();
        const statusData = response.data;

        setAgentStatus(statusData);
        setLastConnectionCheck(new Date());

        if (!statusData.agent_active) {
          updateConnectionStatus(
            "disconnected",
            "TxAgent session is not active. Start the agent to begin chatting.",
            false,
            true
          );
          return;
        }

        // Step 2: Test actual connectivity with new API client
        try {
          await apiHelpers.chat("connection_test", { context: [] });

          updateConnectionStatus(
            "connected",
            `TxAgent is ready! Session: ${statusData.agent_id?.substring(
              0,
              8
            )}...`,
            true,
            false
          );

          if (!silent) {
            logAgentOperation("Connection Verified", user?.email, {
              agentId: statusData.agent_id,
              containerStatus: statusData.container_status,
              component: "useAgentConnection",
            });
          }
        } catch (chatError: any) {
          const errorMessage =
            chatError.response?.data?.error ||
            chatError.message ||
            "Unknown error";

          updateConnectionStatus(
            "error",
            "TxAgent session is active but not responding to chat requests.",
            false,
            false,
            errorMessage
          );

          if (!silent) {
            logger.error("Chat endpoint test failed", {
              component: "useAgentConnection",
              user: user?.email,
              error: errorMessage,
              agentId: statusData.agent_id,
            });
          }
        }
      } catch (statusError: any) {
        const errorMessage =
          statusError.response?.data?.error ||
          statusError.message ||
          "Unknown error";

        updateConnectionStatus(
          "error",
          "Failed to check agent status. Please check your connection.",
          false,
          true,
          errorMessage
        );

        if (!silent) {
          logger.error("Agent status check failed", {
            component: "useAgentConnection",
            user: user?.email,
            error: errorMessage,
          });
        }
      } finally {
        checkingRef.current = false;
      }
    },
    [user, updateConnectionStatus]
  );

  // ✅ UPDATED: Use new API client for starting agent
  const startAgent = useCallback(async () => {
    setIsConnecting(true);
    updateConnectionStatus("starting", "Starting TxAgent session...");

    try {
      const response = await apiHelpers.agent.start();
      const data = response.data;

      setAgentStatus({
        agent_active: true,
        agent_id: data.agent_id,
        container_status: "running",
      });

      logAgentOperation("Started Successfully", user?.email, {
        agentId: data.agent_id,
        component: "useAgentConnection",
      });

      toast.success("TxAgent started successfully!");

      // Wait a moment then check connection
      setTimeout(() => checkConnection(), 2000);
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Unknown error";

      updateConnectionStatus(
        "error",
        "Failed to start TxAgent session.",
        false,
        true,
        errorMessage
      );

      logAgentOperation("Start Failed", user?.email, {
        error: errorMessage,
        component: "useAgentConnection",
      });

      toast.error(`Failed to start agent: ${errorMessage}`);
    } finally {
      setIsConnecting(false);
    }
  }, [user, updateConnectionStatus, checkConnection]);

  // ✅ UPDATED: Use new API client for stopping agent
  const stopAgent = useCallback(async () => {
    setIsConnecting(true);
    updateConnectionStatus("disconnected", "Stopping TxAgent session...");

    try {
      await apiHelpers.agent.stop();

      setAgentStatus({
        agent_active: false,
        agent_id: null,
        container_status: "stopped",
      });

      updateConnectionStatus(
        "disconnected",
        "TxAgent session stopped.",
        false,
        true
      );

      logAgentOperation("Stopped Successfully", user?.email, {
        component: "useAgentConnection",
      });

      toast.success("TxAgent stopped successfully!");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Unknown error";

      logAgentOperation("Stop Failed", user?.email, {
        error: errorMessage,
        component: "useAgentConnection",
      });

      toast.error(`Failed to stop agent: ${errorMessage}`);
    } finally {
      setIsConnecting(false);
    }
  }, [user, updateConnectionStatus]);

  return {
    connectionStatus,
    agentStatus,
    isConnecting,
    lastConnectionCheck,
    checkConnection,
    startAgent,
    stopAgent,
  };
}
