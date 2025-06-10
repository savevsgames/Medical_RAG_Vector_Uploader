import express from 'express';
import { AgentService } from '../core/agentService.js';
import { ContainerService } from '../core/containerService.js';
import { verifyToken } from '../../middleware/auth.js';
import { errorLogger } from '../shared/logger.js';

export function createAgentRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to createAgentRouter');
  }

  const router = express.Router();

  // Apply authentication to all agent routes
  router.use(verifyToken);

  // Initialize services with injected Supabase client
  const agentService = new AgentService(supabaseClient);
  const containerService = new ContainerService();

  // CRITICAL: Agent Status Endpoint - Check both DB and Container
  router.get('/status', async (req, res) => {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent status check requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      // Get agent from database
      const activeAgent = await agentService.getActiveAgent(userId);
      
      let agentStatus = {
        agent_active: false,
        agent_id: null,
        last_active: null,
        container_status: 'stopped',
        container_health: null,
        session_data: null
      };

      if (activeAgent && activeAgent.length > 0) {
        const agent = activeAgent[0];
        agentStatus.agent_active = true;
        agentStatus.agent_id = agent.id;
        agentStatus.last_active = agent.last_active;
        agentStatus.session_data = agent.session_data;

        // Check container health if agent is active
        try {
          const containerHealth = await containerService.checkHealth();
          agentStatus.container_status = containerHealth.status === 'healthy' ? 'running' : 'unhealthy';
          agentStatus.container_health = containerHealth;
          
          errorLogger.info('Container health check completed', {
            user_id: userId,
            agent_id: agent.id,
            container_status: agentStatus.container_status,
            component: 'AgentRoutes'
          });
        } catch (containerError) {
          errorLogger.warn('Container health check failed', {
            user_id: userId,
            agent_id: agent.id,
            error: containerError.message,
            component: 'AgentRoutes'
          });
          agentStatus.container_status = 'unreachable';
        }
      }

      errorLogger.success('Agent status retrieved', {
        user_id: userId,
        agent_active: agentStatus.agent_active,
        container_status: agentStatus.container_status,
        component: 'AgentRoutes'
      });

      res.json(agentStatus);

    } catch (error) {
      errorLogger.error('Agent status check failed', error, {
        user_id: req.userId,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({ 
        error: 'Failed to check agent status',
        details: error.message
      });
    }
  });

  // CRITICAL: Start Agent Session - Fixed Method Name
  router.post('/start', async (req, res) => {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent start requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      // Check if container is healthy first
      let containerHealth = null;
      try {
        containerHealth = await containerService.checkHealth();
        if (containerHealth.status !== 'healthy') {
          throw new Error(`Container is not healthy: ${containerHealth.message || 'Unknown error'}`);
        }
      } catch (containerError) {
        errorLogger.error('Container health check failed during start', containerError, {
          user_id: userId,
          component: 'AgentRoutes'
        });
        
        return res.status(503).json({
          error: 'Container is not available',
          details: containerError.message,
          container_status: 'unreachable'
        });
      }

      // Create session data with container info
      const sessionData = {
        started_at: new Date().toISOString(),
        runpod_endpoint: process.env.RUNPOD_EMBEDDING_URL,
        container_health: containerHealth,
        capabilities: ['chat', 'embedding', 'health_check']
      };

      // FIXED: Use correct method name - createAgentSession
      const result = await agentService.createAgentSession(userId, 'active', sessionData);
      
      if (!result || result.length === 0) {
        throw new Error('Failed to create agent session');
      }

      const agent = result[0];

      errorLogger.success('Agent session created successfully', {
        user_id: userId,
        agent_id: agent.id,
        container_status: 'running',
        component: 'AgentRoutes'
      });

      res.json({
        status: 'activated',
        agent_id: agent.id,
        container_id: containerHealth.container_id || 'unknown',
        session_data: agent.session_data,
        message: 'TxAgent session activated successfully'
      });

    } catch (error) {
      errorLogger.error('Agent start failed', error, {
        user_id: req.userId,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({ 
        error: 'Failed to start agent session',
        details: error.message
      });
    }
  });

  // CRITICAL: Stop Agent Session - Fixed Method Name
  router.post('/stop', async (req, res) => {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent stop requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      // FIXED: Use correct method name - terminateAgentSession
      const result = await agentService.terminateAgentSession(userId);

      if (!result) {
        errorLogger.warn('No active agent session found to terminate', {
          user_id: userId,
          component: 'AgentRoutes'
        });
      }

      errorLogger.success('Agent session terminated successfully', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      res.json({
        status: 'deactivated',
        message: 'TxAgent session deactivated successfully'
      });

    } catch (error) {
      errorLogger.error('Agent stop failed', error, {
        user_id: req.userId,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({ 
        error: 'Failed to stop agent session',
        details: error.message
      });
    }
  });

  // Health Check Endpoint
  router.post('/health-check', async (req, res) => {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent health check requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      const containerHealth = await containerService.checkHealth();

      errorLogger.success('Agent health check completed', {
        user_id: userId,
        container_status: containerHealth.status,
        component: 'AgentRoutes'
      });

      res.json({
        container_health: containerHealth,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      errorLogger.error('Agent health check failed', error, {
        user_id: req.userId,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({ 
        error: 'Health check failed',
        details: error.message
      });
    }
  });

  return router;
}

// Legacy router for backward compatibility
export function createAgentLegacyRouter(supabaseClient) {
  const router = express.Router();
  
  // Add deprecation warning middleware
  router.use((req, res, next) => {
    errorLogger.warn('Legacy agent route accessed', {
      path: req.path,
      method: req.method,
      component: 'AgentLegacyRoutes'
    });
    next();
  });

  // Mount the same routes but with deprecation warnings
  const mainRouter = createAgentRouter(supabaseClient);
  router.use('/', mainRouter);

  return router;
}