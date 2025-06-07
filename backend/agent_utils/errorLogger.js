// Centralized Error Logger
// Provides detailed logging for troubleshooting without bloating server.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ErrorLogger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.ensureLogDirectory();
    // Add debug mode configuration based on environment variable
    this.debugMode = process.env.BACKEND_DEBUG_LOGGING === 'true';
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(context).length > 0 ? JSON.stringify(context, null, 2) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${contextStr}`;
  }

  writeToFile(level, message, context = {}) {
    try {
      const logFile = path.join(this.logDir, `${level}.log`);
      const formattedMessage = this.formatMessage(level, message, context) + '\n';
      fs.appendFileSync(logFile, formattedMessage);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message, context = {}) {
    const formatted = this.formatMessage('info', message, context);
    console.log(`ℹ️  ${formatted}`);
    this.writeToFile('info', message, context);
  }

  warn(message, context = {}) {
    const formatted = this.formatMessage('warn', message, context);
    console.warn(`⚠️  ${formatted}`);
    this.writeToFile('warn', message, context);
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
    
    const formatted = this.formatMessage('error', message, errorContext);
    console.error(`❌ ${formatted}`);
    this.writeToFile('error', message, errorContext);
  }

  success(message, context = {}) {
    const formatted = this.formatMessage('success', message, context);
    console.log(`✅ ${formatted}`);
    this.writeToFile('info', `SUCCESS: ${message}`, context);
  }

  // Add debug method that respects debugMode setting
  debug(message, context = {}) {
    if (this.debugMode) {
      const formatted = this.formatMessage('debug', message, context);
      console.debug(`🔍 ${formatted}`);
      this.writeToFile('debug', message, context);
    }
  }

  // Agent-specific logging methods
  agentStart(userId, agentId, context = {}) {
    this.success(`Agent started for user ${userId}`, {
      user_id: userId,
      agent_id: agentId,
      ...context
    });
  }

  agentStop(userId, context = {}) {
    this.info(`Agent stopped for user ${userId}`, {
      user_id: userId,
      ...context
    });
  }

  agentError(userId, operation, error, context = {}) {
    this.error(`Agent ${operation} failed for user ${userId}`, error, {
      user_id: userId,
      operation,
      ...context
    });
  }

  runpodRequest(endpoint, userId, context = {}) {
    this.info(`RunPod request to ${endpoint}`, {
      endpoint,
      user_id: userId,
      ...context
    });
  }

  runpodError(endpoint, error, context = {}) {
    this.error(`RunPod ${endpoint} failed`, error, context);
  }

  connectionCheck(service, status, details = {}) {
    if (status) {
      this.success(`${service} connection verified`, details);
    } else {
      this.warn(`${service} connection failed`, details);
    }
  }
}

export const errorLogger = new ErrorLogger();