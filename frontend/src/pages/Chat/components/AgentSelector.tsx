import React from 'react';
import { ChevronDown } from 'lucide-react';

interface AgentConfig {
  id: string;
  name: string;
  description: string;
}

interface ConnectionStatus {
  canChat: boolean;
}

interface AgentSelectorProps {
  selectedAgent: string;
  agentConfigs: Record<string, AgentConfig>;
  connectionStatus: ConnectionStatus;
  onAgentChange: (agent: string) => void;
}

export function AgentSelector({
  selectedAgent,
  agentConfigs,
  connectionStatus,
  onAgentChange
}: AgentSelectorProps) {
  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <label htmlFor="agent-select\" className="text-sm font-medium text-gray-700">
            AI Agent:
          </label>
          <div className="relative">
            <select
              id="agent-select"
              value={selectedAgent}
              onChange={(e) => onAgentChange(e.target.value)}
              disabled={!connectionStatus.canChat}
              className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-900 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {Object.values(agentConfigs).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>

        <div className="text-sm text-gray-500">
          {connectionStatus.canChat ? (
            <span className="text-green-600">Ready to chat</span>
          ) : (
            <span className="text-red-600">Not ready</span>
          )}
        </div>
      </div>
    </div>
  );
}