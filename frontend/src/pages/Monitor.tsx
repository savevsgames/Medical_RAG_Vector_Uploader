import React, { useState, useEffect } from 'react';
import { Activity, Clock, CheckCircle, XCircle, AlertCircle, Container, Cpu, RefreshCw, Play, Square, Zap, Terminal, Eye, EyeOff, Copy, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { logger, logUserAction, logApiCall, logAgentOperation } from '../utils/logger';

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  last_active: string | null;
  container_status?: string;
  container_health?: string | object;
  session_data?: any;
}

interface TxAgentHealth {
  status: string;
  model: string;
  device: string;
  version: string;
}

interface ContainerLog {
  timestamp: string;
  level: string;
  message: string;
  component?: string;
  user_id?: string;
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

export function Monitor() {
  const { session, user } = useAuth();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [txAgentHealth, setTxAgentHealth] = useState<TxAgentHealth | null>(null);
  const [detailedStatus, setDetailedStatus] = useState<DetailedStatus | null>(null);
  const [containerLogs, setContainerLogs] = useState<ContainerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusTesting, setStatusTesting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showLogs, setShowLogs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh interval
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchAgentStatus();
        if (agentStatus?.agent_active) {
          performDetailedStatusCheck();
        }
      }, 10000); // Refresh every 10 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, agentStatus?.agent_active]);

  useEffect(() => {
    const fetchAgentStatus = async () => {
      if (!session) {
        logger.warn('No session available for agent status check', {
          component: 'Monitor'
        });
        return;
      }

      const userEmail = user?.email;

      logger.debug('Fetching agent status', {
        component: 'Monitor',
        user: userEmail
      });

      try {
        let response;
        let endpoint = '/api/agent/status';
        let isLegacyFallback = false;

        logApiCall(endpoint, 'GET', userEmail, 'initiated', {
          component: 'Monitor'
        });

        try {
          response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
        } catch (apiError) {
          logger.warn('Primary API failed, trying legacy endpoint', {
            component: 'Monitor',
            user: userEmail,
            error: apiError instanceof Error ? apiError.message : 'Unknown error',
            fallbackEndpoint: '/agent/status'
          });

          endpoint = '/agent/status';
          isLegacyFallback = true;
          
          logApiCall(endpoint, 'GET', userEmail, 'initiated', {
            isLegacyFallback: true,
            component: 'Monitor'
          });

          response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
        }

        if (response.ok) {
          const data = await response.json();
          
          logApiCall(endpoint, 'GET', userEmail, 'success', {
            status: response.status,
            agentActive: data.agent_active,
            containerStatus: data.container_status,
            isLegacyFallback,
            component: 'Monitor'
          });

          setAgentStatus(data);
          
          // Extract TxAgent health if available
          if (data.container_health && typeof data.container_health === 'object') {
            setTxAgentHealth(data.container_health);
          }
          
          setLastRefresh(new Date());
        } else {
          const errorData = await response.json().catch(() => ({}));
          
          logApiCall(endpoint, 'GET', userEmail, 'error', {
            status: response.status,
            statusText: response.statusText,
            errorData,
            isLegacyFallback,
            component: 'Monitor'
          });
        }
      } catch (error) {
        logger.error('Failed to fetch agent status', {
          component: 'Monitor',
          user: userEmail,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAgentStatus();
  }, [session, user]);

  const performDetailedStatusCheck = async () => {
    if (!session || !agentStatus?.agent_active) return;

    const userEmail = user?.email;
    setStatusTesting(true);

    try {
      logUserAction('Detailed Status Check Initiated', userEmail, {
        component: 'Monitor'
      });

      const testResults = {
        health: { status: 0, response: null, error: null },
        chat: { status: 0, response: null, error: null },
        embed: { status: 0, response: null, error: null }
      };

      // Test 1: Health endpoint
      try {
        const healthResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/status`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        testResults.health.status = healthResponse.status;
        testResults.health.response = await healthResponse.json();
      } catch (error) {
        testResults.health.error = error instanceof Error ? error.message : 'Unknown error';
      }

      // Test 2: Chat endpoint (minimal test)
      try {
        const chatResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            message: "Test connection - please respond with 'OK'",
            context: []
          }),
        });
        testResults.chat.status = chatResponse.status;
        testResults.chat.response = await chatResponse.json();
      } catch (error) {
        testResults.chat.error = error instanceof Error ? error.message : 'Unknown error';
      }

      // Test 3: Embed endpoint (minimal test)
      try {
        const embedResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/embed`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            documentText: "Test document for embedding",
            metadata: { test: true }
          }),
        });
        testResults.embed.status = embedResponse.status;
        testResults.embed.response = await embedResponse.json();
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

      // Add test results to logs
      const newLogs: ContainerLog[] = [
        {
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: `Status check completed - Health: ${testResults.health.status}, Chat: ${testResults.chat.status}, Embed: ${testResults.embed.status}`,
          component: 'StatusCheck',
          user_id: userEmail || undefined
        }
      ];

      if (testResults.health.error) {
        newLogs.push({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Health check failed: ${testResults.health.error}`,
          component: 'StatusCheck'
        });
      }

      if (testResults.chat.error) {
        newLogs.push({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Chat test failed: ${testResults.chat.error}`,
          component: 'StatusCheck'
        });
      }

      if (testResults.embed.error) {
        newLogs.push({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Embed test failed: ${testResults.embed.error}`,
          component: 'StatusCheck'
        });
      }

      setContainerLogs(prev => [...newLogs, ...prev].slice(0, 100)); // Keep last 100 logs

      logUserAction('Detailed Status Check Completed', userEmail, {
        component: 'Monitor',
        results: newDetailedStatus
      });

    } catch (error) {
      logger.error('Detailed status check failed', {
        component: 'Monitor',
        user: userEmail,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      setContainerLogs(prev => [{
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: `Status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        component: 'StatusCheck'
      }, ...prev].slice(0, 100));

    } finally {
      setStatusTesting(false);
    }
  };

  const handleStartAgent = async () => {
    if (!session) return;

    const userEmail = user?.email;
    
    logUserAction('Start TxAgent Initiated', userEmail, {
      component: 'Monitor'
    });

    setActionLoading(true);
    try {
      let response;
      let endpoint = '/api/agent/start';
      let isLegacyFallback = false;

      logApiCall(endpoint, 'POST', userEmail, 'initiated', {
        component: 'Monitor'
      });

      try {
        response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (apiError) {
        logger.warn('TxAgent API failed, trying legacy endpoint', {
          component: 'Monitor',
          user: userEmail,
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
          fallbackEndpoint: '/agent/start'
        });

        endpoint = '/agent/start';
        isLegacyFallback = true;
        
        logApiCall(endpoint, 'POST', userEmail, 'initiated', {
          isLegacyFallback: true,
          component: 'Monitor'
        });

        response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      if (response.ok) {
        const data = await response.json();
        
        logApiCall(endpoint, 'POST', userEmail, 'success', {
          status: response.status,
          agentId: data.agent_id,
          containerId: data.container_id,
          isLegacyFallback,
          component: 'Monitor'
        });

        setAgentStatus({
          agent_active: true,
          agent_id: data.agent_id,
          last_active: new Date().toISOString(),
          container_status: data.status === 'activated' ? 'running' : 'starting'
        });
        
        logAgentOperation('Started Successfully', userEmail, {
          agentId: data.agent_id,
          containerId: data.container_id,
          endpointUrl: data.endpoint_url,
          component: 'Monitor'
        });

        // Add success log
        setContainerLogs(prev => [{
          timestamp: new Date().toISOString(),
          level: 'SUCCESS',
          message: `TxAgent session activated: ${data.agent_id}`,
          component: 'AgentManager',
          user_id: userEmail || undefined
        }, ...prev].slice(0, 100));

        if (data.endpoint_url) {
          toast.success('TxAgent session activated successfully!');
        } else {
          toast.success('Local agent started successfully!');
        }

        // Automatically perform detailed status check after starting
        setTimeout(() => performDetailedStatusCheck(), 2000);

      } else {
        const errorData = await response.json().catch(() => ({}));
        
        logApiCall(endpoint, 'POST', userEmail, 'error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          isLegacyFallback,
          component: 'Monitor'
        });

        // Add error log
        setContainerLogs(prev => [{
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Failed to start TxAgent: ${errorData.error || errorData.details || 'Unknown error'}`,
          component: 'AgentManager'
        }, ...prev].slice(0, 100));

        throw new Error(errorData.error || errorData.details || 'Failed to start agent');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logAgentOperation('Start Failed', userEmail, {
        error: errorMessage,
        component: 'Monitor'
      });

      toast.error(errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopAgent = async () => {
    if (!session) return;

    const userEmail = user?.email;
    
    logUserAction('Stop TxAgent Initiated', userEmail, {
      component: 'Monitor'
    });

    setActionLoading(true);
    try {
      let response;
      let endpoint = '/api/agent/stop';
      let isLegacyFallback = false;

      logApiCall(endpoint, 'POST', userEmail, 'initiated', {
        component: 'Monitor'
      });

      try {
        response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (apiError) {
        logger.warn('TxAgent API failed, trying legacy endpoint', {
          component: 'Monitor',
          user: userEmail,
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
          fallbackEndpoint: '/agent/stop'
        });

        endpoint = '/agent/stop';
        isLegacyFallback = true;
        
        logApiCall(endpoint, 'POST', userEmail, 'initiated', {
          isLegacyFallback: true,
          component: 'Monitor'
        });

        response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      if (response.ok) {
        const data = await response.json();
        
        logApiCall(endpoint, 'POST', userEmail, 'success', {
          status: response.status,
          isLegacyFallback,
          component: 'Monitor'
        });

        setAgentStatus({
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped'
        });

        setDetailedStatus(null); // Clear detailed status when stopped

        // Add success log
        setContainerLogs(prev => [{
          timestamp: new Date().toISOString(),
          level: 'SUCCESS',
          message: 'TxAgent session deactivated',
          component: 'AgentManager',
          user_id: userEmail || undefined
        }, ...prev].slice(0, 100));

        logAgentOperation('Stopped Successfully', userEmail, {
          component: 'Monitor'
        });

        toast.success('TxAgent session deactivated successfully!');
      } else {
        const errorData = await response.json().catch(() => ({}));
        
        logApiCall(endpoint, 'POST', userEmail, 'error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          isLegacyFallback,
          component: 'Monitor'
        });

        // Add error log
        setContainerLogs(prev => [{
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Failed to stop TxAgent: ${errorData.error || errorData.details || 'Unknown error'}`,
          component: 'AgentManager'
        }, ...prev].slice(0, 100));

        throw new Error(errorData.error || errorData.details || 'Failed to stop agent');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logAgentOperation('Stop Failed', userEmail, {
        error: errorMessage,
        component: 'Monitor'
      });

      toast.error(errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshStatus = () => {
    setLoading(true);
    window.location.reload();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'running': case 'healthy': case 'active': return 'text-green-600';
      case 'stopped': case 'terminated': return 'text-red-600';
      case 'starting': case 'initializing': return 'text-yellow-600';
      case 'unreachable': return 'text-orange-600';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'running': case 'healthy': case 'active': return CheckCircle;
      case 'stopped': case 'terminated': return XCircle;
      case 'starting': case 'initializing': return Clock;
      case 'unreachable': return AlertCircle;
      default: return AlertCircle;
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'text-red-600 bg-red-50';
      case 'WARN': case 'WARNING': return 'text-yellow-600 bg-yellow-50';
      case 'SUCCESS': return 'text-green-600 bg-green-50';
      case 'INFO': return 'text-blue-600 bg-blue-50';
      case 'DEBUG': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

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
      <div className="bg-white rounded-lg shadow p-6">
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
                Auto-refresh (10s)
              </label>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Last updated</p>
              <p className="text-sm font-medium text-gray-900">{lastRefresh.toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Status Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Quick Status</h2>
          <div className="flex space-x-2">
            <button
              onClick={performDetailedStatusCheck}
              disabled={statusTesting || !agentStatus?.agent_active}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {statusTesting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              <span>{statusTesting ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button
              onClick={handleRefreshStatus}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Session Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              {agentStatus?.agent_active ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-medium text-gray-900">Session</span>
            </div>
            <p className={`text-sm ${
              agentStatus?.agent_active ? 'text-green-600' : 'text-red-600'
            }`}>
              {agentStatus?.agent_active ? 'Active' : 'Inactive'}
            </p>
            {agentStatus?.agent_id && (
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {agentStatus.agent_id.substring(0, 8)}...
              </p>
            )}
          </div>

          {/* Container Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              {React.createElement(
                getStatusIcon(agentStatus?.container_status),
                { className: `w-5 h-5 ${getStatusColor(agentStatus?.container_status)}` }
              )}
              <span className="font-medium text-gray-900">Container</span>
            </div>
            <p className={`text-sm ${getStatusColor(agentStatus?.container_status)}`}>
              {agentStatus?.container_status || 'Unknown'}
            </p>
            {detailedStatus && (
              <p className="text-xs text-gray-500 mt-1">
                Tested: {new Date(detailedStatus.last_test_time).toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Connection Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              {detailedStatus?.container_reachable ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : detailedStatus?.container_reachable === false ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-gray-400" />
              )}
              <span className="font-medium text-gray-900">Connection</span>
            </div>
            <p className={`text-sm ${
              detailedStatus?.container_reachable ? 'text-green-600' : 
              detailedStatus?.container_reachable === false ? 'text-red-600' : 'text-gray-500'
            }`}>
              {detailedStatus?.container_reachable ? 'Reachable' : 
               detailedStatus?.container_reachable === false ? 'Unreachable' : 'Not tested'}
            </p>
          </div>

          {/* Endpoints Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              {detailedStatus?.endpoints_working ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : detailedStatus?.endpoints_working === false ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-gray-400" />
              )}
              <span className="font-medium text-gray-900">Endpoints</span>
            </div>
            <p className={`text-sm ${
              detailedStatus?.endpoints_working ? 'text-green-600' : 
              detailedStatus?.endpoints_working === false ? 'text-red-600' : 'text-gray-500'
            }`}>
              {detailedStatus?.endpoints_working ? 'Working' : 
               detailedStatus?.endpoints_working === false ? 'Failed' : 'Not tested'}
            </p>
          </div>
        </div>

        {/* Detailed Test Results */}
        {detailedStatus && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Terminal className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">Latest Test Results</span>
              <span className="text-xs text-gray-500">
                {new Date(detailedStatus.last_test_time).toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-white rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Health Check</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    detailedStatus.test_results.health.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {detailedStatus.test_results.health.status || 'Failed'}
                  </span>
                </div>
                {detailedStatus.test_results.health.error && (
                  <p className="text-red-600 text-xs">{detailedStatus.test_results.health.error}</p>
                )}
              </div>
              <div className="bg-white rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Chat Endpoint</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    detailedStatus.test_results.chat.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {detailedStatus.test_results.chat.status || 'Failed'}
                  </span>
                </div>
                {detailedStatus.test_results.chat.error && (
                  <p className="text-red-600 text-xs">{detailedStatus.test_results.chat.error}</p>
                )}
              </div>
              <div className="bg-white rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Embed Endpoint</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    detailedStatus.test_results.embed.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {detailedStatus.test_results.embed.status || 'Failed'}
                  </span>
                </div>
                {detailedStatus.test_results.embed.error && (
                  <p className="text-red-600 text-xs">{detailedStatus.test_results.embed.error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex space-x-3">
          {agentStatus?.agent_active ? (
            <button
              onClick={handleStopAgent}
              disabled={actionLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Square className="w-4 h-4" />
              <span>{actionLoading ? 'Deactivating...' : 'Deactivate Session'}</span>
            </button>
          ) : (
            <button
              onClick={handleStartAgent}
              disabled={actionLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>{actionLoading ? 'Activating...' : 'Activate TxAgent'}</span>
            </button>
          )}
          
          <button
            onClick={performDetailedStatusCheck}
            disabled={statusTesting || !agentStatus?.agent_active}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {statusTesting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            <span>{statusTesting ? 'Testing...' : 'Test All Endpoints'}</span>
          </button>
        </div>
      </div>

      {/* Container Information */}
      {(txAgentHealth || agentStatus?.session_data) && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Container Information</h2>
            {agentStatus?.session_data?.runpod_endpoint && (
              <a
                href={agentStatus.session_data.runpod_endpoint}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Container</span>
              </a>
            )}
          </div>

          {/* TxAgent Health Details */}
          {txAgentHealth && (
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <div className="flex items-center space-x-2 mb-3">
                <Zap className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">TxAgent Health</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Status:</span>
                  <p className="font-medium text-blue-700">{txAgentHealth.status}</p>
                </div>
                <div>
                  <span className="text-gray-600">Model:</span>
                  <p className="font-medium text-blue-700">{txAgentHealth.model}</p>
                </div>
                <div>
                  <span className="text-gray-600">Device:</span>
                  <p className="font-medium text-blue-700">{txAgentHealth.device}</p>
                </div>
                <div>
                  <span className="text-gray-600">Version:</span>
                  <p className="font-medium text-blue-700">{txAgentHealth.version}</p>
                </div>
              </div>
            </div>
          )}

          {/* Session Data */}
          {agentStatus?.session_data && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Session Information</h3>
              <div className="text-sm text-gray-600 space-y-2">
                {agentStatus.session_data.container_id && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Container ID:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono">{agentStatus.session_data.container_id}</span>
                      <button
                        onClick={() => copyToClipboard(agentStatus.session_data.container_id)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
                {agentStatus.session_data.runpod_endpoint && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">RunPod Endpoint:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs">{agentStatus.session_data.runpod_endpoint}</span>
                      <button
                        onClick={() => copyToClipboard(agentStatus.session_data.runpod_endpoint)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
                {agentStatus.session_data.started_at && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Started:</span>
                    <span>{new Date(agentStatus.session_data.started_at).toLocaleString()}</span>
                  </div>
                )}
                {agentStatus.session_data.capabilities && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Capabilities:</span>
                    <span>{agentStatus.session_data.capabilities.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Container Logs */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Container Activity Logs</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {showLogs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showLogs ? 'Hide Logs' : 'Show Logs'}</span>
            </button>
            <button
              onClick={() => setContainerLogs([])}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {showLogs && (
          <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
            {containerLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No logs available. Perform a status check or start the agent to see activity.</p>
              </div>
            ) : (
              <div className="space-y-1 font-mono text-sm">
                {containerLogs.map((log, index) => (
                  <div key={index} className="flex items-start space-x-3 text-gray-300">
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${getLogLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                    {log.component && (
                      <span className="text-blue-400 text-xs">
                        [{log.component}]
                      </span>
                    )}
                    <span className="flex-1">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!showLogs && containerLogs.length > 0 && (
          <div className="text-center py-4 text-gray-500">
            <p>{containerLogs.length} log entries available. Click "Show Logs" to view them.</p>
          </div>
        )}
      </div>

      {/* Debug Information */}
      {import.meta.env.DEV && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-medium text-yellow-800 mb-2">Debug Information</h3>
          <pre className="text-xs text-yellow-700 overflow-auto max-h-64">
            {JSON.stringify({ 
              agentStatus, 
              txAgentHealth, 
              detailedStatus,
              environment: {
                api_url: import.meta.env.VITE_API_URL,
                supabase_url: import.meta.env.VITE_SUPABASE_URL
              }
            }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}