import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface AgentConfig {
  name: string;
}

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  currentAgent: AgentConfig;
  disabled?: boolean;
}

export function MessageInput({ onSendMessage, isLoading, currentAgent, disabled }: MessageInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || disabled) return;

    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
      <div className="flex space-x-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={disabled ? 'Agent not ready...' : `Ask ${currentAgent.name} about your medical documents...`}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading || disabled}
        />
        <Button
          type="submit"
          disabled={!inputValue.trim() || isLoading || disabled}
          loading={isLoading}
          icon={<Send className="w-5 h-5" />}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-gray-500">
          💡 Try asking: "What are the key findings in my documents?" or "Summarize the main points"
        </p>
        <div className="flex items-center space-x-1 text-xs text-gray-500">
          <span>Using:</span>
          <span className="font-medium text-blue-600">
            {currentAgent.name}
          </span>
        </div>
      </div>
    </form>
  );
}