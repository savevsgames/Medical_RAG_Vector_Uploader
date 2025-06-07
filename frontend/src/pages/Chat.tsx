import React, { useState, useEffect } from 'react';
import { Send, Bot, User, Loader2, FileText, Cpu, Brain, ChevronDown, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { logger, logUserAction, logApiCall, logAgentOperation } from '../utils/logger';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
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

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  txagent: {
    id: 'txagent',
    name: 'TxAgent',
    description: 'BioBERT-powered medical AI running on RunPod containers',
    icon: Cpu,
    endpoint: '/api/chat',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-powered assistant with medical document RAG',
    icon: Brain,
    endpoint: '/api/openai-chat',
    color: 'text-green-600',
    bgColor: 'bg-green-100'
  }
};

export function Chat() {
  const { session, user } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('txagent');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [txAgentStatus, setTxAgentStatus] = useState<TxAgentStatus | null>(null);
  const [connectionChecking, setConnectionChecking] = useState(true);

  const currentAgent = AGENT_CONFIGS[selectedAgent];

  // Check TxAgent connection status on component mount
  useEffect(() => {
    const checkTxAgentConnection = async () => {
      if (!session) {
        setConnectionChecking(false);
        return;
      }

      const userEmail = user?.email;
      
      logger.info('Checking TxAgent connection status', {
        component: 'Chat',
        user: userEmail
      });

      try {
        // Check agent status
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const statusData = await response.json();
          setTxAgentStatus(statusData);
          
          // Create connection status message
          let statusMessage = '';
          let statusIcon = '';
          
          if (statusData.agent_active && statusData.container_status === 'running') {
            statusIcon = '🟢';
            statusMessage = `TxAgent Connection: ACTIVE\n\n✅ Container Status: ${statusData.container_status}\n✅ Session ID: ${statusData.agent_id?.substring(0, 12)}...\n✅ BioBERT model ready for medical document analysis\n\nYou can now ask questions about your uploaded documents using the specialized medical AI model.`;
          } else if (statusData.agent_active && statusData.container_status === 'starting') {
            statusIcon = '🟡';
            statusMessage = `TxAgent Connection: STARTING\n\n⏳ Container Status: ${statusData.container_status}\n⏳ Session ID: ${statusData.agent_id?.substring(0, 12)}...\n⏳ BioBERT model is initializing\n\nPlease wait a moment for the container to fully start up.`;
          } else if (statusData.container_status === 'unreachable') {
            statusIcon = '🔴';
            statusMessage = `TxAgent Connection: UNREACHABLE\n\n❌ Container Status: ${statusData.container_status}\n❌ RunPod container is not responding\n❌ BioBERT model unavailable\n\nFalling back to OpenAI for document analysis. You can try starting the TxAgent from the Monitor page.`;
          } else {
            statusIcon = '🔴';
            statusMessage = `TxAgent Connection: INACTIVE\n\n❌ Container Status: ${statusData.container_status || 'stopped'}\n❌ No active session\n❌ BioBERT model not available\n\nYou can start the TxAgent from the Monitor page or use OpenAI as an alternative.`;
          }

          // Add container health details if available
          if (statusData.container_health && typeof statusData.container_health === 'object') {
            const health = statusData.container_health;
            statusMessage += `\n\n📊 Container Health:\n• Model: ${health.model || 'Unknown'}\n• Device: ${health.device || 'Unknown'}\n• Version: ${health.version || 'Unknown'}`;
          }

          const connectionMessage: Message = {
            id: 'connection-status',
            type: 'assistant',
            content: `${statusIcon} ${statusMessage}`,
            timestamp: new Date(),
            agent_id: 'system'
          };

          setMessages([connectionMessage]);

          logAgentOperation('Connection Status Checked', userEmail, {
            agentActive: statusData.agent_active,
            containerStatus: statusData.container_status,
            agentId: statusData.agent_id,
            component: 'Chat'
          });

        } else {
          throw new Error(`Status check failed: ${response.status}`);
        }
      } catch (error) {
        logger.error('Failed to check TxAgent connection', {
          component: 'Chat',
          user: userEmail,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Show connection error message
        const errorMessage: Message = {
          id: 'connection-error',
          type: 'assistant',
          content: `🔴 TxAgent Connection: ERROR\n\n❌ Failed to check container status\n❌ Backend communication error\n❌ BioBERT model status unknown\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nYou can try refreshing the page or use OpenAI as an alternative.`,
          timestamp: new Date(),
          agent_id: 'system'
        };

        setMessages([errorMessage]);
      } finally {
        setConnectionChecking(false);
      }
    };

    checkTxAgentConnection();
  }, [session, user]);

  const handleAgentChange = (newAgent: AgentType) => {
    const userEmail = user?.email;
    
    logUserAction('Agent Selection Changed', userEmail, {
      previousAgent: selectedAgent,
      newAgent: newAgent,
      component: 'Chat'
    });

    setSelectedAgent(newAgent);
    
    // Add a system message about the agent change
    const systemMessage: Message = {
      id: Date.now().toString(),
      type: 'assistant',
      content: `Switched to ${AGENT_CONFIGS[newAgent].name}. ${AGENT_CONFIGS[newAgent].description}`,
      timestamp: new Date(),
      agent_id: newAgent
    };
    
    setMessages(prev => [...prev, systemMessage]);
    toast.success(`Switched to ${AGENT_CONFIGS[newAgent].name}`);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !session) return;

    const userEmail = user?.email;
    const messageContent = inputValue.trim();

    logUserAction('Chat Message Sent', userEmail, {
      messageLength: messageContent.length,
      messagePreview: messageContent.substring(0, 100),
      selectedAgent: selectedAgent,
      component: 'Chat'
    });

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: messageContent,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const endpoint = currentAgent.endpoint;
      
      logApiCall(endpoint, 'POST', userEmail, 'initiated', {
        messageLength: messageContent.length,
        contextMessages: messages.slice(-5).length,
        selectedAgent: selectedAgent,
        component: 'Chat'
      });

      const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: messageContent,
          context: messages.slice(-5) // Send last 5 messages for context
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        logApiCall(endpoint, 'POST', userEmail, 'error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          selectedAgent: selectedAgent,
          component: 'Chat'
        });

        throw new Error(errorData.details || errorData.error || `HTTP ${response.status}: Chat request failed`);
      }

      const data = await response.json();

      logApiCall(endpoint, 'POST', userEmail, 'success', {
        status: response.status,
        agentId: data.agent_id,
        sourcesCount: data.sources?.length || 0,
        responseLength: data.response?.length || 0,
        selectedAgent: selectedAgent,
        component: 'Chat'
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources || [],
        agent_id: data.agent_id
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Show success toast based on agent used
      if (data.agent_id === 'txagent') {
        logAgentOperation('TxAgent Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          processingTime: data.processing_time,
          component: 'Chat'
        });
        toast.success('Response from TxAgent container');
      } else if (data.agent_id === 'openai') {
        logAgentOperation('OpenAI Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          component: 'Chat'
        });
        toast.success('Response from OpenAI with RAG');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown chat error';
      
      logger.error('Chat request failed', {
        component: 'Chat',
        user: userEmail,
        error: errorMessage,
        messageLength: messageContent.length,
        selectedAgent: selectedAgent
      });

      toast.error(errorMessage);
      
      // Add error message
      const errorMessage_obj: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `I apologize, but I encountered an error processing your request with ${currentAgent.name}. Please try again or switch to a different agent.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage_obj]);
    } finally {
      setIsLoading(false);
    }
  };

  const getConnectionStatusIcon = () => {
    if (connectionChecking) return <Loader2 className="w-4 h-4 animate-spin text-gray-500" />;
    
    if (!txAgentStatus) return <XCircle className="w-4 h-4 text-red-500" />;
    
    if (txAgentStatus.agent_active && txAgentStatus.container_status === 'running') {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    } else if (txAgentStatus.container_status === 'starting') {
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    } else {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col bg-white rounded-lg shadow">
      {/* Chat Header with Agent Selector */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className={`flex items-center justify-center w-10 h-10 ${currentAgent.bgColor} rounded-full`}>
            <currentAgent.icon className={`w-6 h-6 ${currentAgent.color}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-semibold text-gray-900">Medical AI Assistant</h2>
              {getConnectionStatusIcon()}
            </div>
            <p className="text-sm text-gray-500">{currentAgent.description}</p>
          </div>
        </div>

        {/* Agent Selector Dropdown */}
        <div className="relative">
          <div className="flex items-center space-x-2">
            <label htmlFor="agent-select" className="text-sm font-medium text-gray-700">
              AI Agent:
            </label>
            <div className="relative">
              <select
                id="agent-select"
                value={selectedAgent}
                onChange={(e) => handleAgentChange(e.target.value as AgentType)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-900 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
              >
                {Object.values(AGENT_CONFIGS).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {connectionChecking && (
          <div className="flex items-start space-x-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            </div>
            <div className="bg-gray-100 px-4 py-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Checking TxAgent connection status...</span>
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
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              message.type === 'user' 
                ? 'bg-gray-100' 
                : message.agent_id === 'openai'
                ? 'bg-green-100'
                : message.agent_id === 'system'
                ? 'bg-purple-100'
                : 'bg-blue-100'
            }`}>
              {message.type === 'user' ? (
                <User className="w-4 h-4 text-gray-600" />
              ) : message.agent_id === 'openai' ? (
                <Brain className="w-4 h-4 text-green-600" />
              ) : message.agent_id === 'system' ? (
                <AlertCircle className="w-4 h-4 text-purple-600" />
              ) : (
                <Bot className="w-4 h-4 text-blue-600" />
              )}
            </div>
            <div className={`max-w-xs lg:max-w-md ${
              message.type === 'user' ? 'text-right' : ''
            }`}>
              <div className={`px-4 py-2 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <div className={`flex items-center justify-between mt-1 ${
                  message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  <p className="text-xs">
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
                  <p className="text-xs text-gray-500 font-medium">Sources:</p>
                  {message.sources.map((source, index) => (
                    <div key={index} className="flex items-center space-x-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                      <FileText className="w-3 h-3" />
                      <span>{source.filename}</span>
                      <span className="text-gray-400">({Math.round(source.similarity * 100)}% match)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className={`flex items-center justify-center w-8 h-8 ${currentAgent.bgColor} rounded-full`}>
              <currentAgent.icon className={`w-4 h-4 ${currentAgent.color}`} />
            </div>
            <div className="bg-gray-100 px-4 py-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                <span className="text-sm text-gray-500">
                  {currentAgent.name} is analyzing your documents...
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
        <div className="flex space-x-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Ask ${currentAgent.name} about your medical documents...`}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">
            💡 Try asking: "What are the key findings in my documents?" or "Summarize the main points"
          </p>
          <div className="flex items-center space-x-1 text-xs text-gray-500">
            <span>Using:</span>
            <span className={`font-medium ${currentAgent.color}`}>
              {currentAgent.name}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}