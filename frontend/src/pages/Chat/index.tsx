import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { ChatHeader } from './components/ChatHeader';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AgentSelector } from './components/AgentSelector';
import { useChat } from './hooks/useChat';
import { useAgentConnection } from './hooks/useAgentConnection';
import { Card } from '../../components/ui/Card';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export function Chat() {
  const {
    messages,
    selectedAgent,
    currentAgent,
    isLoading,
    agentConfigs,
    sendMessage,
    changeAgent,
    clearMessages
  } = useChat();

  const {
    connectionStatus,
    agentStatus,
    isConnecting,
    lastConnectionCheck,
    checkConnection,
    startAgent,
    stopAgent
  } = useAgentConnection();

  // Check connection on mount and when agent changes
  useEffect(() => {
    checkConnection();
  }, [selectedAgent, checkConnection]);

  // Auto-refresh connection status every 30 seconds (reduced from constant polling)
  useEffect(() => {
    const interval = setInterval(() => {
      checkConnection(true); // Silent check
    }, 30000);

    return () => clearInterval(interval);
  }, [checkConnection]);

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col space-y-4">
      {/* Connection Status Banner */}
      <ConnectionStatus
        connectionStatus={connectionStatus}
        agentStatus={agentStatus}
        selectedAgent={selectedAgent}
        isConnecting={isConnecting}
        lastCheck={lastConnectionCheck}
        onStartAgent={startAgent}
        onCheckConnection={() => checkConnection()}
      />

      {/* Main Chat Interface */}
      <Card className="flex-1 flex flex-col overflow-hidden" padding="none">
        {/* Chat Header */}
        <ChatHeader
          currentAgent={currentAgent}
          connectionStatus={connectionStatus}
          onClearMessages={clearMessages}
        />

        {/* Agent Selector */}
        <AgentSelector
          selectedAgent={selectedAgent}
          agentConfigs={agentConfigs}
          connectionStatus={connectionStatus}
          onAgentChange={changeAgent}
        />

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          {connectionStatus.canChat ? (
            <MessageList messages={messages} isLoading={isLoading} />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <MessageSquare className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Agent Not Ready
                </h3>
                <p className="text-gray-500 mb-4">
                  {connectionStatus.message || 'Please start the TxAgent or check your connection to begin chatting.'}
                </p>
                {connectionStatus.canStart && (
                  <button
                    onClick={startAgent}
                    disabled={isConnecting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isConnecting ? 'Starting...' : 'Start TxAgent'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Message Input */}
        {connectionStatus.canChat && (
          <MessageInput
            onSendMessage={sendMessage}
            isLoading={isLoading}
            currentAgent={currentAgent}
            disabled={!connectionStatus.canChat}
          />
        )}
      </Card>
    </div>
  );
}