import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { StatusOverview } from './components/StatusOverview';
import { AgentControls } from './components/AgentControls';
import { ContainerInfo } from './components/ContainerInfo';
import { ActivityLogs } from './components/ActivityLogs';
import { ConnectionTest } from './components/ConnectionTest';
import { DebugPanel } from './components/DebugPanel';
import { useAgents } from '../../hooks/useAgents';
import { useAgentStatus } from './hooks/useAgentStatus';
import { Card } from '../../components/ui/Card';

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
    performDetailedStatusCheck
  } = useAgents();

  const {
    autoRefresh,
    setAutoRefresh,
    lastRefresh,
    containerLogs,
    addLog,
    clearLogs
  } = useAgentStatus();

  // Auto-refresh functionality
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchAgentStatus(true); // Silent refresh
        if (agentStatus?.agent_active) {
          performDetailedStatusCheck();
        }
      }, 30000); // 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, agentStatus?.agent_active, fetchAgentStatus, performDetailedStatusCheck]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg">
              <Activity className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">TxAgent Monitor</h1>
              <p className="text-gray-600">Real-time monitoring of your RunPod containerized AI agent</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="auto-refresh" className="text-sm text-gray-700">
                Auto-refresh (30s)
              </label>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Last updated</p>
              <p className="text-sm font-medium text-gray-900">{lastRefresh.toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Status Overview */}
      <StatusOverview
        agentStatus={agentStatus}
        detailedStatus={detailedStatus}
        onRefresh={() => fetchAgentStatus()}
        onTest={performDetailedStatusCheck}
        testing={statusTesting}
      />

      {/* Agent Controls */}
      <AgentControls
        agentStatus={agentStatus}
        actionLoading={actionLoading}
        onStart={startAgent}
        onStop={stopAgent}
        onTest={performDetailedStatusCheck}
        testing={statusTesting}
      />

      {/* Container Information */}
      {(agentStatus?.session_data || detailedStatus) && (
        <ContainerInfo
          agentStatus={agentStatus}
          detailedStatus={detailedStatus}
        />
      )}

      {/* Connection Test */}
      <ConnectionTest
        detailedStatus={detailedStatus}
        onTest={performDetailedStatusCheck}
        testing={statusTesting}
      />

      {/* Activity Logs */}
      <ActivityLogs
        logs={containerLogs}
        onClear={clearLogs}
      />

      {/* Debug Panel */}
      {import.meta.env.DEV && (
        <DebugPanel
          agentStatus={agentStatus}
          detailedStatus={detailedStatus}
        />
      )}
    </div>
  );
}