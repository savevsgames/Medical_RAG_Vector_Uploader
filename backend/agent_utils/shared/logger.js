// Simplified, centralized logging for agent operations
class AgentLogger {
  constructor() {
    this.debugMode = process.env.BACKEND_DEBUG_LOGGING === 'true';
  }

  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(context)}`;
  }

  log(level, message, context = {}) {
    const formatted = this.formatMessage(level, message, context);
    console[level === 'error' ? 'error' : 'log'](formatted);
  }

  info(message, context = {}) {
    this.log('info', message, context);
  }

  warn(message, context = {}) {
    this.log('warn', message, context);
  }

  error(message, error = null, context = {}) {
    const errorContext = {
      ...context,
      ...(error && {
        error_message: error.message,
        error_stack: error.stack,
        error_code: error.code
      })
    };
    this.log('error', message, errorContext);
  }

  debug(message, context = {}) {
    if (this.debugMode) {
      this.log('debug', message, context);
    }
  }

  success(message, context = {}) {
    this.log('info', `SUCCESS: ${message}`, context);
  }

  // Agent-specific methods
  agentStart(userId, agentId, context = {}) {
    this.success(`Agent started for user ${userId}`, { user_id: userId, agent_id: agentId, ...context });
  }

  agentStop(userId, context = {}) {
    this.info(`Agent stopped for user ${userId}`, { user_id: userId, ...context });
  }

  agentError(userId, operation, error, context = {}) {
    this.error(`Agent ${operation} failed for user ${userId}`, error, { user_id: userId, operation, ...context });
  }

  connectionCheck(service, status, details = {}) {
    const level = status ? 'success' : 'warn';
    this[level](`${service} connection ${status ? 'verified' : 'failed'}`, details);
  }
}

export const errorLogger = new AgentLogger();