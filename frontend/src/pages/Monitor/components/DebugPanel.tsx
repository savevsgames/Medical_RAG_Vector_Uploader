import React from 'react';
import { Card } from '../../../components/ui/Card';

interface DebugPanelProps {
  agentStatus: any;
  detailedStatus: any;
}

export function DebugPanel({ agentStatus, detailedStatus }: DebugPanelProps) {
  return (
    <Card className="bg-yellow-50 border-yellow-200">
      <h3 className="font-medium text-yellow-800 mb-2">Debug Information</h3>
      <pre className="text-xs text-yellow-700 overflow-auto max-h-64">
        {JSON.stringify({ 
          agentStatus, 
          detailedStatus,
          environment: {
            api_url: import.meta.env.VITE_API_URL,
            supabase_url: import.meta.env.VITE_SUPABASE_URL
          }
        }, null, 2)}
      </pre>
    </Card>
  );
}