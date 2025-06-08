import React from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  color: string;
  bgColor: string;
}

interface ConnectionStatus {
  isConnected: boolean;
  canChat: boolean;
  status: string;
}

interface ChatHeaderProps {
  currentAgent: AgentConfig;
  connectionStatus: ConnectionStatus;
  onClearMessages: () => void;
}

export function ChatHeader({ currentAgent, connectionStatus, onClearMessages }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200">
      <div className="flex items-center space-x-3">
        <div className={`flex items-center justify-center w-10 h-10 ${currentAgent.bgColor} rounded-full`}>
          <MessageSquare className={`w-6 h-6 ${currentAgent.color}`} />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold text-gray-900">Medical AI Assistant</h2>
            <span className={`px-2 py-1 text-xs rounded-full ${
              connectionStatus.isConnected 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {connectionStatus.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <p className="text-sm text-gray-500">{currentAgent.description}</p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearMessages}
        icon={<Trash2 className="w-4 h-4" />}
      >
        Clear Chat
      </Button>
    </div>
  );
}