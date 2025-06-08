import { useState, useCallback } from 'react';

interface ContainerLog {
  timestamp: string;
  level: string;
  message: string;
  component?: string;
  user_id?: string;
}

export function useAgentStatus() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [containerLogs, setContainerLogs] = useState<ContainerLog[]>([]);

  const addLog = useCallback((log: ContainerLog) => {
    setContainerLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
  }, []);

  const addLogs = useCallback((logs: ContainerLog[]) => {
    setContainerLogs(prev => [...logs, ...prev].slice(0, 100));
  }, []);

  const clearLogs = useCallback(() => {
    setContainerLogs([]);
  }, []);

  const updateLastRefresh = useCallback(() => {
    setLastRefresh(new Date());
  }, []);

  return {
    autoRefresh,
    setAutoRefresh,
    lastRefresh,
    containerLogs,
    addLog,
    addLogs,
    clearLogs,
    updateLastRefresh
  };
}