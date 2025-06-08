import React from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

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
  test_results: any;
}

interface StatusOverviewProps {
  agentStatus: AgentStatus | null;
  detailedStatus: DetailedStatus | null;
  onRefresh: () => void;
  onTest: () => void;
  testing: boolean;
}

export function StatusOverview({
  agentStatus,
  detailedStatus,
  onRefresh,
  onTest,
  testing
}: StatusOverviewProps) {
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'running': case 'healthy': case 'active': return CheckCircle;
      case 'stopped': case 'terminated': return XCircle;
      case 'starting': case 'initializing': return AlertCircle;
      case 'unreachable': return AlertCircle;
      default: return AlertCircle;
    }
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

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Quick Status</h2>
        <div className="flex space-x-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onTest}
            disabled={testing || !agentStatus?.agent_active}
            loading={testing}
            icon={<Eye className="w-4 h-4" />}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </Card>
  );
}