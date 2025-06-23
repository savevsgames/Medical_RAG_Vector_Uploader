import React, { useState, useEffect } from 'react';
import { Cpu, Brain } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { logger, logUserAction, logApiCall, logAgentOperation } from '../utils/logger';
import { GuardianAgentDisplay } from './Chat/components/GuardianAgentDisplay';
import { ChatInterface } from './Chat/components/ChatInterface';

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
        // Check agent status using GET method
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/status`, {
          method: 'GET',
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
          } else if (statusData.container_status === 'running' || statusData.container_status === 'starting') {
            // ✅ NEW CONDITION: Handle container running but agent not yet active
            statusIcon = '🟡';
            statusMessage = (
              <>
                <p><strong>TxAgent Connection: INITIALIZING</strong></p>
                <p>⏳ Container Status: {statusData.container_status}</p>
                {statusData.agent_id && (
                  <p>⏳ Session ID: {statusData.agent_id.substring(0, 12)}...</p>
                )}
                <p>⏳ BioBERT model is coming online</p>
                <p className="mt-2">The TxAgent container is responsive and initializing. Please wait a moment for the session to become fully active.</p>
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
      // UPDATED: Choose endpoint based on selected agent
      const endpoint = selectedAgent === 'txagent' ? '/api/chat' : '/api/openai-chat';
      
      logApiCall(endpoint, 'POST', userEmail, 'initiated', {
        messageLength: messageContent.length,
        selectedAgent: selectedAgent,
        component: 'Chat'
      });

      // UPDATED: Prepare request body based on agent type
      let requestBody;
      if (selectedAgent === 'txagent') {
        // TxAgent expects: message (will be converted to query in backend)
        requestBody = {
          message: messageContent,
          top_k: 5,
          temperature: 0.7
        };
      } else {
        // OpenAI expects: message, context
        requestBody = {
          message: messageContent,
          context: messages.slice(-5) // Send last 5 messages for context
        };
      }

      // CRITICAL: Ensure we're using POST method for chat requests
      const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Enhanced error handling for different response types
      if (!response.ok) {
        let errorData;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
        } else {
          // Handle HTML error pages
          const htmlText = await response.text();
          throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}. This usually indicates a server error.`);
        }
        
        logApiCall(endpoint, 'POST', userEmail, 'error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          selectedAgent: selectedAgent,
          component: 'Chat'
        });

        // Enhanced error messages based on status codes
        if (response.status === 503) {
          throw new Error(errorData.details || 'TxAgent is not running. Please start the agent from the Monitor page.');
        } else if (response.status === 422) {
          throw new Error(errorData.details || 'Request format error. The TxAgent container may need to be updated.');
        } else if (response.status === 401) {
          throw new Error('Authentication failed. Please refresh the page and try again.');
        } else {
          throw new Error(errorData.details || errorData.error || `HTTP ${response.status}: Chat request failed`);
        }
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
        content: data.response || data.answer || 'No response received',
        timestamp: new Date(),
        sources: data.sources || [],
        agent_id: data.agent_id || selectedAgent
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Show success toast based on agent used
      if (data.agent_id === 'txagent' || selectedAgent === 'txagent') {
        logAgentOperation('TxAgent Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          processingTime: data.processing_time,
          model: data.model,
          tokensUsed: data.tokens_used,
          component: 'Chat'
        });
        toast.success(`Response from TxAgent${data.processing_time ? ` (${data.processing_time}ms)` : ''}`);
      } else {
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
        selectedAgent: selectedAgent,
        endpoint: currentAgent.endpoint
      });

      toast.error(errorMessage);
      
      // Add error message with helpful suggestions
      const errorMessage_obj: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: (
          <div>
            <p>I apologize, but I encountered an error processing your request with {currentAgent.name}.</p>
            <p className="mt-2">Error: {errorMessage}</p>
            <div className="mt-2 text-sm">
              <p className="font-medium">Suggestions:</p>
              <ul className="list-disc pl-5 mt-1">
                <li>If using TxAgent, ensure it's running from the <Link to="/monitor" className="text-healing-teal underline">Monitor page</Link></li>
                <li>Try switching to OpenAI as an alternative</li>
                <li>Check your internet connection</li>
                <li>Refresh the page and try again</li>
              </ul>
            </div>
          </div>
        ),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage_obj]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col lg:flex-row">
      {/* Guardian Agent Display */}
      <GuardianAgentDisplay 
        txAgentStatus={txAgentStatus}
        connectionChecking={connectionChecking}
      />

      {/* Chat Interface */}
      <ChatInterface
        messages={messages}
        selectedAgent={selectedAgent}
        currentAgent={currentAgent}
        agentConfigs={AGENT_CONFIGS}
        isLoading={isLoading}
        inputValue={inputValue}
        txAgentStatus={txAgentStatus}
        connectionChecking={connectionChecking}
        onAgentChange={handleAgentChange}
        onInputChange={setInputValue}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}