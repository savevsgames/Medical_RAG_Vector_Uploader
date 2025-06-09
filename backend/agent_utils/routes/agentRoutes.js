import express from 'express';
import { AgentService } from '../core/agentService.js';
import { ContainerService } from '../core/containerService.js';
import { supabase } from '../../config/database.js';
import { errorLogger } from '../shared/logger.js';

// Initialize services with Supabase client
const agentService = new AgentService(supabase);
const containerService = new ContainerService();

// Validate service initialization
errorLogger.debug('AgentRoutes services initialized', {
  agentServiceType: typeof agentService,
  containerServiceType: typeof containerService,
  supabaseFromMethod: typeof supabase.from,
  component: 'AgentRoutes'
});

class AgentRoutes {
  constructor() {
    this.router = express.Router();
    this.legacyRouter = express.Router();
    this.setupRoutes();
    this.setupLegacyRoutes();
  }

  async getStatus(req, res) {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent status requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      const status = await agentService.getAgentStatus(userId);

      errorLogger.success('Agent status retrieved successfully', {
        user_id: userId,
        agent_active: status.agent_active,
        agent_id: status.agent_id,
        component: 'AgentRoutes'
      });

      res.json(status);
    } catch (error) {
      errorLogger.error('Failed to get agent status', {
        user_id: req.userId,
        error_stack: error.stack,
        component: 'AgentRoutes',
        error_message: error.message
      });

      res.status(500).json({
        error: 'Failed to get agent status',
        details: error.message
      });
    }
  }

  async startAgent(req, res) {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent start requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      // Check if agent is already active
      const existingAgent = await agentService.getActiveAgent(userId);
      if (existingAgent) {
        errorLogger.warn('Agent already active', {
          user_id: userId,
          existing_agent_id: existingAgent.id,
          component: 'AgentRoutes'
        });

        return res.json({
          status: 'already_active',
          agent_id: existingAgent.id,
          message: 'Agent session is already active'
        });
      }

      // Start container (if needed) and get session data
      let sessionData = {};
      try {
        const containerInfo = await containerService.startContainer(userId);
        sessionData = {
          container_id: containerInfo.container_id,
          container_status: 'running',
          runpod_endpoint: containerInfo.endpoint,
          started_at: new Date().toISOString(),
          capabilities: ['chat', 'embed', 'health_check']
        };

        errorLogger.info('Container started successfully', {
          user_id: userId,
          container_id: containerInfo.container_id,
          endpoint: containerInfo.endpoint,
          component: 'AgentRoutes'
        });
      } catch (containerError) {
        errorLogger.warn('Container start failed, proceeding with local session', {
          user_id: userId,
          container_error: containerError.message,
          component: 'AgentRoutes'
        });

        sessionData = {
          container_status: 'local',
          started_at: new Date().toISOString(),
          capabilities: ['local_processing']
        };
      }

      // Create agent session in database
      const agent = await agentService.startAgent(userId, sessionData);

      errorLogger.success('Agent started successfully', {
        user_id: userId,
        agent_id: agent.id,
        session_data: sessionData,
        component: 'AgentRoutes'
      });

      res.json({
        status: 'activated',
        agent_id: agent.id,
        container_id: sessionData.container_id,
        endpoint: sessionData.runpod_endpoint,
        capabilities: sessionData.capabilities,
        message: 'Agent session activated successfully'
      });

    } catch (error) {
      errorLogger.error('Failed to start agent', {
        user_id: req.userId,
        error_stack: error.stack,
        component: 'AgentRoutes',
        error_message: error.message
      });

      res.status(500).json({
        error: 'Failed to start agent',
        details: error.message
      });
    }
  }

  async stopAgent(req, res) {
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent stop requested', {
        user_id: userId,
        component: 'AgentRoutes'
      });

      // Get active agent first
      const activeAgent = await agentService.getActiveAgent(userId);
      if (!activeAgent) {
        errorLogger.warn('No active agent to stop', {
          user_id: userId,
          component: 'AgentRoutes'
        });

        return res.json({
          status: 'not_active',
          message: 'No active agent session to stop'
        });
      }

      // Stop container if it exists
      if (activeAgent.session_data?.container_id) {
        try {
          await containerService.stopContainer(activeAgent.session_data.container_id);
          errorLogger.info('Container stopped successfully', {
            user_id: userId,
            container_id: activeAgent.session_data.container_id,
            component: 'AgentRoutes'
          });
        } catch (containerError) {
          errorLogger.warn('Container stop failed', {
            user_id: userId,
            container_id: activeAgent.session_data.container_id,
            container_error: containerError.message,
            component: 'AgentRoutes'
          });
        }
      }

      // Stop agent session in database
      await agentService.stopAgent(userId, activeAgent.id);

      errorLogger.success('Agent stopped successfully', {
        user_id: userId,
        agent_id: activeAgent.id,
        component: 'AgentRoutes'
      });

      res.json({
        status: 'deactivated',
        agent_id: activeAgent.id,
        message: 'Agent session deactivated successfully'
      });

    } catch (error) {
      errorLogger.error('Failed to stop agent', {
        user_id: req.userId,
        error_stack: error.stack,
        component: 'AgentRoutes',
        error_message: error.message
      });

      res.status(500).json({
        error: 'Failed to stop agent',
        details: error.message
      });
    }
  }

  setupRoutes() {
    // GET /api/agent/status
    this.router.get('/status', (req, res) => this.getStatus(req, res));
    
    // POST /api/agent/start
    this.router.post('/start', (req, res) => this.startAgent(req, res));
    
    // POST /api/agent/stop
    this.router.post('/stop', (req, res) => this.stopAgent(req, res));

    errorLogger.info('Agent API routes configured', {
      routes: ['/status', '/start', '/stop'],
      component: 'AgentRoutes'
    });
  }

  setupLegacyRoutes() {
    // Legacy routes with deprecation warnings
    this.legacyRouter.use((req, res, next) => {
      errorLogger.warn('Legacy agent route accessed', {
        path: req.path,
        method: req.method,
        user_id: req.userId,
        component: 'AgentRoutes'
      });
      next();
    });

    this.legacyRouter.get('/status', (req, res) => this.getStatus(req, res));
    this.legacyRouter.post('/start', (req, res) => this.startAgent(req, res));
    this.legacyRouter.post('/stop', (req, res) => this.stopAgent(req, res));

    errorLogger.info('Legacy agent routes configured', {
      routes: ['/status', '/start', '/stop'],
      component: 'AgentRoutes'
    });
  }
}

// Create and export router instances
const agentRoutes = new AgentRoutes();

export const router = agentRoutes.router;
export const legacyRouter = agentRoutes.legacyRouter;

// Export the class for direct instantiation if needed
export { AgentRoutes };