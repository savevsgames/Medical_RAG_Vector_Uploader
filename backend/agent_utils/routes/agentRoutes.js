import express from 'express';
import { AgentService } from '../core/agentService.js';
import { ContainerService } from '../core/containerService.js';
import { errorLogger } from '../shared/logger.js';
import { verifyToken } from '../../middleware/auth.js';

// Create routers
const router = express.Router();
const legacyRouter = express.Router();

// Apply authentication to all agent routes
router.use(verifyToken);
legacyRouter.use(verifyToken);

// Initialize services
const agentService = new AgentService();
const containerService = new ContainerService();

class AgentRoutes {
  // Get agent status
  async getStatus(req, res) {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent status requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      // Get agent from database
      const agent = await agentService.getActiveAgent(userId);
      
      if (!agent) {
        errorLogger.info('No active agent found', {
          user_id: userId,
          component: 'AgentRoutes'
        });
        
        return res.json({
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped'
        });
      }

      // Check container health if agent is active
      let containerStatus = 'unknown';
      let containerHealth = null;
      
      try {
        const healthCheck = await containerService.healthCheck();
        containerStatus = 'running';
        containerHealth = healthCheck;
        
        errorLogger.success('Container health check passed', {
          user_id: userId,
          agent_id: agent.id,
          health: healthCheck,
          component: 'AgentRoutes'
        });
      } catch (healthError) {
        containerStatus = 'unreachable';
        
        errorLogger.error('Agent health_check failed for user ' + userId, healthError, {
          user_id: userId,
          operation: 'health_check',
          error_type: healthError.constructor.name,
          error_message: healthError.message,
          error_stack: healthError.stack,
          container_url: process.env.RUNPOD_EMBEDDING_URL || 'not_configured'
        });
      }

      const response = {
        agent_active: agent.status === 'active',
        agent_id: agent.id,
        last_active: agent.last_active,
        container_status: containerStatus,
        container_health: containerHealth,
        session_data: agent.session_data || {}
      };

      errorLogger.info('Agent status response', {
        user_id: userId,
        response,
        component: 'AgentRoutes'
      });

      res.json(response);

    } catch (error) {
      errorLogger.error('Failed to get agent status', error, {
        user_id: req.userId,
        error_stack: error.stack,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({
        error: 'Failed to get agent status',
        details: error.message
      });
    }
  }

  // Start agent session
  async startAgent(req, res) {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent start requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      // Check if agent already exists and is active
      const existingAgent = await agentService.getActiveAgent(userId);
      
      if (existingAgent && existingAgent.status === 'active') {
        errorLogger.info('Agent already active', {
          user_id: userId,
          agent_id: existingAgent.id,
          component: 'AgentRoutes'
        });
        
        return res.json({
          status: 'already_active',
          agent_id: existingAgent.id,
          message: 'Agent session is already active'
        });
      }

      // Create or reactivate agent
      const agent = await agentService.createAgent(userId, {
        container_endpoint: process.env.RUNPOD_EMBEDDING_URL,
        capabilities: ['chat', 'embed', 'health_check'],
        started_at: new Date().toISOString()
      });

      errorLogger.success('Agent started successfully', {
        user_id: userId,
        agent_id: agent.id,
        component: 'AgentRoutes'
      });

      res.json({
        status: 'activated',
        agent_id: agent.id,
        container_id: agent.session_data?.container_id || 'unknown',
        message: 'Agent session activated successfully'
      });

    } catch (error) {
      errorLogger.error('Failed to start agent', error, {
        user_id: req.userId,
        error_stack: error.stack,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({
        error: 'Failed to start agent session',
        details: error.message
      });
    }
  }

  // Stop agent session
  async stopAgent(req, res) {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent stop requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      const agent = await agentService.getActiveAgent(userId);
      
      if (!agent) {
        errorLogger.warn('No active agent to stop', {
          user_id: userId,
          component: 'AgentRoutes'
        });
        
        return res.json({
          status: 'not_active',
          message: 'No active agent session to stop'
        });
      }

      await agentService.terminateAgent(agent.id);

      errorLogger.success('Agent stopped successfully', {
        user_id: userId,
        agent_id: agent.id,
        component: 'AgentRoutes'
      });

      res.json({
        status: 'deactivated',
        agent_id: agent.id,
        message: 'Agent session deactivated successfully'
      });

    } catch (error) {
      errorLogger.error('Failed to stop agent', error, {
        user_id: req.userId,
        error_stack: error.stack,
        component: 'AgentRoutes'
      });
      
      res.status(500).json({
        error: 'Failed to stop agent session',
        details: error.message
      });
    }
  }
}

const agentRoutes = new AgentRoutes();

// New API routes (preferred)
router.get('/status', (req, res) => agentRoutes.getStatus(req, res));
router.post('/start', (req, res) => agentRoutes.startAgent(req, res));
router.post('/stop', (req, res) => agentRoutes.stopAgent(req, res));

// Legacy routes (deprecated but maintained for compatibility)
legacyRouter.get('/status', (req, res) => {
  errorLogger.warn('Legacy agent route used', {
    path: req.path,
    user_id: req.userId,
    component: 'AgentRoutes'
  });
  agentRoutes.getStatus(req, res);
});

legacyRouter.post('/start', (req, res) => {
  errorLogger.warn('Legacy agent route used', {
    path: req.path,
    user_id: req.userId,
    component: 'AgentRoutes'
  });
  agentRoutes.startAgent(req, res);
});

legacyRouter.post('/stop', (req, res) => {
  errorLogger.warn('Legacy agent route used', {
    path: req.path,
    user_id: req.userId,
    component: 'AgentRoutes'
  });
  agentRoutes.stopAgent(req, res);
});

export { router, legacyRouter, agentRoutes };