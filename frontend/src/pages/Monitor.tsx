import React, { useState, useEffect } from 'react';
import { Activity, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  last_active: string | null;
}

export function Monitor() {
  const { session } = useAuth();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgentStatus = async () => {
      if (!session) return;

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/agent/status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

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

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/agent/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAgentStatus({
          agent_active: true,
          agent_id: data.agent_id,
          last_active: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error starting agent:', error);
    }
  };

  const handleStopAgent = async () => {
    if (!session) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/agent/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setAgentStatus({
          agent_active: false,
          agent_id: null,
          last_active: null
        });
      }
    } catch (error) {
      console.error('Error stopping agent:', error);
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
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg">
            <Activity className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Monitor</h1>
            <p className="text-gray-600">Track your AI agent's status and activity</p>
          </div>
        </div>
      </div>

      {/* Agent Status Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Status</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

          {/* Agent ID */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertCircle className="w-5 h-5 text-blue-500" />
              <span className="font-medium text-gray-900">Agent ID</span>
            </div>
            <p className="text-sm text-gray-600 font-mono">
              {agentStatus?.agent_id || 'None'}
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

        {/* Control Buttons */}
        <div className="flex space-x-3">
          {agentStatus?.agent_active ? (
            <button
              onClick={handleStopAgent}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Stop Agent
            </button>
          ) : (
            <button
              onClick={handleStartAgent}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
            >
              Start Agent
            </button>
          )}
        </div>
      </div>

      {/* Activity Log Placeholder */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Log</h2>
        <div className="text-center py-8 text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Activity logging will be implemented in the next phase</p>
          <p className="text-sm">This will show agent queries, RAG hits, and response metrics</p>
        </div>
      </div>
    </div>
  );
}