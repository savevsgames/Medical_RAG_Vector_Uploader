// Centralized error handling for agent operations
import { errorLogger } from './logger.js';

export class AgentError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
  }
}

export class ContainerError extends Error {
  constructor(message, status, response = null) {
    super(message);
    this.name = 'ContainerError';
    this.status = status;
    this.response = response;
  }
}

export const handleAgentError = (operation, error, userId, context = {}) => {
  errorLogger.agentError(userId, operation, error, {
    error_type: error.constructor.name,
    error_message: error.message,
    error_stack: error.stack,
    ...context
  });

  if (error instanceof ContainerError) {
    return {
      status: error.status || 500,
      error: `Container ${operation} failed`,
      details: error.message
    };
  }

  if (error instanceof AgentError) {
    return {
      status: 400,
      error: `Agent ${operation} failed`,
      details: error.message
    };
  }

  return {
    status: 500,
    error: `${operation} failed`,
    details: error.message
  };
};

export const createTimeoutError = (operation, timeout) => 
  new ContainerError(`${operation} request timeout after ${timeout}ms`, 504);

export const createAuthError = (operation) => 
  new AgentError(`Authentication required for ${operation}`, 401);

export const createNotFoundError = (resource) => 
  new AgentError(`${resource} not found`, 404);