import React from 'react';
import { Bot, User, AlertCircle, FileText } from 'lucide-react';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

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

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const getMessageIcon = (message: Message) => {
    if (message.type === 'user') {
      return <User className="w-4 h-4 text-gray-600" />;
    } else if (message.type === 'system') {
      return <AlertCircle className="w-4 h-4 text-purple-600" />;
    } else {
      return <Bot className="w-4 h-4 text-blue-600" />;
    }
  };

  const getMessageBgColor = (message: Message) => {
    if (message.type === 'user') {
      return 'bg-gray-100';
    } else if (message.type === 'system') {
      return 'bg-purple-100';
    } else {
      return 'bg-blue-100';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Start a conversation with your AI assistant</p>
          <p className="text-sm mt-2">
            💡 Try asking: "What are the key findings in my documents?" or "Summarize the main points"
          </p>
        </div>
      )}

      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex items-start space-x-3 ${
            message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''
          }`}
        >
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${getMessageBgColor(message)}`}>
            {getMessageIcon(message)}
          </div>
          <div className={`max-w-xs lg:max-w-md ${
            message.type === 'user' ? 'text-right' : ''
          }`}>
            <div className={`px-4 py-2 rounded-lg ${
              message.type === 'user'
                ? 'bg-blue-600 text-white'
                : message.type === 'system'
                ? 'bg-purple-100 text-purple-900'
                : 'bg-gray-100 text-gray-900'
            }`}>
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <div className={`flex items-center justify-between mt-1 ${
                message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
              }`}>
                <p className="text-xs">
                  {message.timestamp.toLocaleTimeString()}
                </p>
                {message.agent_id && message.agent_id !== 'system' && (
                  <p className="text-xs font-mono">
                    {message.agent_id === 'txagent' ? 'TxAgent' : 'OpenAI'}
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
            <LoadingSpinner size="sm" text="AI is thinking..." />
          </div>
        </div>
      )}
    </div>
  );
}