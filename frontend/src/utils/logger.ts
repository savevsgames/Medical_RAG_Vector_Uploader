interface LogContext {
  user?: string | null;
  userId?: string | null;
  action?: string;
  component?: string;
  supabaseUrl?: string;
  apiUrl?: string;
  [key: string]: any;
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private debugMode = import.meta.env.VITE_DEBUG_LOGGING === 'true';

  private formatMessage(level: LogLevel, message: string, context: LogContext = {}) {
    const timestamp = new Date().toISOString();
    const prefix = `[FRONTEND][${level.toUpperCase()}][${timestamp}]`;
    
    return {
      prefix,
      message,
      context: {
        ...context,
        environment: this.isDevelopment ? 'development' : 'production',
        url: window.location.href,
        userAgent: navigator.userAgent.substring(0, 100)
      }
    };
  }

  private log(level: LogLevel, message: string, context: LogContext = {}) {
    if (!this.isDevelopment && !this.debugMode) return;

    const formatted = this.formatMessage(level, message, context);
    
    console.group(`${formatted.prefix} ${formatted.message}`);
    
    if (Object.keys(formatted.context).length > 0) {
      console.table(formatted.context);
    }
    
    console.groupEnd();
  }

  info(message: string, context: LogContext = {}) {
    this.log('info', message, context);
  }

  warn(message: string, context: LogContext = {}) {
    this.log('warn', message, context);
  }

  error(message: string, context: LogContext = {}) {
    this.log('error', message, context);
  }

  debug(message: string, context: LogContext = {}) {
    if (this.debugMode) {
      this.log('debug', message, context);
    }
  }

  // Specialized logging methods for common scenarios
  userAction(action: string, user: string | null, additionalContext: LogContext = {}) {
    this.info(`User Action: ${action}`, {
      user,
      action,
      component: 'UserAction',
      ...additionalContext
    });
  }

  supabaseOperation(operation: string, user: string | null, result: 'success' | 'error', details: any = {}) {
    const level = result === 'success' ? 'info' : 'error';
    this.log(level, `Supabase ${operation} ${result}`, {
      user,
      operation,
      result,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      ...details
    });
  }

  apiCall(endpoint: string, method: string, user: string | null, status: 'initiated' | 'success' | 'error', details: any = {}) {
    const level = status === 'error' ? 'error' : 'info';
    this.log(level, `API ${method} ${endpoint} ${status}`, {
      user,
      endpoint,
      method,
      status,
      apiUrl: import.meta.env.VITE_API_URL,
      ...details
    });
  }

  fileOperation(operation: string, fileName: string, user: string | null, details: any = {}) {
    this.info(`File ${operation}: ${fileName}`, {
      user,
      operation,
      fileName,
      component: 'FileOperation',
      ...details
    });
  }

  agentOperation(operation: string, user: string | null, details: any = {}) {
    this.info(`Agent ${operation}`, {
      user,
      operation,
      component: 'Agent',
      ...details
    });
  }
}

export const logger = new Logger();

// Convenience exports
export const logInfo = logger.info.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logError = logger.error.bind(logger);
export const logDebug = logger.debug.bind(logger);
export const logUserAction = logger.userAction.bind(logger);
export const logSupabaseOperation = logger.supabaseOperation.bind(logger);
export const logApiCall = logger.apiCall.bind(logger);
export const logFileOperation = logger.fileOperation.bind(logger);
export const logAgentOperation = logger.agentOperation.bind(logger);