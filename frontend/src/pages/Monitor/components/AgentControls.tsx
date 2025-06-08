import React from 'react';
import { Play, Square, Eye } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface AgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  last_active: string | null;
  container_status?: string;
}

interface AgentControlsProps {
  agentStatus: AgentStatus | null;
  actionLoading: boolean;
  onStart: () => void;
  onStop: () => void;
  onTest: () => void;
  testing: boolean;
}

export function AgentControls({
  agentStatus,
  actionLoading,
  onStart,
  onStop,
  onTest,
  testing
}: AgentControlsProps) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Controls</h2>
      
      <div className="flex space-x-3">
        {agentStatus?.agent_active ? (
          <Button
            variant="danger"
            onClick={onStop}
            loading={actionLoading}
            icon={<Square className="w-4 h-4" />}
          >
            {actionLoading ? 'Deactivating...' : 'Deactivate Session'}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={onStart}
            loading={actionLoading}
            icon={<Play className="w-4 h-4" />}
          >
            {actionLoading ? 'Activating...' : 'Activate TxAgent'}
          </Button>
        )}
        
        <Button
          variant="secondary"
          onClick={onTest}
          disabled={testing || !agentStatus?.agent_active}
          loading={testing}
          icon={<Eye className="w-4 h-4" />}
        >
          {testing ? 'Testing...' : 'Test All Endpoints'}
        </Button>
      </div>
    </Card>
  );
}