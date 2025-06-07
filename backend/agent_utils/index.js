// Agent Utils - Main Export Module
// Provides clean imports for all agent-related functionality

import { agentController } from './agentController.js';
import { runpodService } from './runpodService.js';
import { agentMiddleware } from './agentMiddleware.js';
import { errorLogger } from './errorLogger.js';

export {
  agentController,
  runpodService,
  agentMiddleware,
  errorLogger
};

// Convenience function to mount all agent routes
export function mountAgentRoutes(app) {
  errorLogger.info('Mounting agent routes...');
  
  // Mount new API routes
  app.use('/api/agent', agentController.router);
  app.use('/api', runpodService.router);
  
  // Mount legacy routes with deprecation warnings
  app.use('/agent', agentController.legacyRouter);
  app.use('/chat', agentController.legacyChatRouter);
  
  errorLogger.info('Agent routes mounted successfully');
}