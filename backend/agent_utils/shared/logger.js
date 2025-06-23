// Enhanced logging utility with proper initialization
import util from 'util';

class Logger {
  constructor() {
    this.initialized = false;
    this.level = 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      success: 2, // Same as info
      debug: 3
    };
  }

  // ✅ NEW: Initialize logger with config
  initialize(config = {}) {
    this.level = config.logLevel || process.env.LOG_LEVEL || 'info';
    this.initialized = true;
    
    // Log initialization success
    this.info('Logger initialized successfully', {
      level: this.level,
      timestamp: new Date().toISOString(),
      component: 'Logger'
    });
  }

  // ✅ NEW: Check if logger is initialized
  isInitialized() {
    return this.initialized;
  }

  // ✅ NEW: Get current log level
  getCurrentLevel() {
    return this.level;
  }

  shouldLog(level) {
    if (!this.initialized) {
      // Allow error and warn logs even if not initialized
      return level === 'error' || level === 'warn';
    }
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    
    // Base log entry
    const logEntry = {
      timestamp,
      level: levelUpper,
      message,
      ...context
    };

    // Format for console output
    let consoleMessage = `[${timestamp}] [${levelUpper}] ${message}`;
    
    if (Object.keys(context).length > 0) {
      consoleMessage += ` | ${JSON.stringify(context)}`;
    }

    return { logEntry, consoleMessage };
  }

  error(message, error = null, context = {}) {
    if (!this.shouldLog('error')) return;

    const errorContext = {
      ...context,
      component: context.component || 'Unknown'
    };

    if (error) {
      errorContext.error_message = error.message;
      errorContext.error_stack = error.stack;
      errorContext.error_name = error.name;
    }

    const { consoleMessage } = this.formatMessage('error', message, errorContext);
    console.error(consoleMessage);
  }

  warn(message, context = {}) {
    if (!this.shouldLog('warn')) return;

    const { consoleMessage } = this.formatMessage('warn', message, {
      ...context,
      component: context.component || 'Unknown'
    });
    console.warn(consoleMessage);
  }

  info(message, context = {}) {
    if (!this.shouldLog('info')) return;

    const { consoleMessage } = this.formatMessage('info', message, {
      ...context,
      component: context.component || 'Unknown'
    });
    console.log(consoleMessage);
  }

  success(message, context = {}) {
    if (!this.shouldLog('success')) return;

    const { consoleMessage } = this.formatMessage('success', message, {
      ...context,
      component: context.component || 'Unknown'
    });
    console.log(`✅ ${consoleMessage}`);
  }

  debug(message, context = {}) {
    if (!this.shouldLog('debug')) return;

    const { consoleMessage } = this.formatMessage('debug', message, {
      ...context,
      component: context.component || 'Unknown'
    });
    console.log(`🔍 ${consoleMessage}`);
  }

  // Specialized logging methods
  connectionCheck(service, success, details = {}) {
    const status = success ? '✅' : '❌';
    const level = success ? 'success' : 'warn';
    
    this[level](`${status} ${service} Connection Check`, {
      service,
      success,
      ...details,
      component: 'ConnectionCheck'
    });
  }

  apiCall(endpoint, method, status, details = {}) {
    const level = status >= 200 && status < 300 ? 'info' : 'warn';
    
    this[level](`API Call: ${method} ${endpoint}`, {
      endpoint,
      method,
      status,
      ...details,
      component: 'APICall'
    });
  }

  agentOperation(operation, success, details = {}) {
    const level = success ? 'success' : 'error';
    const status = success ? '✅' : '❌';
    
    this[level](`${status} Agent Operation: ${operation}`, {
      operation,
      success,
      ...details,
      component: 'AgentOperation'
    });
  }

  supabaseOperation(operation, success, details = {}) {
    const level = success ? 'info' : 'error';
    const status = success ? '✅' : '❌';
    
    this[level](`${status} Supabase Operation: ${operation}`, {
      operation,
      success,
      ...details,
      component: 'SupabaseOperation'
    });
  }

  fileOperation(operation, filename, success, details = {}) {
    const level = success ? 'info' : 'error';
    const status = success ? '✅' : '❌';
    
    this[level](`${status} File Operation: ${operation} - ${filename}`, {
      operation,
      filename,
      success,
      ...details,
      component: 'FileOperation'
    });
  }

  userAction(action, userEmail, details = {}) {
    this.info(`User Action: ${action}`, {
      action,
      user: userEmail,
      ...details,
      component: 'UserAction'
    });
  }
}

// Create singleton instance
const logger = new Logger();

// ✅ NEW: Export initialization function
export function initializeLogger(config = {}) {
  logger.initialize(config);
  return logger;
}

// Export the logger instance
export const errorLogger = logger;

// Legacy exports for backward compatibility
export function logUserAction(action, userEmail, details = {}) {
  logger.userAction(action, userEmail, details);
}

export function logApiCall(endpoint, method, userEmail, status, details = {}) {
  logger.apiCall(endpoint, method, status, { user: userEmail, ...details });
}

export function logAgentOperation(operation, userEmail, details = {}) {
  logger.agentOperation(operation, true, { user: userEmail, ...details });
}

export function logSupabaseOperation(operation, userEmail, status, details = {}) {
  logger.supabaseOperation(operation, status === 'success', { user: userEmail, ...details });
}

export function logFileOperation(operation, filename, userEmail, details = {}) {
  logger.fileOperation(operation, filename, true, { user: userEmail, ...details });
}

// Default export
export default logger;