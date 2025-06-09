import React from 'react';
import { MessageSquare, Loader2, ChevronDown, CheckCircle, XCircle, AlertCircle, Send, Bot, User, FileText } from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: React.ReactNode;
  timestamp: Date;
  sources?: Array<{
    filename: string;
    similarity: number;
  }>;
  agent_id?: string;
}

type AgentType = 'txagent' | 'openai';

interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  color: string;
  bgColor: string;
}

interface TxAgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  container_status?: string;
  container_health?: any;
}

interface ChatInterfaceProps {
  messages: Message[];
  selectedAgent: AgentType;
  currentAgent: AgentConfig;
  agentConfigs: Record<AgentType, AgentConfig>;
  isLoading: boolean;
  inputValue: string;
  txAgentStatus: TxAgentStatus | null;
  connectionChecking: boolean;
  onAgentChange: (agent: AgentType) => void;
  onInputChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
}

export function ChatInterface({
  messages,
  selectedAgent,
  currentAgent,
  agentConfigs,
  isLoading,
  inputValue,
  txAgentStatus,
  connectionChecking,
  onAgentChange,
  onInputChange,
  onSendMessage
}: ChatInterfaceProps) {
  const getConnectionStatusIcon = () => {
    if (connectionChecking) return <Loader2 className="w-4 h-4 animate-spin text-soft-gray" />;
    
    if (!txAgentStatus) return <XCircle className="w-4 h-4 text-red-500" />;
    
    if (txAgentStatus.agent_active && txAgentStatus.container_status === 'running') {
      return <CheckCircle className="w-4 h-4 text-healing-teal" />;
    } else if (txAgentStatus.container_status === 'starting') {
      return <AlertCircle className="w-4 h-4 text-guardian-gold" />;
    } else {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-cloud-ivory lg:rounded-l-2xl lg:rounded-r-none rounded-2xl shadow-soft border border-soft-gray/20 lg:order-1">
      {/* Chat Header with Agent Selector */}
      <div className="flex items-center justify-between p-4 border-b border-soft-gray/20">
        <div className="flex items-center space-x-3">
          <div className={`flex items-center justify-center w-10 h-10 ${currentAgent.bgColor} rounded-xl`}>
            <currentAgent.icon className={`w-6 h-6 ${currentAgent.color}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-heading font-bold text-deep-midnight">Medical AI Assistant</h2>
              {getConnectionStatusIcon()}
            </div>
            <p className="text-sm text-soft-gray font-body">{currentAgent.description}</p>
          </div>
        </div>

        {/* Agent Selector Dropdown */}
        <div className="relative">
          <div className="flex items-center space-x-2">
            <label htmlFor="agent-select" className="text-sm font-subheading font-medium text-deep-midnight">
              AI Agent:
            </label>
            <div className="relative">
              <select
                id="agent-select"
                value={selectedAgent}
                onChange={(e) => onAgentChange(e.target.value as AgentType)}
                className="appearance-none bg-cloud-ivory border border-soft-gray/30 rounded-xl px-4 py-2 pr-8 text-sm font-subheading font-medium text-deep-midnight hover:border-healing-teal focus:outline-none focus:ring-2 focus:ring-healing-teal focus:border-transparent cursor-pointer transition-all duration-200"
              >
                {Object.values(agentConfigs).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-soft-gray pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {connectionChecking && (
          <div className="flex items-start space-x-3">
            <div className="flex items-center justify-center w-8 h-8 bg-healing-teal/10 rounded-xl">
              <Loader2 className="w-4 h-4 animate-spin text-healing-teal" />
            </div>
            <div className="bg-sky-blue/30 px-4 py-2 rounded-xl">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-deep-midnight font-body">Checking TxAgent connection status...</span>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start space-x-3 ${
              message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${
              message.type === 'user' 
                ? 'bg-soft-gray/20' 
                : message.agent_id === 'openai'
                ? 'bg-guardian-gold/10'
                : message.agent_id === 'system'
                ? 'bg-healing-teal/20'
                : 'bg-healing-teal/10'
            }`}>
              {message.type === 'user' ? (
                <User className="w-4 h-4 text-deep-midnight" />
              ) : message.agent_id === 'openai' ? (
                <currentAgent.icon className="w-4 h-4 text-guardian-gold" />
              ) : message.agent_id === 'system' ? (
                <AlertCircle className="w-4 h-4 text-healing-teal" />
              ) : (
                <Bot className="w-4 h-4 text-healing-teal" />
              )}
            </div>
            <div className={`max-w-xs lg:max-w-md ${
              message.type === 'user' ? 'text-right' : ''
            }`}>
              <div className={`px-4 py-2 rounded-xl ${
                message.type === 'user'
                  ? 'bg-healing-teal text-cloud-ivory'
                  : 'bg-sky-blue/30 text-deep-midnight'
              }`}>
                <div className="text-sm whitespace-pre-wrap font-body">{message.content}</div>
                <div className={`flex items-center justify-between mt-1 ${
                  message.type === 'user' ? 'text-cloud-ivory/80' : 'text-soft-gray'
                }`}>
                  <p className="text-xs font-mono">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                  {message.agent_id && message.agent_id !== 'system' && (
                    <p className="text-xs font-mono">
                      {message.agent_id === 'txagent' ? 'TxAgent' : 'OpenAI'}
                      {message.agent_id === 'txagent' && message.agent_id.length > 8 && 
                        `: ${message.agent_id.substring(0, 8)}...`
                      }
                    </p>
                  )}
                </div>
              </div>
              
              {/* Sources */}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-soft-gray font-subheading font-medium">Sources:</p>
                  {message.sources.map((source, index) => (
                    <div key={index} className="flex items-center space-x-2 text-xs text-deep-midnight bg-cloud-ivory rounded-lg px-2 py-1 border border-soft-gray/20">
                      <FileText className="w-3 h-3" />
                      <span className="font-body">{source.filename}</span>
                      <span className="text-soft-gray font-mono">({Math.round(source.similarity * 100)}% match)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className={`flex items-center justify-center w-8 h-8 ${currentAgent.bgColor} rounded-xl`}>
              <currentAgent.icon className={`w-4 h-4 ${currentAgent.color}`} />
            </div>
            <div className="bg-sky-blue/30 px-4 py-2 rounded-xl">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-healing-teal" />
                <span className="text-sm text-deep-midnight font-body">
                  {currentAgent.name} is analyzing your documents...
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={onSendMessage} className="p-4 border-t border-soft-gray/20">
        <div className="flex space-x-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={`Ask ${currentAgent.name} about your medical documents...`}
            className="flex-1 px-4 py-2 border border-soft-gray/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-healing-teal focus:border-transparent bg-cloud-ivory text-deep-midnight font-body transition-all duration-200"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-healing-teal text-cloud-ivory rounded-xl hover:bg-healing-teal/90 focus:outline-none focus:ring-2 focus:ring-healing-teal focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-subheading font-semibold"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-soft-gray font-body">
            💡 Try asking: "What are the key findings in my documents?" or "Summarize the main points"
          </p>
          <div className="flex items-center space-x-1 text-xs text-soft-gray">
            <span className="font-body">Using:</span>
            <span className={`font-subheading font-medium ${currentAgent.color}`}>
              {currentAgent.name}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}