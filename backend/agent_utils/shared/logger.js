// Enhanced logging utility with deferred configuration initialization
// This prevents circular dependency issues with config imports

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SUCCESS: 4
};

// Default to INFO level until initialized
let currentLogLevel = LOG_LEVELS.INFO;
let isInitialized = false;

// Initialize logger with config - called from server.js after config is ready
export function initializeLogger(config) {
  if (isInitialized) {
    console.warn('Logger already initialized, skipping...');
    return;
  }

  currentLogLevel = config?.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
  isInitialized = true;
  
  console.log(`✅ Logger initialized with level: ${Object.keys(LOG_LEVELS)[currentLogLevel]} (isDevelopment: ${config?.isDevelopment})`);
}

// Get current timestamp
function getTimestamp() {
  return new Date().toISOString();
}

// Format log message with metadata
function formatLogMessage(level, message, metadata = {}) {
  const timestamp = getTimestamp();
  const baseMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    return `${baseMessage} | ${JSON.stringify(metadata)}`;
  }
  
  return baseMessage;
}

// Enhanced error logger with comprehensive logging capabilities
export const errorLogger = {
  // Debug level logging (only in development)
  debug: (message, metadata = {}) => {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatLogMessage('DEBUG', message, metadata));
    }
  },

  // Info level logging
  info: (message, metadata = {}) => {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(formatLogMessage('INFO', message, metadata));
    }
  },

  // Warning level logging
  warn: (message, metadata = {}) => {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(formatLogMessage('WARN', message, metadata));
    }
  },

  // Error level logging
  error: (message, error = null, metadata = {}) => {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      const errorMetadata = {
        ...metadata,
        ...(error && {
          error_message: error.message,
          error_stack: error.stack,
          error_name: error.name
        })
      };
      console.error(formatLogMessage('ERROR', message, errorMetadata));
    }
  },

  // Success level logging
  success: (message, metadata = {}) => {
    if (currentLogLevel <= LOG_LEVELS.SUCCESS) {
      console.log(formatLogMessage('SUCCESS', message, metadata));
    }
  },

  // Connection check logging
  connectionCheck: (service, isConnected, details = {}) => {
    const status = isConnected ? '✅ CONNECTED' : '❌ DISCONNECTED';
    const message = `${service}: ${status}`;
    
    if (isConnected) {
      errorLogger.success(message, details);
    } else {
      errorLogger.error(message, null, details);
    }
  },

  // Get current log level for debugging
  getCurrentLevel: () => {
    return Object.keys(LOG_LEVELS)[currentLogLevel];
  },

  // Check if logger is initialized
  isInitialized: () => {
    return isInitialized;
  }
};

// Default export for backward compatibility
export default errorLogger;