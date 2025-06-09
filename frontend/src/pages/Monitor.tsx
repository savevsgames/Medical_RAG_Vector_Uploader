import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout, StatsLayout } from '../components/layouts';
import { AsyncState } from '../components/feedback';
import { Button } from '../components/ui';
import { useAgents } from '../hooks/useAgents';
import toast from 'react-hot-toast';
import { logger, logUserAction, logApiCall, logAgentOperation } from '../utils/logger';

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
  }, [autoRefresh, agentStatus?.agent_active, fetchAgentStatus, performDetailedStatusCheck]);

  const getStatusStats = () => {
    return [
      {
        label: 'Session',
        value: agentStatus?.agent_active ? 'Active' : 'Inactive',
        color: agentStatus?.agent_active ? 'healing-teal' as const : 'red' as const
      },
      {
        label: 'Container',
        value: agentStatus?.container_status || 'Unknown',
        color: agentStatus?.container_status === 'running' ? 'healing-teal' as const : 'guardian-gold' as const
      },
      {
        label: 'Connection',
        value: detailedStatus?.container_reachable ? 'Reachable' : 'Unknown',
        color: detailedStatus?.container_reachable ? 'healing-teal' as const : 'soft-gray' as const
      },
      {
        label: 'Endpoints',
        value: detailedStatus?.endpoints_working ? 'Working' : 'Unknown',
        color: detailedStatus?.endpoints_working ? 'healing-teal' as const : 'soft-gray' as const
      }
    ];
  };

  return (
    <PageLayout
      title="TxAgent Monitor"
      subtitle="Real-time monitoring of your RunPod containerized AI agent"
      icon={<Activity className="w-6 h-6 text-healing-teal" />}
      actions={
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-soft-gray/30 text-healing-teal focus:ring-healing-teal"
            />
            <label htmlFor="auto-refresh" className="text-sm text-deep-midnight font-body">
              Auto-refresh (30s)
            </label>
          </div>
          <div className="text-right">
            <p className="text-sm text-soft-gray font-body">Last updated</p>
            <p className="text-sm font-subheading font-medium text-deep-midnight">{lastRefresh.toLocaleTimeString()}</p>
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
        {/* Agent Controls */}
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-heading font-bold text-deep-midnight">Agent Controls</h2>
            <div className="flex space-x-2">
              <Button
                variant="primary"
                size="sm"
                onClick={performDetailedStatusCheck}
                disabled={statusTesting || !agentStatus?.agent_active}
                loading={statusTesting}
              >
                {statusTesting ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchAgentStatus()}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Refresh
              </Button>
            </div>
          </div>
          
          <div className="flex space-x-3">
            {agentStatus?.agent_active ? (
              <Button
                variant="danger"
                onClick={stopAgent}
                loading={actionLoading}
              >
                {actionLoading ? 'Deactivating...' : 'Deactivate Session'}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={startAgent}
                loading={actionLoading}
              >
                {actionLoading ? 'Activating...' : 'Activate TxAgent'}
              </Button>
            )}
          </div>
        </div>

        {/* Additional monitoring content would go here */}
        {/* Container info, detailed status, and logs components */}
      </AsyncState>
    </PageLayout>
  );
}