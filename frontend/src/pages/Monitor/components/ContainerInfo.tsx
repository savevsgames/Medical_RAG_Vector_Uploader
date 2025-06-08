import React from 'react';
import { Zap, ExternalLink, Copy } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import toast from 'react-hot-toast';

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
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

interface ContainerInfoProps {
  agentStatus: AgentStatus | null;
  detailedStatus: DetailedStatus | null;
}

export function ContainerInfo({ agentStatus, detailedStatus }: ContainerInfoProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const txAgentHealth = typeof agentStatus?.container_health === 'object' 
    ? agentStatus.container_health as any 
    : null;

  return (
    <Card>
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
    </Card>
  );
}