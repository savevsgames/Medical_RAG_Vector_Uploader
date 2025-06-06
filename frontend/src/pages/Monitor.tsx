import React, { useState, useEffect } from 'react';
import { Activity, Clock, CheckCircle, XCircle, AlertCircle, Container, Cpu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  last_active: string | null;
  container_status?: string;
  container_health?: string;
  session_data?: any;
}

export function Monitor() {
  const { session } = useAuth();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchAgentStatus = async () => {
      if (!session) return;

      try {
        // Try new API endpoint first, fallback to legacy
        let response;
        try {
          response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/status`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
        } catch (apiError) {
          console.warn('New API failed, trying legacy endpoint:', apiError);
          response = await fetch(`${import.meta.env.VITE_API_URL}/agent/status`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
        }

        if (response.ok) {
          const data = await response.json();
          setAgentStatus(data);
        }
      } catch (error) {
        console.error('Error fetching agent status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgentStatus();
    
    // Refresh status every 30 seconds
    const interval = setInterval(fetchAgentStatus, 30000);
    return () => clearInterval(interval);
  }, [session]);

  const handleStartAgent = async () => {
    if (!session) return;

    setActionLoading(true);
    try {
      // Try new TxAgent API first
      let response;
      try {
        response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/start`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (apiError) {
        console.warn('TxAgent API failed, trying legacy endpoint:', apiError);
        response = await fetch(`${import.meta.env.VITE_API_URL}/agent/start`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      if (response.ok) {
        const data = await response.json();
        setAgentStatus({
          agent_active: true,
          agent_id: data.agent_id,
          last_active: new Date().toISOString(),
          container_status: 'running'
        });
        
        if (data.endpoint_url) {
          toast.success('TxAgent container started successfully!');
        } else {
          toast.success('Local agent started successfully!');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start agent');
      }
    } catch (error) {
      console.error('Error starting agent:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start agent');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopAgent = async () => {
    if (!session) return;

    setActionLoading(true);
    try {
      // Try new TxAgent API first
      let response;
      try {
        response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/stop`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (apiError) {
        console.warn('TxAgent API failed, trying legacy endpoint:', apiError);
        response = await fetch(`${import.meta.env.VITE_API_URL}/agent/stop`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      if (response.ok) {
        setAgentStatus({
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped'
        });
        toast.success('Agent stopped successfully!');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to stop agent');
      }
    } catch (error) {
      console.error('Error stopping agent:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to stop agent');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getContainerStatusColor = (status?: string) => {
    switch (status) {
      case 'running': return 'text-green-600';
      case 'stopped': return 'text-red-600';
      case 'starting': return 'text-yellow-600';
      case 'unknown': return 'text-gray-600';
      default: return 'text-gray-400';
    }
  };

  const getContainerStatusIcon = (status?: string) => {
    switch (status) {
      case 'running': return CheckCircle;
      case 'stopped': return XCircle;
      case 'starting': return Clock;
      default: return AlertCircle;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg">
            <Activity className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">TxAgent Monitor</h1>
            <p className="text-gray-600">Track your RunPod containerized AI agent's status and activity</p>
          </div>
        </div>
      </div>

      {/* Agent Status Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Status</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              {agentStatus?.agent_active ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-medium text-gray-900">Status</span>
            </div>
            <p className={`text-sm ${
              agentStatus?.agent_active ? 'text-green-600' : 'text-red-600'
            }`}>
              {agentStatus?.agent_active ? 'Active' : 'Inactive'}
            </p>
          </div>

          {/* Container Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              {React.createElement(
                getContainerStatusIcon(agentStatus?.container_status),
                { className: `w-5 h-5 ${getContainerStatusColor(agentStatus?.container_status)}` }
              )}
              <span className="font-medium text-gray-900">Container</span>
            </div>
            <p className={`text-sm ${getContainerStatusColor(agentStatus?.container_status)}`}>
              {agentStatus?.container_status || 'Unknown'}
            </p>
          </div>

          {/* Agent ID */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Container className="w-5 h-5 text-blue-500" />
              <span className="font-medium text-gray-900">Agent ID</span>
            </div>
            <p className="text-sm text-gray-600 font-mono">
              {agentStatus?.agent_id ? 
                `${agentStatus.agent_id.substring(0, 12)}...` : 
                'None'
              }
            </p>
          </div>

          {/* Last Active */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <span className="font-medium text-gray-900">Last Active</span>
            </div>
            <p className="text-sm text-gray-600">
              {agentStatus?.last_active 
                ? new Date(agentStatus.last_active).toLocaleString()
                : 'Never'
              }
            </p>
          </div>
        </div>

        {/* Container Health */}
        {agentStatus?.container_health && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <Cpu className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">Container Health</span>
            </div>
            <p className="text-sm text-blue-700">{agentStatus.container_health}</p>
          </div>
        )}

        {/* Session Data */}
        {agentStatus?.session_data && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-gray-900 mb-2">Session Information</h3>
            <div className="text-sm text-gray-600 space-y-1">
              {agentStatus.session_data.container_id && (
                <p><span className="font-medium">Container ID:</span> {agentStatus.session_data.container_id}</p>
              )}
              {agentStatus.session_data.runpod_endpoint && (
                <p><span className="font-medium">RunPod Endpoint:</span> {agentStatus.session_data.runpod_endpoint}</p>
              )}
              {agentStatus.session_data.started_at && (
                <p><span className="font-medium">Started:</span> {new Date(agentStatus.session_data.started_at).toLocaleString()}</p>
              )}
              {agentStatus.session_data.capabilities && (
                <p><span className="font-medium">Capabilities:</span> {agentStatus.session_data.capabilities.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex space-x-3">
          {agentStatus?.agent_active ? (
            <button
              onClick={handleStopAgent}
              disabled={actionLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading ? 'Stopping...' : 'Stop TxAgent'}
            </button>
          ) : (
            <button
              onClick={handleStartAgent}
              disabled={actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading ? 'Starting...' : 'Start TxAgent'}
            </button>
          )}
          
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            Refresh Status
          </button>
        </div>
      </div>

      {/* Activity Log Placeholder */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">TxAgent Activity Log</h2>
        <div className="text-center py-8 text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Container activity logging will be implemented in the next phase</p>
          <p className="text-sm">This will show TxAgent queries, RAG hits, and response metrics</p>
        </div>
      </div>
    </div>
  );
}