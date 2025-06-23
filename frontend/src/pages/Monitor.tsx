import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  RefreshCw,
  Server,
  ExternalLink,
  Copy,
  Zap,
  Clock,
  Database,
  Play,
  Square,
  TestTube,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api"; // ✅ Add centralized API client
import { PageLayout, StatsLayout } from "../components/layouts";
import { AsyncState } from "../components/feedback";
import { Button } from "../components/ui";
import { useAgents } from "../hooks/useAgents";
import toast from "react-hot-toast";
import {
  logger,
  logUserAction,
  logApiCall,
  logAgentOperation,
} from "../utils/logger";

// ✅ Add safe date formatting helper
const formatSafeDate = (dateValue: string | null | undefined): string => {
  if (!dateValue) return "Not available";
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleString();
  } catch (error) {
    return "Date error";
  }
};

// ✅ Add safe uptime calculation
const formatUptime = (startedAt: string | null | undefined): string => {
  if (!startedAt) return "Not available";
  try {
    const start = new Date(startedAt);
    if (isNaN(start.getTime())) return "Invalid start time";

    const now = new Date();
    const diff = now.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  } catch (error) {
    return "Uptime error";
  }
};

export function Monitor() {
  const { session } = useAuth();
  const {
    agentStatus,
    detailedStatus,
    loading,
    actionLoading,
    statusTesting,
    fetchAgentStatus,
    startAgent,
    stopAgent,
    performDetailedStatusCheck,
    // ✅ NEW: Use debouncing state from hook
    isStarting,
    isStopping,
    isTesting,
  } = useAgents();

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [endpointTests, setEndpointTests] = useState({
    health: { loading: false, result: null, error: null },
    chat: { loading: false, result: null, error: null },
    embed: { loading: false, result: null, error: null },
  });

  // ✅ FIXED: Throttled auto-refresh functionality - reduced from ~500ms to 30 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (autoRefresh) {
      // ✅ CRITICAL FIX: Increased interval from frequent polling to 30 seconds
      interval = setInterval(() => {
        // Use silent refresh to reduce logging
        fetchAgentStatus(true);
        if (agentStatus?.agent_active) {
          performDetailedStatusCheck();
        }
      }, 30000); // ✅ Changed from ~500ms to 30 seconds (30,000ms)
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    autoRefresh,
    agentStatus?.agent_active,
    fetchAgentStatus,
    performDetailedStatusCheck,
  ]);

  // ✅ FIXED: Use API client for health endpoint test
  const testHealthEndpoint = async () => {
    setEndpointTests((prev) => ({
      ...prev,
      health: { loading: true, result: null, error: null },
    }));

    try {
      const response = await api.post("/api/agent/test-health");

      setEndpointTests((prev) => ({
        ...prev,
        health: {
          loading: false,
          result: response.data,
          error: null,
        },
      }));

      logApiCall("/api/agent/test-health", "POST", 200);
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Health test failed";

      setEndpointTests((prev) => ({
        ...prev,
        health: { loading: false, result: null, error: errorMessage },
      }));

      logApiCall(
        "/api/agent/test-health",
        "POST",
        error.response?.status || 500
      );
    }
  };

  // ✅ FIXED: Use API client for chat endpoint test
  const testChatEndpoint = async () => {
    setEndpointTests((prev) => ({
      ...prev,
      chat: { loading: true, result: null, error: null },
    }));

    try {
      const response = await api.post("/api/chat", {
        message: "Test connection - health check",
        top_k: 1,
        temperature: 0.1,
      });

      setEndpointTests((prev) => ({
        ...prev,
        chat: {
          loading: false,
          result: response.data,
          error: null,
        },
      }));

      logApiCall("/api/chat", "POST", 200);
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Chat test failed";

      setEndpointTests((prev) => ({
        ...prev,
        chat: { loading: false, result: null, error: errorMessage },
      }));

      logApiCall("/api/chat", "POST", error.response?.status || 500);
    }
  };

  // ✅ FIXED: Use API client for embed endpoint test
  const testEmbedEndpoint = async () => {
    setEndpointTests((prev) => ({
      ...prev,
      embed: { loading: true, result: null, error: null },
    }));

    try {
      const response = await api.post("/api/embed", {
        text: "Test embedding generation for health check",
        normalize: true,
      });

      setEndpointTests((prev) => ({
        ...prev,
        embed: {
          loading: false,
          result: response.data,
          error: null,
        },
      }));

      logApiCall("/api/embed", "POST", 200);
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Embed test failed";

      setEndpointTests((prev) => ({
        ...prev,
        embed: { loading: false, result: null, error: errorMessage },
      }));

      logApiCall("/api/embed", "POST", error.response?.status || 500);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getStatusStats = () => {
    return [
      {
        label: "Agent Status",
        value: agentStatus?.agent_active ? "Active" : "Inactive",
        icon: <Activity className="w-5 h-5" />,
        color: agentStatus?.agent_active
          ? ("healing-teal" as const)
          : ("guardian-gold" as const),
      },
      {
        label: "Connection",
        value: detailedStatus?.container_reachable ? "Reachable" : "Unknown",
        icon: <Server className="w-5 h-5" />,
        color: detailedStatus?.container_reachable
          ? ("healing-teal" as const)
          : ("soft-gray" as const),
      },
      {
        label: "Endpoints",
        value: detailedStatus?.endpoints_working ? "Working" : "Unknown",
        icon: <Zap className="w-5 h-5" />,
        color: detailedStatus?.endpoints_working
          ? ("healing-teal" as const)
          : ("soft-gray" as const),
      },
    ];
  };

  const handleComprehensiveRefresh = useCallback(async () => {
    try {
      setLastRefresh(new Date());

      // First fetch the agent status
      await fetchAgentStatus();

      // If there's an active agent, also perform detailed health check
      if (agentStatus?.agent_active) {
        await performDetailedStatusCheck();
      }

      toast.success("Status refreshed successfully");
    } catch (error) {
      logger.error("Failed to refresh agent status:", {
        error: error instanceof Error ? error.message : "Unknown error",
        component: "Monitor",
      });
      toast.error("Failed to refresh status");
    }
  }, [fetchAgentStatus, performDetailedStatusCheck, agentStatus?.agent_active]);

  return (
    <PageLayout
      title="TxAgent Monitor"
      subtitle="Real-time monitoring of your RunPod containerized AI agent"
      icon={<Activity className="w-6 h-6 text-healing-teal" />}
      actions={
        <div className="flex items-center space-x-4">
          {/* Auto-refresh toggle with updated interval display */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-soft-gray/30 text-healing-teal focus:ring-healing-teal"
            />
            <label
              htmlFor="auto-refresh"
              className="text-sm font-body text-deep-midnight"
            >
              Auto-refresh (30s) {/* ✅ Updated label to show new interval */}
            </label>
          </div>

          {/* Refresh Button */}
          <Button
            variant="ghost"
            onClick={handleComprehensiveRefresh}
            loading={loading || statusTesting}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>
      }
    >
      {/* Stats */}
      <StatsLayout stats={getStatusStats()} columns={3} />

      <AsyncState
        loading={loading}
        error={null}
        onRetry={() => fetchAgentStatus()}
        loadingText="Loading agent status..."
      >
        {/* Agent Controls */}
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-heading font-bold text-deep-midnight">
              Agent Session Management
            </h2>
            <div className="flex space-x-3">
              {agentStatus?.agent_active ? (
                <Button
                  variant="danger"
                  onClick={stopAgent}
                  loading={actionLoading || isStopping} // ✅ Use debouncing state
                  disabled={isStopping} // ✅ Disable when stopping
                  icon={<Square className="w-4 h-4" />}
                >
                  {actionLoading || isStopping ? "Deactivating..." : "Deactivate Session"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={startAgent}
                  loading={actionLoading || isStarting} // ✅ Use debouncing state
                  disabled={isStarting} // ✅ Disable when starting
                  icon={<Play className="w-4 h-4" />}
                >
                  {actionLoading || isStarting ? "Activating..." : "Activate TxAgent"}
                </Button>
              )}
            </div>
          </div>

          <div className="text-sm text-soft-gray font-body">
            <p>
              Use the "Activate TxAgent" button to create a new agent session.
            </p>
            <p>
              The "Refresh" button will check container status and endpoint
              health.
            </p>
            <p>Multiple users can have their own independent agent sessions.</p>
            {/* ✅ Added note about reduced polling frequency */}
            <p className="mt-2 text-xs text-guardian-gold">
              ⚡ Auto-refresh now polls every 30 seconds to reduce server load and improve performance.
            </p>
          </div>
        </div>

        {/* Session Information & Health */}
        {agentStatus?.agent_active ? (
          <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
            <h2 className="text-lg font-heading font-bold text-deep-midnight mb-6">
              Active Session Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Session Information */}
              <div className="bg-sky-blue/20 rounded-xl p-4">
                <h4 className="font-subheading font-medium text-deep-midnight mb-3 flex items-center">
                  <Database className="w-4 h-4 mr-2 text-soft-gray" />
                  Session Information
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-soft-gray font-body">Agent ID:</span>
                    {agentStatus.agent_id ? (
                      <div className="flex items-center space-x-1">
                        <span className="text-deep-midnight font-body text-xs">
                          {agentStatus.agent_id.substring(0, 8)}...
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(agentStatus.agent_id!, "Agent ID")
                          }
                          className="p-1 hover:bg-sky-blue/30 rounded transition-colors"
                        >
                          <Copy className="w-3 h-3 text-soft-gray" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-soft-gray font-body italic">
                        Not available
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-soft-gray font-body">
                      Container ID:
                    </span>
                    {agentStatus.session_data?.container_id ? (
                      <div className="flex items-center space-x-1">
                        <span className="text-deep-midnight font-body text-xs">
                          {agentStatus.session_data.container_id.substring(
                            0,
                            12
                          )}
                          ...
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              agentStatus.session_data.container_id,
                              "Container ID"
                            )
                          }
                          className="p-1 hover:bg-sky-blue/30 rounded transition-colors"
                        >
                          <Copy className="w-3 h-3 text-soft-gray" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-soft-gray font-body italic">
                        Not available
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-soft-gray font-body">Started:</span>
                    <span className="text-deep-midnight font-body text-xs">
                      {formatSafeDate(agentStatus.session_data?.started_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-soft-gray font-body">Uptime:</span>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-healing-teal" />
                      <span className="text-deep-midnight font-body text-xs">
                        {formatUptime(agentStatus.session_data?.started_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Container Health */}
              <div className="bg-healing-teal/10 rounded-xl p-4">
                <h4 className="font-subheading font-medium text-deep-midnight mb-3 flex items-center">
                  <Zap className="w-4 h-4 mr-2 text-healing-teal" />
                  TxAgent Health
                </h4>
                <div className="space-y-2 text-sm">
                  {agentStatus.container_health &&
                  typeof agentStatus.container_health === "object" &&
                  !agentStatus.container_health.error ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-soft-gray font-body">
                          Status:
                        </span>
                        <span className="text-deep-midnight font-body">
                          {agentStatus.container_health.status || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-soft-gray font-body">
                          Version:
                        </span>
                        <span className="text-deep-midnight font-body">
                          {agentStatus.container_health.version || "Unknown"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <span className="text-soft-gray font-body italic">
                        No health data available
                      </span>
                      <p className="text-xs text-soft-gray mt-1">
                        Container may not be running or health check failed
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-sky-blue/20 rounded-xl p-4">
              <h4 className="font-subheading font-medium text-deep-midnight mb-3 flex items-center">
                <Database className="w-4 h-4 mr-2 text-soft-gray" />
                Session Information
              </h4>
              <div className="text-center py-8">
                <span className="text-soft-gray font-body italic">
                  No active agent session
                </span>
                <p className="text-xs text-soft-gray mt-1">
                  Click "Activate TxAgent" to start a session
                </p>
              </div>
            </div>

            <div className="bg-healing-teal/10 rounded-xl p-4">
              <h4 className="font-subheading font-medium text-deep-midnight mb-3 flex items-center">
                <Zap className="w-4 h-4 mr-2 text-soft-gray" />
                TxAgent Health
              </h4>
              <div className="text-center py-8">
                <span className="text-soft-gray font-body italic">
                  No health data available
                </span>
                <p className="text-xs text-soft-gray mt-1">
                  Activate an agent to see health information
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RunPod Endpoint - ALWAYS VISIBLE */}
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
          <h2 className="text-lg font-heading font-bold text-deep-midnight mb-4">
            RunPod Container Configuration
          </h2>

          <div className="bg-deep-midnight/5 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-subheading font-medium text-deep-midnight">
                  TxAgent Endpoint
                </p>
                <p className="text-sm text-soft-gray font-body mt-1">
                  {process.env.NODE_ENV === "development"
                    ? "Development container endpoint"
                    : "Production RunPod container endpoint"}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <code className="bg-white/60 px-3 py-1 rounded text-xs font-mono text-deep-midnight">
                  {import.meta.env.VITE_API_URL || "Same domain"}
                </code>
                <button
                  onClick={() =>
                    copyToClipboard(
                      import.meta.env.VITE_API_URL || window.location.origin,
                      "Endpoint URL"
                    )
                  }
                  className="p-2 hover:bg-white/30 rounded transition-colors"
                >
                  <Copy className="w-4 h-4 text-soft-gray" />
                </button>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="mt-4">
            <h4 className="font-subheading font-medium text-deep-midnight mb-2">
              Available Capabilities
            </h4>
            {agentStatus?.session_data?.capabilities ? (
              <div className="flex flex-wrap gap-2">
                {agentStatus.session_data.capabilities.map(
                  (capability: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-healing-teal/20 text-healing-teal rounded-full text-xs font-body"
                    >
                      {capability}
                    </span>
                  )
                )}
              </div>
            ) : (
              <div className="text-center py-4 bg-soft-gray/10 rounded-lg">
                <span className="text-soft-gray font-body italic">
                  No capabilities data available
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Connection Test Results */}
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
          <h2 className="text-lg font-heading font-bold text-deep-midnight mb-4">
            Container Endpoint Testing
          </h2>

          <div className="text-sm text-soft-gray mb-4 font-body">
            Test individual container endpoints and view raw JSON responses.
            These use the same routes as your Postman tests.
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Health Endpoint Test */}
            <div className="bg-sky-blue/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="font-subheading font-medium text-deep-midnight">
                    Health Endpoint
                  </span>
                  <code className="text-xs bg-white/50 px-2 py-1 rounded font-mono">
                    /api/agent/test-health
                  </code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={testHealthEndpoint}
                  loading={endpointTests.health.loading}
                  icon={<TestTube className="w-4 h-4" />}
                >
                  {endpointTests.health.loading ? "Testing..." : "Test Health"}
                </Button>
              </div>

              {endpointTests.health.result && (
                <div className="mt-3 bg-white/50 rounded p-3">
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(endpointTests.health.result, null, 2)}
                  </pre>
                </div>
              )}

              {endpointTests.health.error && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-700">
                    Error: {endpointTests.health.error}
                  </p>
                </div>
              )}
            </div>

            {/* Chat Endpoint Test */}
            <div className="bg-healing-teal/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="font-subheading font-medium text-deep-midnight">
                    Chat Endpoint
                  </span>
                  <code className="text-xs bg-white/50 px-2 py-1 rounded font-mono">
                    /api/chat
                  </code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={testChatEndpoint}
                  loading={endpointTests.chat.loading}
                  icon={<TestTube className="w-4 h-4" />}
                >
                  {endpointTests.chat.loading ? "Testing..." : "Test Chat"}
                </Button>
              </div>

              {endpointTests.chat.result && (
                <div className="mt-3 bg-white/50 rounded p-3">
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(endpointTests.chat.result, null, 2)}
                  </pre>
                </div>
              )}

              {endpointTests.chat.error && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-700">
                    Error: {endpointTests.chat.error}
                  </p>
                </div>
              )}
            </div>

            {/* Embed Endpoint Test */}
            <div className="bg-guardian-gold/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="font-subheading font-medium text-deep-midnight">
                    Embed Endpoint
                  </span>
                  <code className="text-xs bg-white/50 px-2 py-1 rounded font-mono">
                    /api/embed
                  </code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={testEmbedEndpoint}
                  loading={endpointTests.embed.loading}
                  icon={<TestTube className="w-4 h-4" />}
                >
                  {endpointTests.embed.loading ? "Testing..." : "Test Embed"}
                </Button>
              </div>

              {endpointTests.embed.result && (
                <div className="mt-3 bg-white/50 rounded p-3">
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(endpointTests.embed.result, null, 2)}
                  </pre>
                </div>
              )}

              {endpointTests.embed.error && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-700">
                    Error: {endpointTests.embed.error}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Last refresh info */}
          <div className="mt-6 pt-4 border-t border-soft-gray/20 text-center">
            <p className="text-xs text-soft-gray font-body">
              Last updated: {formatSafeDate(lastRefresh.toISOString())}
            </p>
          </div>
        </div>
      </AsyncState>
    </PageLayout>
  );
}