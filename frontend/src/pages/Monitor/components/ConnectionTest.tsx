import React from 'react';
import { Terminal } from 'lucide-react';
import { Card } from '../../../components/ui/Card';

interface DetailedStatus {
  container_reachable: boolean;
  jwt_valid: boolean;
  endpoints_working: boolean;
  last_test_time: string;
  test_results: {
    health: { status: number; response?: any; error?: string };
    chat: { status: number; response?: any; error?: string };
    embed: { status: number; response?: any; error?: string };
  };
}

interface ConnectionTestProps {
  detailedStatus: DetailedStatus | null;
  onTest: () => void;
  testing: boolean;
}

export function ConnectionTest({ detailedStatus }: ConnectionTestProps) {
  if (!detailedStatus) return null;

  return (
    <Card>
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-3">
          <Terminal className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-gray-900">Latest Test Results</span>
          <span className="text-xs text-gray-500">
            {new Date(detailedStatus.last_test_time).toLocaleString()}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-white rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Health Check</span>
              <span className={`px-2 py-1 rounded text-xs ${
                detailedStatus.test_results.health.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {detailedStatus.test_results.health.status || 'Failed'}
              </span>
            </div>
            {detailedStatus.test_results.health.error && (
              <p className="text-red-600 text-xs">{detailedStatus.test_results.health.error}</p>
            )}
          </div>
          <div className="bg-white rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Chat Endpoint</span>
              <span className={`px-2 py-1 rounded text-xs ${
                detailedStatus.test_results.chat.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {detailedStatus.test_results.chat.status || 'Failed'}
              </span>
            </div>
            {detailedStatus.test_results.chat.error && (
              <p className="text-red-600 text-xs">{detailedStatus.test_results.chat.error}</p>
            )}
          </div>
          <div className="bg-white rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Embed Endpoint</span>
              <span className={`px-2 py-1 rounded text-xs ${
                detailedStatus.test_results.embed.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {detailedStatus.test_results.embed.status || 'Failed'}
              </span>
            </div>
            {detailedStatus.test_results.embed.error && (
              <p className="text-red-600 text-xs">{detailedStatus.test_results.embed.error}</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}