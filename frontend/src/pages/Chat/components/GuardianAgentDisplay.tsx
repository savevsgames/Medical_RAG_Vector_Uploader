import React from 'react';
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';

interface TxAgentStatus {
  agent_active: boolean;
  agent_id: string | null;
  container_status?: string;
  container_health?: any;
}

interface GuardianAgentDisplayProps {
  txAgentStatus: TxAgentStatus | null;
  connectionChecking: boolean;
}

export function GuardianAgentDisplay({ txAgentStatus, connectionChecking }: GuardianAgentDisplayProps) {
  const getConnectionStatusIcon = () => {
    if (connectionChecking) return <Loader2 className="w-4 h-4 animate-spin text-soft-gray" />;
    
    if (!txAgentStatus) return <XCircle className="w-4 h-4 text-red-500" />;
    
    // ✅ UPDATED: Better status detection logic
    if (txAgentStatus.agent_active && txAgentStatus.container_status === 'running') {
      return <CheckCircle className="w-4 h-4 text-healing-teal" />;
    } else if (txAgentStatus.container_status === 'running' || txAgentStatus.container_status === 'starting') {
      // Container is responsive but agent not fully active yet
      return <AlertCircle className="w-4 h-4 text-guardian-gold" />;
    } else {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    if (connectionChecking) return 'Checking...';
    
    if (!txAgentStatus) return 'Offline';
    
    // ✅ UPDATED: Better status text logic
    if (txAgentStatus.agent_active && txAgentStatus.container_status === 'running') {
      return 'Ready to Help';
    } else if (txAgentStatus.container_status === 'running' || txAgentStatus.container_status === 'starting') {
      // Container is responsive but agent not fully active yet
      return 'Initializing...';
    } else {
      return 'Offline';
    }
  };

  const getStatusColor = () => {
    if (connectionChecking) return 'bg-soft-gray/10 text-soft-gray';
    
    if (!txAgentStatus) return 'bg-red-100 text-red-600';
    
    // ✅ UPDATED: Better status color logic
    if (txAgentStatus.agent_active && txAgentStatus.container_status === 'running') {
      return 'bg-healing-teal/10 text-healing-teal';
    } else if (txAgentStatus.container_status === 'running' || txAgentStatus.container_status === 'starting') {
      // Container is responsive but agent not fully active yet
      return 'bg-guardian-gold/10 text-guardian-gold';
    } else {
      return 'bg-red-100 text-red-600';
    }
  };

  return (
    <div className="w-full lg:w-80 xl:w-96 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-healing-teal/5 to-guardian-gold/5 lg:rounded-r-2xl lg:border-l border-soft-gray/20 lg:order-2">
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
              : (txAgentStatus?.container_status === 'running' || txAgentStatus?.container_status === 'starting')
              ? 'bg-guardian-gold animate-pulse'
              : 'bg-red-500'
          }`}>
            {txAgentStatus?.agent_active && txAgentStatus.container_status === 'running' ? (
              <CheckCircle className="w-3 h-3 text-cloud-ivory" />
            ) : (txAgentStatus?.container_status === 'running' || txAgentStatus?.container_status === 'starting') ? (
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
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-subheading font-medium ${getStatusColor()}`}>
            {getConnectionStatusIcon()}
            <span className="ml-2">
              {getStatusText()}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}