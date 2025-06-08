import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, Play, RefreshCw } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

interface ConnectionStatus {
  isConnected: boolean;
  canChat: boolean;
  canStart: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'starting' | 'checking';
  message: string;
  lastError?: string;
}

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  container_status?: string;
}

interface ConnectionStatusProps {
  connectionStatus: ConnectionStatus;
  agentStatus: AgentStatus | null;
  selectedAgent: string;
  isConnecting: boolean;
  lastCheck: Date;
  onStartAgent: () => void;
  onCheckConnection: () => void;
}

export function ConnectionStatus({
  connectionStatus,
  agentStatus,
  selectedAgent,
  isConnecting,
  lastCheck,
  onStartAgent,
  onCheckConnection
}: ConnectionStatusProps) {
  const getStatusIcon = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'disconnected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'starting':
      case 'checking':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return 'border-green-200 bg-green-50';
      case 'disconnected':
        return 'border-yellow-200 bg-yellow-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'starting':
      case 'checking':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getBadgeVariant = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return 'success';
      case 'disconnected':
        return 'warning';
      case 'error':
        return 'error';
      case 'starting':
      case 'checking':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Card className={`border-2 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-medium text-gray-900">
                {selectedAgent === 'txagent' ? 'TxAgent' : 'OpenAI'} Connection
              </h3>
              <Badge variant={getBadgeVariant()}>
                {connectionStatus.status.charAt(0).toUpperCase() + connectionStatus.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {connectionStatus.message}
            </p>
            {connectionStatus.lastError && (
              <p className="text-xs text-red-600 mt-1">
                Error: {connectionStatus.lastError}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Last checked: {lastCheck.toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {agentStatus && (
            <div className="text-right text-xs text-gray-500 mr-4">
              {agentStatus.agent_active && agentStatus.agent_id && (
                <div>Session: {agentStatus.agent_id.substring(0, 8)}...</div>
              )}
              {agentStatus.container_status && (
                <div>Container: {agentStatus.container_status}</div>
              )}
            </div>
          )}

          {connectionStatus.canStart && (
            <Button
              variant="primary"
              size="sm"
              onClick={onStartAgent}
              loading={isConnecting}
              icon={<Play className="w-4 h-4" />}
            >
              {isConnecting ? 'Starting...' : 'Start Agent'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onCheckConnection}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>
    </Card>
  );
}