import express from 'express';
import { AgentService } from '../core/agentService.js';
import { errorLogger } from '../shared/logger.js';
import { verifyToken } from '../../middleware/auth.js';

export function createAgentRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to createAgentRouter');
  }

  const router = express.Router();
  
  // Apply authentication middleware
  router.use(verifyToken);
  
  // Initialize AgentService with injected Supabase client
  const agentService = new AgentService(supabaseClient);

  // Validate AgentService initialization
  if (!agentService || typeof agentService.getActiveAgent !== 'function') {
    throw new Error('AgentService initialization failed - missing required methods');
  }

  // GET /api/agent/status - Get current agent status
  router.get('/status', async (req, res) => {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent status requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      const activeAgent = await agentService.getActiveAgent(userId);
      
      if (!activeAgent) {
        return res.json({
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped',
          container_health: null,
          session_data: null
        });
      }

      // Test container connectivity if agent is active
      let containerStatus = 'unknown';
      let containerHealth = null;
      
      if (activeAgent.status === 'active') {
        try {
          const healthCheck = await agentService.testContainerHealth(activeAgent);
          containerStatus = healthCheck.status;
          containerHealth = healthCheck.health;
        } catch (healthError) {
          errorLogger.warn('Container health check failed', {
            user_id: userId,
            agent_id: activeAgent.id,
            error: healthError.message,
            component: 'AgentRoutes'
          });
          containerStatus = 'unreachable';
        }
      }

      const response = {
        agent_active: activeAgent.status === 'active',
        agent_id: activeAgent.id,
        last_active: activeAgent.last_active,
        container_status: containerStatus,
        container_health: containerHealth,
        session_data: activeAgent.session_data || null
      };

      errorLogger.success('Agent status retrieved', {
        user_id: userId,
        agent_active: response.agent_active,
        container_status: containerStatus,
        component: 'AgentRoutes'
      });

      res.json(response);

    } catch (error) {
      errorLogger.error('Failed to get agent status', {
        user_id: req.userId,
        error_message: error.message,
        error_stack: error.stack,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({
        error: 'Failed to get agent status',
        details: error.message
      });
    }
  });

  // POST /api/agent/start - Start/activate agent session
  router.post('/start', async (req, res) => {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent start requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      const result = await agentService.startAgent(userId);
      
      errorLogger.success('Agent started successfully', {
        user_id: userId,
        agent_id: result.agent_id,
        container_id: result.container_id,
        component: 'AgentRoutes'
      });

      res.json({
        status: 'activated',
        agent_id: result.agent_id,
        container_id: result.container_id,
        message: 'TxAgent session activated successfully'
      });

    } catch (error) {
      errorLogger.error('Failed to start agent', {
        user_id: req.userId,
        error_message: error.message,
        error_stack: error.stack,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({
        error: 'Failed to start agent',
        details: error.message
      });
    }
  });

  // POST /api/agent/stop - Stop/deactivate agent session
  router.post('/stop', async (req, res) => {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent stop requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      await agentService.stopAgent(userId);
      
      errorLogger.success('Agent stopped successfully', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      res.json({
        status: 'deactivated',
        message: 'TxAgent session deactivated successfully'
      });

    } catch (error) {
      errorLogger.error('Failed to stop agent', {
        user_id: req.userId,
        error_message: error.message,
        error_stack: error.stack,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({
        error: 'Failed to stop agent',
        details: error.message
      });
    }
  });

  return router;
}

export function createAgentLegacyRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to createAgentLegacyRouter');
  }

  const router = express.Router();
  
  // Apply authentication middleware
  router.use(verifyToken);
  
  // Initialize AgentService with injected Supabase client
  const agentService = new AgentService(supabaseClient);

  // Legacy deprecation middleware
  router.use((req, res, next) => {
    errorLogger.warn('Legacy agent endpoint accessed', {
      path: req.path,
      method: req.method,
      user_id: req.userId,
      user_agent: req.get('User-Agent'),
      component: 'AgentLegacyRoutes'
    });
    
    res.setHeader('X-Deprecated', 'true');
    res.setHeader('X-Deprecation-Message', 'This endpoint is deprecated. Use /api/agent/* instead.');
    next();
  });

  // Legacy routes (same logic as new routes but with deprecation warnings)
  router.get('/status', async (req, res) => {
    try {
      const userId = req.userId;
      const activeAgent = await agentService.getActiveAgent(userId);
      
      if (!activeAgent) {
        return res.json({
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped'
        });
      }

      res.json({
        agent_active: activeAgent.status === 'active',
        agent_id: activeAgent.id,
        last_active: activeAgent.last_active,
        container_status: activeAgent.status === 'active' ? 'running' : 'stopped'
      });

    } catch (error) {
      errorLogger.error('Legacy agent status failed', {
        user_id: req.userId,
        error_message: error.message,
        component: 'AgentLegacyRoutes'
      });
      
      res.status(500).json({
        error: 'Failed to get agent status',
        details: error.message
      });
    }
  });

  return router;
}

// Legacy exports for backward compatibility
export const router = createAgentRouter;
export const legacyRouter = createAgentLegacyRouter;