import React, { useState, useEffect } from 'react';
import { Send, Bot, User, Loader2, FileText, Cpu, Brain, ChevronDown, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { logger, logUserAction, logApiCall, logAgentOperation } from '../utils/logger';

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

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  txagent: {
    id: 'txagent',
    name: 'TxAgent',
    description: 'BioBERT-powered medical AI running on RunPod containers',
    icon: Cpu,
    endpoint: '/api/chat',
    color: 'text-healing-teal',
    bgColor: 'bg-healing-teal/10'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-powered assistant with medical document RAG',
    icon: Brain,
    endpoint: '/api/openai-chat',
    color: 'text-guardian-gold',
    bgColor: 'bg-guardian-gold/10'
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
        // Check agent status using GET method (this is correct for status endpoint)
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/status`, {
          method: 'GET', // Explicitly specify GET method for status check
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const statusData = await response.json();
          setTxAgentStatus(statusData);
          
          // Create connection status message
          let statusMessage: React.ReactNode;
          let statusIcon = '';
          
          if (statusData.agent_active && statusData.container_status === 'running') {
            statusIcon = '🟢';
            statusMessage = (
              <>
                <p><strong>TxAgent Connection: ACTIVE</strong></p>
                <p>✅ Container Status: {statusData.container_status}</p>
                <p>✅ Session ID: {statusData.agent_id?.substring(0, 12)}...</p>
                <p>✅ BioBERT model ready for medical document analysis</p>
                <p className="mt-2">You can now ask questions about your uploaded documents using the specialized medical AI model.</p>
              </>
            );
          } else if (statusData.agent_active && statusData.container_status === 'starting') {
            statusIcon = '🟡';
            statusMessage = (
              <>
                <p><strong>TxAgent Connection: STARTING</strong></p>
                <p>⏳ Container Status: {statusData.container_status}</p>
                <p>⏳ Session ID: {statusData.agent_id?.substring(0, 12)}...</p>
                <p>⏳ BioBERT model is initializing</p>
                <p className="mt-2">Please wait a moment for the container to fully start up.</p>
              </>
            );
          } else if (statusData.container_status === 'unreachable') {
            statusIcon = '🔴';
            statusMessage = (
              <>
                <p><strong>TxAgent Connection: UNREACHABLE</strong></p>
                <p>❌ Container Status: {statusData.container_status}</p>
                <p>❌ RunPod container is not responding</p>
                <p>❌ BioBERT model unavailable</p>
                <p className="mt-2">Falling back to OpenAI for document analysis. You can try starting the TxAgent from the <Link to="/monitor" className="text-healing-teal underline">Monitor page</Link>.</p>
              </>
            );
          } else {
            statusIcon = '🔴';
            statusMessage = (
              <>
                <p><strong>TxAgent Connection: INACTIVE</strong></p>
                <p>❌ Container Status: {statusData.container_status || 'stopped'}</p>
                <p>❌ No active session</p>
                <p>❌ BioBERT model not available</p>
                <p className="mt-2">You can start the TxAgent from the <Link to="/monitor" className="text-healing-teal underline">Monitor page</Link> or use OpenAI as an alternative.</p>
              </>
            );
          }

          // Add container health details if available
          if (statusData.container_health && typeof statusData.container_health === 'object') {
            const health = statusData.container_health;
            const healthDetails = (
              <div className="mt-2">
                <p><strong>📊 Container Health:</strong></p>
                <ul className="list-disc pl-5">
                  <li>Model: {health.model || 'Unknown'}</li>
                  <li>Device: {health.device || 'Unknown'}</li>
                  <li>Version: {health.version || 'Unknown'}</li>
                </ul>
              </div>
            );
            statusMessage = (
              <>
                {statusMessage}
                {healthDetails}
              </>
            );
          }

          const connectionMessage: Message = {
            id: 'connection-status',
            type: 'assistant',
            content: (
              <div>
                {statusIcon} {statusMessage}
              </div>
            ),
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
          content: (
            <div>
              <p>🔴 <strong>TxAgent Connection: ERROR</strong></p>
              <p>❌ Failed to check container status</p>
              <p>❌ Backend communication error</p>
              <p>❌ BioBERT model status unknown</p>
              <p className="mt-2">Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
              <p className="mt-2">You can try refreshing the page or use OpenAI as an alternative.</p>
            </div>
          ),
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

      // CRITICAL: Ensure we're using POST method for chat requests
      const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        method: 'POST', // Explicitly specify POST method
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: messageContent,
          context: messages.slice(-5) // Send last 5 messages for context
        }),
      });

      // Check if response is HTML (error page) instead of JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const htmlText = await response.text();
        throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}. This usually indicates a server error.`);
      }

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
        content: (
          <div>
            <p>I apologize, but I encountered an error processing your request with {currentAgent.name}.</p>
            <p className="mt-2">Error: {errorMessage}</p>
            <p className="mt-2">Please try again or switch to a different agent.</p>
          </div>
        ),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage_obj]);
    } finally {
      setIsLoading(false);
    }
  };

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
    <div className="h-[calc(100vh-200px)] flex">
      {/* Guardian Agent Image - Left Side */}
      <div className="hidden lg:flex lg:w-80 xl:w-96 flex-col items-center justify-center p-6 bg-gradient-to-b from-healing-teal/5 to-guardian-gold/5 rounded-l-2xl border-r border-soft-gray/20">
        <div className="relative">
          {/* Guardian Agent Image */}
          <img 
            src="/symptom_savior_concept_art_04_guardianagent_leftfacing.png" 
            alt="Guardian Agent - Your Medical AI Assistant" 
            className="w-64 h-64 xl:w-72 xl:h-72 object-contain animate-float drop-shadow-lg"
          />
          
          {/* Floating Status Indicator */}
          <div className="absolute -top-2 -right-2">
            <div className={`w-6 h-6 rounded-full border-2 border-cloud-ivory shadow-lg flex items-center justify-center ${
              txAgentStatus?.agent_active && txAgentStatus.container_status === 'running'
                ? 'bg-healing-teal animate-pulse-glow'
                : txAgentStatus?.container_status === 'starting'
                ? 'bg-guardian-gold animate-pulse'
                : 'bg-red-500'
            }`}>
              {txAgentStatus?.agent_active && txAgentStatus.container_status === 'running' ? (
                <CheckCircle className="w-3 h-3 text-cloud-ivory" />
              ) : txAgentStatus?.container_status === 'starting' ? (
                <Loader2 className="w-3 h-3 text-cloud-ivory animate-spin" />
              ) : (
                <XCircle className="w-3 h-3 text-cloud-ivory" />
              )}
            </div>
          </div>
        </div>

        {/* Guardian Info */}
        <div className="mt-6 text-center">
          <h3 className="text-lg font-heading font-bold text-deep-midnight mb-2">
            Guardian Agent
          </h3>
          <p className="text-sm text-soft-gray font-body leading-relaxed">
            Your dedicated medical AI assistant, powered by advanced BioBERT technology and ready to help analyze your medical documents.
          </p>
          
          {/* Status Badge */}
          <div className="mt-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-subheading font-medium ${
              txAgentStatus?.agent_active && txAgentStatus.container_status === 'running'
                ? 'bg-healing-teal/10 text-healing-teal'
                : txAgentStatus?.container_status === 'starting'
                ? 'bg-guardian-gold/10 text-guardian-gold'
                : 'bg-red-100 text-red-600'
            }`}>
              {getConnectionStatusIcon()}
              <span className="ml-2">
                {txAgentStatus?.agent_active && txAgentStatus.container_status === 'running'
                  ? 'Ready to Help'
                  : txAgentStatus?.container_status === 'starting'
                  ? 'Initializing...'
                  : 'Offline'
                }
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Chat Interface - Right Side */}
      <div className="flex-1 flex flex-col bg-cloud-ivory rounded-r-2xl lg:rounded-l-none rounded-l-2xl shadow-soft border border-soft-gray/20">
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
                  onChange={(e) => handleAgentChange(e.target.value as AgentType)}
                  className="appearance-none bg-cloud-ivory border border-soft-gray/30 rounded-xl px-4 py-2 pr-8 text-sm font-subheading font-medium text-deep-midnight hover:border-healing-teal focus:outline-none focus:ring-2 focus:ring-healing-teal focus:border-transparent cursor-pointer transition-all duration-200"
                >
                  {Object.values(AGENT_CONFIGS).map((agent) => (
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
                  <Brain className="w-4 h-4 text-guardian-gold" />
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
        <form onSubmit={handleSendMessage} className="p-4 border-t border-soft-gray/20">
          <div className="flex space-x-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
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
    </div>
  );
}