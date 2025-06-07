import React, { useState } from 'react';
import { Send, Bot, User, Loader2, FileText } from 'lucide-react';
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

export function Chat() {
  const { session, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hello! I\'m your TxAgent-powered medical research assistant. I can help you analyze your uploaded documents and answer questions about medical topics. Upload some documents first, then ask me anything!',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !session) return;

    const userEmail = user?.email;
    const messageContent = inputValue.trim();

    logUserAction('Chat Message Sent', userEmail, {
      messageLength: messageContent.length,
      messagePreview: messageContent.substring(0, 100),
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
      // Try RunPod TxAgent API first
      let response;
      let endpoint = '/api/chat';
      let isLegacyFallback = false;

      logApiCall(endpoint, 'POST', userEmail, 'initiated', {
        messageLength: messageContent.length,
        contextMessages: messages.slice(-5).length,
        component: 'Chat'
      });

      try {
        response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
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
      } catch (runpodError) {
        logger.warn('Primary API failed, falling back to legacy chat', {
          component: 'Chat',
          user: userEmail,
          error: runpodError instanceof Error ? runpodError.message : 'Unknown error',
          fallbackEndpoint: '/chat'
        });

        // Fallback to legacy chat endpoint
        endpoint = '/chat';
        isLegacyFallback = true;
        
        logApiCall(endpoint, 'POST', userEmail, 'initiated', {
          messageLength: messageContent.length,
          isLegacyFallback: true,
          component: 'Chat'
        });

        response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: messageContent }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        logApiCall(endpoint, 'POST', userEmail, 'error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          isLegacyFallback,
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
        isLegacyFallback,
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

      // Show success toast if using TxAgent
      if (data.agent_id && data.agent_id !== 'legacy') {
        logAgentOperation('Response Received', userEmail, {
          agentId: data.agent_id,
          sourcesCount: data.sources?.length || 0,
          processingTime: data.processing_time,
          component: 'Chat'
        });
        toast.success('Response from TxAgent container');
      } else if (isLegacyFallback) {
        logger.info('Legacy chat response received', {
          component: 'Chat',
          user: userEmail,
          responseLength: data.response?.length || 0
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown chat error';
      
      logger.error('Chat request failed', {
        component: 'Chat',
        user: userEmail,
        error: errorMessage,
        messageLength: messageContent.length
      });

      toast.error(errorMessage);
      
      // Add error message
      const errorMessage_obj: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please make sure the TxAgent container is running and try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage_obj]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col bg-white rounded-lg shadow">
      {/* Chat Header */}
      <div className="flex items-center space-x-3 p-4 border-b border-gray-200">
        <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
          <Bot className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">TxAgent Medical Assistant</h2>
          <p className="text-sm text-gray-500">Powered by RunPod containerized agents</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                : 'bg-blue-100'
            }`}>
              {message.type === 'user' ? (
                <User className="w-4 h-4 text-gray-600" />
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
                  {message.agent_id && (
                    <p className="text-xs font-mono">
                      TxAgent: {message.agent_id.substring(0, 8)}...
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
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="bg-gray-100 px-4 py-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                <span className="text-sm text-gray-500">TxAgent is analyzing your documents...</span>
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
            placeholder="Ask your TxAgent about your medical documents..."
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
        <p className="text-xs text-gray-500 mt-2">
          💡 Try asking: "What are the key findings in my documents?" or "Summarize the main points"
        </p>
      </form>
    </div>
  );
}