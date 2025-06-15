import React, { useState, useEffect, useCallback } from "react";
import { Activity, RefreshCw, Server, ExternalLink, Copy, Zap, Clock, Database, Play } from 'lucide-react';
import { useAuth } from "../contexts/AuthContext";
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

export function Monitor() {
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
  } = useAgents();

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Auto-refresh functionality
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (autoRefresh) {
      interval = setInterval(() => {
        fetchAgentStatus(true);
        if (agentStatus?.agent_active) {
          performDetailedStatusCheck();
        }
      }, 30000);
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const formatUptime = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
  };

  const getStatusStats = () => {
    return [
      {
        label: "Session",
        value: agentStatus?.agent_active ? "Active" : "Inactive",
        color: agentStatus?.agent_active
          ? ("healing-teal" as const)
          : ("red" as const),
      },
      {
        label: "Container",
        value: agentStatus?.container_status || "Unknown",
        color:
          agentStatus?.container_status === "running"
            ? ("healing-teal" as const)
            : ("guardian-gold" as const),
      },
      {
        label: "Connection",
        value: detailedStatus?.container_reachable ? "Reachable" : "Unknown",
        color: detailedStatus?.container_reachable
          ? ("healing-teal" as const)
          : ("soft-gray" as const),
      },
      {
        label: "Endpoints",
        value: detailedStatus?.endpoints_working ? "Working" : "Unknown",
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
          {/* Auto-refresh toggle */}
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
              className="text-sm text-deep-midnight font-body"
            >
              Auto-refresh (30s)
            </label>
          </div>

          {/* Enhanced Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleComprehensiveRefresh}
            loading={loading || statusTesting}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            {loading || statusTesting ? "Refreshing..." : "Refresh"}
          </Button>

          {/* Last updated indicator */}
          <div className="text-right">
            <p className="text-sm text-soft-gray font-body">Last updated</p>
            <p className="text-sm font-subheading font-medium text-deep-midnight">
              {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </div>
      }
    >
      {/* Status Overview */}
      <StatsLayout stats={getStatusStats()} columns={4} />

      {/* Main Content */}
      <AsyncState
        loading={loading}
        error={null}
        onRetry={() => fetchAgentStatus()}
        loadingText="Loading agent status..."
      >
        {/* Agent Controls - Simplified */}
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-heading font-bold text-deep-midnight">
              Agent Session Management
            </h2>
          </div>

          <div className="text-sm text-soft-gray font-body">
            <p>
              Use the "Activate TxAgent" button above to create a new agent
              session.
            </p>
            <p>
              The "Refresh" button will check container status and endpoint
              health.
            </p>
            <p>Multiple users can have their own independent agent sessions.</p>
          </div>
        </div>

        {/* Container Details Section - ALWAYS VISIBLE */}
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-healing-teal" />
              <h3 className="text-md font-subheading font-semibold text-deep-midnight">
                Container Details
              </h3>
            </div>
            {agentStatus?.session_data?.runpod_endpoint ? (
              <a
                href={agentStatus.session_data.runpod_endpoint}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-sm text-healing-teal hover:text-healing-teal/80 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Container</span>
              </a>
            ) : (
              <span className="text-sm text-soft-gray font-body">
                No active container
              </span>
            )}
          </div>

          {agentStatus?.agent_active && agentStatus?.session_data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Session Information */}
              <div className="bg-sky-blue/20 rounded-xl p-4">
                <h4 className="font-subheading font-medium text-deep-midnight mb-3 flex items-center">
                  <Database className="w-4 h-4 mr-2 text-healing-teal" />
                  Session Information
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-soft-gray font-body">Agent ID:</span>
                    {agentStatus.agent_id ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-deep-midnight text-xs">
                          {agentStatus.agent_id.substring(0, 12)}...
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
                    {agentStatus.session_data.container_id ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-deep-midnight text-xs">
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
                    {agentStatus.session_data.started_at ? (
                      <span className="text-deep-midnight font-body text-xs">
                        {new Date(
                          agentStatus.session_data.started_at
                        ).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-soft-gray font-body italic">
                        Not available
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-soft-gray font-body">Uptime:</span>
                    {agentStatus.session_data.started_at ? (
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-healing-teal" />
                        <span className="text-deep-midnight font-body text-xs">
                          {formatUptime(agentStatus.session_data.started_at)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-soft-gray font-body italic">
                        Not available
                      </span>
                    )}
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
                  typeof agentStatus.container_health === "object" ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-soft-gray font-body">
                          Status:
                        </span>
                        <span className="text-healing-teal font-subheading font-medium">
                          {agentStatus.container_health.status || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-soft-gray font-body">Model:</span>
                        <span className="text-deep-midnight font-body">
                          {agentStatus.container_health.model || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-soft-gray font-body">
                          Device:
                        </span>
                        <span className="text-deep-midnight font-body">
                          {agentStatus.container_health.device || "Unknown"}
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
          <div className="mt-4 bg-guardian-gold/10 rounded-xl p-4">
            <h4 className="font-subheading font-medium text-deep-midnight mb-2 flex items-center">
              <ExternalLink className="w-4 h-4 mr-2 text-guardian-gold" />
              RunPod Endpoint
            </h4>
            {agentStatus?.session_data?.runpod_endpoint ? (
              <div className="flex items-center justify-between bg-cloud-ivory rounded-lg p-3">
                <span className="font-mono text-xs text-deep-midnight break-all">
                  {agentStatus.session_data.runpod_endpoint}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      agentStatus.session_data.runpod_endpoint,
                      "RunPod Endpoint"
                    )
                  }
                  className="ml-2 p-2 hover:bg-sky-blue/20 rounded transition-colors flex-shrink-0"
                >
                  <Copy className="w-4 h-4 text-soft-gray" />
                </button>
              </div>
            ) : (
              <div className="bg-cloud-ivory rounded-lg p-3 text-center">
                <span className="text-soft-gray font-body italic">
                  No endpoint available
                </span>
                <p className="text-xs text-soft-gray mt-1">
                  Endpoint will appear when agent is activated
                </p>
              </div>
            )}
          </div>

          {/* Capabilities - ALWAYS VISIBLE */}
          <div className="mt-4">
            <h4 className="font-subheading font-medium text-deep-midnight mb-2">
              Capabilities
            </h4>
            {agentStatus?.session_data?.capabilities &&
            Array.isArray(agentStatus.session_data.capabilities) ? (
              <div className="flex flex-wrap gap-2">
                {agentStatus.session_data.capabilities.map(
                  (capability: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-healing-teal/10 text-healing-teal rounded-full text-xs font-body"
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

        {/* Connection Test Results - ALWAYS VISIBLE */}
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
          <h2 className="text-lg font-heading font-bold text-deep-midnight mb-4">
            Connection Test Results
          </h2>

          {detailedStatus ? (
            <>
              <div className="text-xs text-soft-gray mb-4 font-body">
                Last tested:{" "}
                {new Date(detailedStatus.last_test_time).toLocaleString()}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Health Endpoint */}
                <div className="bg-sky-blue/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-subheading font-medium text-deep-midnight">
                      Health Check
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-body ${
                        detailedStatus.test_results?.health?.status === 200
                          ? "bg-healing-teal/20 text-healing-teal"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {detailedStatus.test_results?.health?.status || "Failed"}
                    </span>
                  </div>
                  {detailedStatus.test_results?.health?.error && (
                    <p className="text-red-600 text-xs font-body">
                      {detailedStatus.test_results.health.error}
                    </p>
                  )}
                </div>

                {/* Chat Endpoint */}
                <div className="bg-sky-blue/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-subheading font-medium text-deep-midnight">
                      Chat Endpoint
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-body ${
                        detailedStatus.test_results?.chat?.status === 200
                          ? "bg-healing-teal/20 text-healing-teal"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {detailedStatus.test_results?.chat?.status || "Failed"}
                    </span>
                  </div>
                  {detailedStatus.test_results?.chat?.error && (
                    <p className="text-red-600 text-xs font-body">
                      {detailedStatus.test_results.chat.error}
                    </p>
                  )}
                </div>

                {/* Embed Endpoint */}
                <div className="bg-sky-blue/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-subheading font-medium text-deep-midnight">
                      Embed Endpoint
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-body ${
                        detailedStatus.test_results?.embed?.status === 200
                          ? "bg-healing-teal/20 text-healing-teal"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {detailedStatus.test_results?.embed?.status || "Failed"}
                    </span>
                  </div>
                  {detailedStatus.test_results?.embed?.error && (
                    <p className="text-red-600 text-xs font-body">
                      {detailedStatus.test_results.embed.error}
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <span className="text-soft-gray font-body italic">
                No test results available
              </span>
              <p className="text-xs text-soft-gray mt-1">
                Click "Refresh" to run connection tests
              </p>

              {/* Show placeholder test result boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {["Health Check", "Chat Endpoint", "Embed Endpoint"].map(
                  (label) => (
                    <div key={label} className="bg-sky-blue/20 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-subheading font-medium text-deep-midnight">
                          {label}
                        </span>
                        <span className="px-2 py-1 rounded-full text-xs font-body bg-soft-gray/20 text-soft-gray">
                          Not Tested
                        </span>
                      </div>
                      <p className="text-soft-gray text-xs font-body italic">
                        Run tests to see results
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </AsyncState>
    </PageLayout>
  );
}
