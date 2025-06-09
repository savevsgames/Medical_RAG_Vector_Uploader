// Main export module - simplified
import { createAgentRouter, createAgentLegacyRouter } from './routes/agentRoutes.js';
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
  const agentLegacyRouter = createAgentLegacyRouter(supabaseClient);
  
  // Mount new API routes
  app.use('/api/agent', agentRouter);
  app.use('/api', containerRouter);
  
  // Mount legacy routes with deprecation warnings
  app.use('/agent', agentLegacyRouter);
  
  errorLogger.info('Agent routes mounted successfully');
}

// Export services for direct use if needed
export { AgentService } from './core/agentService.js';
export { ContainerService } from './core/containerService.js';
export { errorLogger } from './shared/logger.js';