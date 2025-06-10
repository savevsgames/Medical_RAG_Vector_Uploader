import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import { logger, logAgentOperation } from '../utils/logger';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

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
  const { apiCall, loading } = useApi();
  const { user } = useAuth();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [detailedStatus, setDetailedStatus] = useState<DetailedStatus | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusTesting, setStatusTesting] = useState(false);

  const fetchAgentStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        logger.info('Fetching agent status', {
          user: user?.email,
          component: 'useAgents'
        });
      }

      const data = await apiCall('/api/agent/status');
      setAgentStatus(data);
      
      if (!silent) {
        logAgentOperation('Status Fetched', user?.email, {
          agentActive: data.agent_active,
          containerStatus: data.container_status,
          component: 'useAgents'
        });
      }

      return data;
    } catch (error) {
      if (!silent) {
        logger.error('Failed to fetch agent status', {
          component: 'useAgents',
          user: user?.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      throw error;
    }
  }, [apiCall, user]);

  const startAgent = useCallback(async () => {
    setActionLoading(true);
    try {
      logger.info('Starting agent session', {
        user: user?.email,
        component: 'useAgents'
      });

      const data = await apiCall('/api/agent/start', { method: 'POST' });
      
      // Update local state immediately
      setAgentStatus({
        agent_active: true,
        agent_id: data.agent_id,
        last_active: new Date().toISOString(),
        container_status: 'running',
        session_data: data.session_data
      });

      logAgentOperation('Started Successfully', user?.email, {
        agentId: data.agent_id,
        containerId: data.container_id,
        component: 'useAgents'
      });

      toast.success('TxAgent session activated successfully!');
      
      // Refresh status after a short delay
      setTimeout(() => fetchAgentStatus(true), 1000);
      
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logAgentOperation('Start Failed', user?.email, {
        error: errorMessage,
        component: 'useAgents'
      });

      toast.error(`Failed to start agent: ${errorMessage}`);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, [apiCall, user, fetchAgentStatus]);

  const stopAgent = useCallback(async () => {
    setActionLoading(true);
    try {
      logger.info('Stopping agent session', {
        user: user?.email,
        component: 'useAgents'
      });

      await apiCall('/api/agent/stop', { method: 'POST' });
      
      // Update local state immediately
      setAgentStatus({
        agent_active: false,
        agent_id: null,
        last_active: null,
        container_status: 'stopped'
      });

      setDetailedStatus(null);

      logAgentOperation('Stopped Successfully', user?.email, {
        component: 'useAgents'
      });

      toast.success('TxAgent session deactivated successfully!');
      
      // Refresh status after a short delay
      setTimeout(() => fetchAgentStatus(true), 1000);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logAgentOperation('Stop Failed', user?.email, {
        error: errorMessage,
        component: 'useAgents'
      });

      toast.error(`Failed to stop agent: ${errorMessage}`);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, [apiCall, user, fetchAgentStatus]);

  const performDetailedStatusCheck = useCallback(async () => {
    if (!agentStatus?.agent_active) {
      logger.warn('Cannot perform detailed status check - no active agent', {
        user: user?.email,
        component: 'useAgents'
      });
      return;
    }

    setStatusTesting(true);
    try {
      logger.info('Performing detailed status check', {
        user: user?.email,
        agentId: agentStatus.agent_id,
        component: 'useAgents'
      });

      const testResults = {
        health: { status: 0, response: null, error: null },
        chat: { status: 0, response: null, error: null },
        embed: { status: 0, response: null, error: null }
      };

      // Test health endpoint
      try {
        const healthData = await apiCall('/api/agent/health-check', { method: 'POST' });
        testResults.health.status = 200;
        testResults.health.response = healthData;
      } catch (error) {
        testResults.health.error = error instanceof Error ? error.message : 'Unknown error';
      }

      // Test chat endpoint
      try {
        const chatData = await apiCall('/api/chat', {
          method: 'POST',
          body: { 
            message: "Test connection - please respond with 'OK'",
            context: []
          }
        });
        testResults.chat.status = 200;
        testResults.chat.response = chatData;
      } catch (error) {
        testResults.chat.error = error instanceof Error ? error.message : 'Unknown error';
      }

      // Test embed endpoint
      try {
        const embedData = await apiCall('/api/embed', {
          method: 'POST',
          body: { 
            documentText: "Test document for embedding",
            metadata: { test: true }
          }
        });
        testResults.embed.status = 200;
        testResults.embed.response = embedData;
      } catch (error) {
        testResults.embed.error = error instanceof Error ? error.message : 'Unknown error';
      }

      const newDetailedStatus: DetailedStatus = {
        container_reachable: testResults.health.status === 200,
        jwt_valid: testResults.health.status !== 401,
        endpoints_working: testResults.chat.status === 200 || testResults.embed.status === 200,
        last_test_time: new Date().toISOString(),
        test_results: testResults
      };

      setDetailedStatus(newDetailedStatus);
      
      logger.success('Detailed status check completed', {
        user: user?.email,
        container_reachable: newDetailedStatus.container_reachable,
        endpoints_working: newDetailedStatus.endpoints_working,
        component: 'useAgents'
      });
      
      return newDetailedStatus;

    } catch (error) {
      logger.error('Detailed status check failed', {
        component: 'useAgents',
        user: user?.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      setStatusTesting(false);
    }
  }, [apiCall, user, agentStatus]);

  // Auto-fetch status on mount
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
    performDetailedStatusCheck
  };
}