import { config } from '../../config/environment.js';

// ✅ JWT OPTIMIZATION: Reduce logging verbosity for frequent operations
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  SUCCESS: 3,
  DEBUG: 4
};

const currentLogLevel = config.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

// ✅ JWT OPTIMIZATION: Track frequent operations to avoid spam
const operationCounts = new Map();
const FREQUENT_OPERATION_THRESHOLD = 10; // Log every 10th occurrence after threshold

function shouldLogFrequentOperation(operation) {
  const count = operationCounts.get(operation) || 0;
  operationCounts.set(operation, count + 1);
  
  // Always log first few occurrences, then every 10th
  return count < 5 || count % FREQUENT_OPERATION_THRESHOLD === 0;
}

function formatLogMessage(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0 ? JSON.stringify(context, null, 2) : '';
  
  return `[${timestamp}] ${level}: ${message}${contextStr ? '\n' + contextStr : ''}`;
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= currentLogLevel;
}

export const errorLogger = {
  error: (message, error = null, context = {}) => {
    if (!shouldLog('ERROR')) return;
    
    const errorContext = {
      ...context,
      error_message: error?.message,
      error_stack: config.isDevelopment ? error?.stack : undefined,
      timestamp: new Date().toISOString()
    };
    
    console.error(formatLogMessage('ERROR', message, errorContext));
  },

  warn: (message, context = {}) => {
    if (!shouldLog('WARN')) return;
    
    console.warn(formatLogMessage('WARN', message, {
      ...context,
      timestamp: new Date().toISOString()
    }));
  },

  info: (message, context = {}) => {
    if (!shouldLog('INFO')) return;
    
    // ✅ JWT OPTIMIZATION: Reduce logging for frequent operations
    const operation = context.component + '_' + (context.operation || 'info');
    if (!shouldLogFrequentOperation(operation)) {
      return;
    }
    
    console.log(formatLogMessage('INFO', message, {
      ...context,
      timestamp: new Date().toISOString()
    }));
  },

  success: (message, context = {}) => {
    if (!shouldLog('SUCCESS')) return;
    
    console.log(formatLogMessage('SUCCESS', `✅ ${message}`, {
      ...context,
      timestamp: new Date().toISOString()
    }));
  },

  debug: (message, context = {}) => {
    if (!shouldLog('DEBUG')) return;
    
    // ✅ JWT OPTIMIZATION: Only log debug in development
    if (!config.isDevelopment) return;
    
    console.debug(formatLogMessage('DEBUG', message, {
      ...context,
      timestamp: new Date().toISOString()
    }));
  },

  // ✅ JWT OPTIMIZATION: Special method for connection checks with reduced verbosity
  connectionCheck: (service, status, details = null) => {
    if (!shouldLog('INFO')) return;
    
    const operation = `connection_check_${service}`;
    if (!shouldLogFrequentOperation(operation)) {
      return;
    }
    
    const statusIcon = status ? '✅' : '❌';
    const message = `${statusIcon} ${service} connection: ${status ? 'OK' : 'FAILED'}`;
    
    console.log(formatLogMessage('INFO', message, {
      service,
      status,
      details: config.isDevelopment ? details : undefined,
      timestamp: new Date().toISOString()
    }));
  },

  // ✅ JWT OPTIMIZATION: Get logging statistics
  getStats: () => {
    return {
      currentLogLevel: Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLogLevel),
      operationCounts: Object.fromEntries(operationCounts),
      isDevelopment: config.isDevelopment
    };
  },

  // ✅ JWT OPTIMIZATION: Reset operation counts (useful for testing)
  resetStats: () => {
    operationCounts.clear();
  }
};

// ✅ JWT OPTIMIZATION: Clean up operation counts periodically
setInterval(() => {
  if (operationCounts.size > 100) {
    // Keep only the most recent 50 operations
    const entries = Array.from(operationCounts.entries());
    operationCounts.clear();
    entries.slice(-50).forEach(([key, value]) => {
      operationCounts.set(key, value);
    });
  }
}, 5 * 60 * 1000); // Every 5 minutes