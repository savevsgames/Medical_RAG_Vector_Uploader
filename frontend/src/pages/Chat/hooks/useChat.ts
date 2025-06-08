import { useState, useCallback } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useAuth } from '../../../contexts/AuthContext';
import { logger, logUserAction, logAgentOperation } from '../../../utils/logger';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
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
  endpoint: string;
  color: string;
  bgColor: string;
}

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  txagent: {
    id: 'txagent',
    name: 'TxAgent',
    description: 'BioBERT-powered medical AI running on RunPod containers',
    endpoint: '/api/chat',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-powered assistant with medical document RAG',
    endpoint: '/api/openai-chat',
    color: 'text-green-600',
    bgColor: 'bg-green-100'
  }
};

export function useChat() {
  const { apiCall } = useApi();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('txagent');
  const [isLoading, setIsLoading] = useState(false);

  const currentAgent = AGENT_CONFIGS[selectedAgent];

  const addMessage = useCallback((message: Omit<Message, 'id'>) => {
    const newMessage: Message = {
      ...message,
      id: Date.now().toString()
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, []);

  const addSystemMessage = useCallback((content: React.ReactNode, agentId?: string) => {
    return addMessage({
      type: 'system',
      content,
      timestamp: new Date(),
      agent_id: agentId || 'system'
    });
  }, [addMessage]);

  const changeAgent = useCallback((newAgent: AgentType) => {
    const userEmail = user?.email;
    
    logUserAction('Agent Selection Changed', userEmail, {
      previousAgent: selectedAgent,
      newAgent: newAgent,
      component: 'useChat'
    });

    setSelectedAgent(newAgent);
    
    addSystemMessage(
      `Switched to ${AGENT_CONFIGS[newAgent].name}. ${AGENT_CONFIGS[newAgent].description}`,
      newAgent
    );
    
    toast.success(`Switched to ${AGENT_CONFIGS[newAgent].name}`);
  }, [selectedAgent, user, addSystemMessage]);

  const sendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || isLoading) return;

    const userEmail = user?.email;

    logUserAction('Chat Message Sent', userEmail, {
      messageLength: messageContent.length,
      messagePreview: messageContent.substring(0, 100),
      selectedAgent: selectedAgent,
      component: 'useChat'
    });

    // Add user message
    addMessage({
      type: 'user',
      content: messageContent,
      timestamp: new Date()
    });

    setIsLoading(true);

    try {
      const endpoint = currentAgent.endpoint;
      
      // CRITICAL FIX: Ensure proper request structure
      const requestBody = {
        message: messageContent,
        context: messages.slice(-5).map(m => ({
          type: m.type,
          content: typeof m.content === 'string' ? m.content : String(m.content),
          timestamp: m.timestamp.toISOString()
        }))
      };

      logger.debug('Sending chat request', {
        endpoint,
        method: 'POST',
        bodySize: JSON.stringify(requestBody).length,
        selectedAgent,
        component: 'useChat'
      });

      const data = await apiCall(endpoint, {
        method: 'POST',
        body: requestBody
      });

      // Add assistant response
      addMessage({
        type: 'assistant',
        content: data.response || data.answer || 'No response received',
        timestamp: new Date(),
        sources: data.sources || [],
        agent_id: data.agent_id || selectedAgent
      });

      // Success feedback
      if (data.agent_id === 'txagent' || selectedAgent === 'txagent') {
        logAgentOperation('TxAgent Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          processingTime: data.processing_time,
          component: 'useChat'
        });
        toast.success('Response from TxAgent');
      } else {
        logAgentOperation('OpenAI Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          component: 'useChat'
        });
        toast.success('Response from OpenAI');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown chat error';
      
      logger.error('Chat request failed', {
        component: 'useChat',
        user: userEmail,
        error: errorMessage,
        messageLength: messageContent.length,
        selectedAgent: selectedAgent,
        endpoint: currentAgent.endpoint
      });

      // Add error message
      addMessage({
        type: 'system',
        content: (
          <div className="text-red-600">
            <p className="font-medium">❌ Chat Error</p>
            <p className="text-sm mt-1">{errorMessage}</p>
            <p className="text-xs mt-2 text-gray-500">
              Try refreshing the connection or switching agents.
            </p>
          </div>
        ),
        timestamp: new Date()
      });

      toast.error(`Chat failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiCall, user, selectedAgent, currentAgent, messages, isLoading, addMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    logUserAction('Chat Messages Cleared', user?.email, {
      component: 'useChat'
    });
  }, [user]);

  return {
    messages,
    selectedAgent,
    currentAgent,
    isLoading,
    agentConfigs: AGENT_CONFIGS,
    sendMessage,
    changeAgent,
    addSystemMessage,
    clearMessages
  };
}