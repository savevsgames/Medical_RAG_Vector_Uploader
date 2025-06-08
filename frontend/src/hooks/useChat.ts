import { useState, useCallback } from 'react';
import { useApi } from './useApi';
import { useAuth } from '../contexts/AuthContext';
import { logger, logUserAction, logAgentOperation } from '../utils/logger';
import toast from 'react-hot-toast';

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
  endpoint: string;
}

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  txagent: {
    id: 'txagent',
    name: 'TxAgent',
    description: 'BioBERT-powered medical AI running on RunPod containers',
    endpoint: '/api/chat'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-powered assistant with medical document RAG',
    endpoint: '/api/openai-chat'
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
      type: 'assistant',
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
    const userMessage = addMessage({
      type: 'user',
      content: messageContent,
      timestamp: new Date()
    });

    setIsLoading(true);

    try {
      const endpoint = currentAgent.endpoint;
      
      const data = await apiCall(endpoint, {
        method: 'POST',
        body: { 
          message: messageContent,
          context: messages.slice(-5) // Send last 5 messages for context
        }
      });

      // Add assistant response
      addMessage({
        type: 'assistant',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources || [],
        agent_id: data.agent_id
      });

      // Show success toast based on agent used
      if (data.agent_id === 'txagent') {
        logAgentOperation('TxAgent Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          processingTime: data.processing_time,
          component: 'useChat'
        });
        toast.success('Response from TxAgent container');
      } else if (data.agent_id === 'openai') {
        logAgentOperation('OpenAI Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          component: 'useChat'
        });
        toast.success('Response from OpenAI with RAG');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown chat error';
      
      logger.error('Chat request failed', {
        component: 'useChat',
        user: userEmail,
        error: errorMessage,
        messageLength: messageContent.length,
        selectedAgent: selectedAgent
      });

      toast.error(errorMessage);
      
      // Add error message
      addMessage({
        type: 'assistant',
        content: (
          <div>
            <p>I apologize, but I encountered an error processing your request with {currentAgent.name}.</p>
            <p className="mt-2">Error: {errorMessage}</p>
            <p className="mt-2">Please try again or switch to a different agent.</p>
          </div>
        ),
        timestamp: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiCall, user, selectedAgent, currentAgent, messages, isLoading, addMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

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