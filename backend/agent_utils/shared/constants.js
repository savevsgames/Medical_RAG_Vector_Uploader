// Shared constants for agent operations
export const AGENT_STATUS = {
  INITIALIZING: 'initializing',
  ACTIVE: 'active',
  IDLE: 'idle',
  TERMINATED: 'terminated'
};

export const CONTAINER_STATUS = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  STARTING: 'starting',
  UNREACHABLE: 'unreachable'
};

export const API_ENDPOINTS = {
  AGENT_STATUS: '/api/agent/status',
  AGENT_START: '/api/agent/start',
  AGENT_STOP: '/api/agent/stop',
  AGENT_STATS: '/api/agent/stats',
  CHAT: '/api/chat',
  EMBED: '/api/embed',
  HEALTH: '/health'
};

export const LEGACY_ENDPOINTS = {
  AGENT_STATUS: '/agent/status',
  AGENT_START: '/agent/start',
  AGENT_STOP: '/agent/stop',
  CHAT: '/chat'
};

export const HTTP_STATUS = {
  OK: 200,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  TIMEOUT: 504,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500
};

export const TIMEOUTS = {
  DEFAULT: 30000,
  CHAT: 60000,
  HEALTH_CHECK: 10000,
  CONNECTION_TEST: 5000
};

export const RATE_LIMITS = {
  AGENT_REQUESTS_PER_MINUTE: 20,
  WINDOW_MS: 60000
};