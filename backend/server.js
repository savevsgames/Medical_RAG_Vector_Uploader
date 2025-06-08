import express from 'express';
import { config, validateConfig } from './config/environment.js';
import { database } from './config/database.js';
import { corsMiddleware, optionsHandler } from './middleware/cors.js';
import { requestLogger } from './middleware/logging.js';
import { setupRoutes } from './routes/index.js';
import { staticFileService } from './services/StaticFileService.js';
import { errorLogger } from './agent_utils/shared/logger.js';

async function startServer() {
  const app = express();

  // Enhanced startup logging
  errorLogger.info('🚀 Medical RAG Server starting up...');
  errorLogger.info('Environment check', {
    node_version: process.version,
    port: config.port,
    environment: config.nodeEnv
  });

  // Validate configuration first
  try {
    validateConfig();
    errorLogger.success('Configuration validation passed');
  } catch (error) {
    errorLogger.error('Configuration validation failed', error);
    process.exit(1);
  }

  // Initialize database connection
  try {
    database.initialize();
    errorLogger.success('Database client initialized');
  } catch (error) {
    errorLogger.error('Failed to initialize database client', error);
    process.exit(1);
  }

  // Test database connection
  try {
    const healthCheck = await database.healthCheck();
    if (healthCheck.healthy) {
      errorLogger.success('Database connection test passed');
    } else {
      errorLogger.error('Database connection test failed', new Error(healthCheck.message));
      // Don't exit - let the server start but log the issue
    }
  } catch (error) {
    errorLogger.error('Database connection test failed', error);
    // Don't exit - let the server start but log the issue
  }

  // Middleware setup
  app.use(corsMiddleware);
  app.options('*', optionsHandler);
  app.use(express.json());
  app.use(requestLogger);

  // Setup static file serving
  staticFileService.setupStaticFiles(app);

  // Setup all routes
  setupRoutes(app);

  // Setup SPA fallback (must be last)
  staticFileService.setupSPAFallback(app);

  // Error handling middleware
  app.use((error, req, res, next) => {
    errorLogger.error('Unhandled server error', error, {
      user_id: req.userId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      user_agent: req.get('User-Agent')?.substring(0, 100),
      error_stack: error.stack
    });
    
    res.status(500).json({
      error: 'Internal server error',
      details: config.isDevelopment ? error.message : 'Server error occurred'
    });
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    errorLogger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    errorLogger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    errorLogger.error('Uncaught exception', error, {
      error_stack: error.stack
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    errorLogger.error('Unhandled rejection', reason, { 
      promise: promise.toString(),
      reason_stack: reason?.stack
    });
    process.exit(1);
  });

  // Start server
  app.listen(config.port, () => {
    errorLogger.success('🚀 Medical RAG Server running', {
      port: config.port,
      health_check: `http://localhost:${config.port}/health`,
      environment: config.nodeEnv
    });
    
    errorLogger.info('🔧 Services configured:');
    errorLogger.connectionCheck('Database', database.isInitialized());
    
    errorLogger.info('📚 Available endpoints:');
    errorLogger.info('  - GET  /health (Health check)');
    errorLogger.info('  - POST /upload (Document upload)');
    errorLogger.info('  - POST /api/chat (Chat with TxAgent)');
    errorLogger.info('  - POST /api/openai-chat (Chat with OpenAI RAG)');
    errorLogger.info('  - POST /chat (Legacy chat - deprecated)');
    errorLogger.info('  - POST /api/agent/start (Start TxAgent)');
    errorLogger.info('  - POST /api/agent/stop (Stop TxAgent)');
    errorLogger.info('  - GET  /api/agent/status (Agent status)');
    errorLogger.info('  - POST /api/embed (RunPod embedding)');
    errorLogger.info('  - POST /agent/* (Legacy endpoints - deprecated)');
    errorLogger.info('  - GET  /* (SPA fallback to index.html)');
  });
}

// Start the server
startServer().catch((error) => {
  errorLogger.error('Failed to start server', error);
  process.exit(1);
});