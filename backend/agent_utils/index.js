// Main export module - cleaned up, no legacy routes
import { createAgentRouter } from './routes/agentRoutes.js';
import { router as containerRouter } from './routes/containerRoutes.js';
import { errorLogger } from './shared/logger.js';

export function mountAgentRoutes(app, supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to mountAgentRoutes');
  }

  errorLogger.info('Mounting agent routes...');
  
  // Create routers with Supabase client dependency injection
  const agentRouter = createAgentRouter(supabaseClient);
  
  // Mount new API routes ONLY - no legacy routes
  app.use('/api/agent', agentRouter);
  app.use('/api', containerRouter);
  
  errorLogger.info('Agent routes mounted successfully (legacy routes removed)');
}

// Export services for direct use if needed
export { AgentService } from './core/agentService.js';
export { ContainerService } from './core/containerService.js';
export { errorLogger } from './shared/logger.js';