import React, { useState } from 'react';
import { Terminal, Eye, EyeOff } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface ContainerLog {
  timestamp: string;
  level: string;
  message: string;
  component?: string;
  user_id?: string;
}

interface ActivityLogsProps {
  logs: ContainerLog[];
  onClear: () => void;
}

export function ActivityLogs({ logs, onClear }: ActivityLogsProps) {
  const [showLogs, setShowLogs] = useState(false);

  const getLogLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'text-red-600 bg-red-50';
      case 'WARN': case 'WARNING': return 'text-yellow-600 bg-yellow-50';
      case 'SUCCESS': return 'text-green-600 bg-green-50';
      case 'INFO': return 'text-blue-600 bg-blue-50';
      case 'DEBUG': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Container Activity Logs</h2>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLogs(!showLogs)}
            icon={showLogs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      </div>

      {showLogs && (
        <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No logs available. Perform a status check or start the agent to see activity.</p>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start space-x-3 text-gray-300">
                  <span className="text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${getLogLevelColor(log.level)}`}>
                    {log.level}
                  </span>
                  {log.component && (
                    <span className="text-blue-400 text-xs">
                      [{log.component}]
                    </span>
                  )}
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!showLogs && logs.length > 0 && (
        <div className="text-center py-4 text-gray-500">
          <p>{logs.length} log entries available. Click "Show Logs" to view them.</p>
        </div>
      )}
    </Card>
  );
}