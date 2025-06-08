// Main export module - simplified
import { agentRoutes } from './routes/agentRoutes.js';
import { containerRoutes } from './routes/containerRoutes.js';
import { errorLogger } from './shared/logger.js';

export function mountAgentRoutes(app) {
  errorLogger.info('Mounting agent routes...');
  
  // Mount new API routes
  app.use('/api/agent', agentRoutes.router);
  app.use('/api', containerRoutes.router);
  
  // Mount legacy routes with deprecation warnings
  app.use('/agent', agentRoutes.legacyRouter);
  
  errorLogger.info('Agent routes mounted successfully');
}

// Export services for direct use if needed
export { AgentService } from './core/agentService.js';
export { ContainerService } from './core/containerService.js';
export { errorLogger } from './shared/logger.js';