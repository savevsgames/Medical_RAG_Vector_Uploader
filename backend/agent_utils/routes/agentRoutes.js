import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { AgentService } from '../core/agentService.js';
import { ContainerService } from '../core/containerService.js';
import { errorLogger } from '../shared/logger.js';

// Route Handler Factory
class RouteHandlerFactory {
  constructor(agentService, containerService, logger) {
    this.agentService = agentService;
    this.containerService = containerService;
    this.logger = logger;
  }

  createAsyncHandler(handlerFn) {
    return async (req, res) => {
      try {
        await handlerFn(req, res);
      } catch (error) {
        this.logger.error('Route handler error', error, {
          path: req.path,
          method: req.method,
          user_id: req.userId,
          component: 'RouteHandlerFactory'
        });
        
        res.status(500).json({
          error: 'Internal server error',
          details: error.message
        });
      }
    };
  }
}

// Agent Status Operations
class AgentStatusOperations {
  constructor(agentService, containerService, logger) {
    this.agentService = agentService;
    this.containerService = containerService;
    this.logger = logger;
  }

  async getStatus(req, res) {
    const userId = req.userId;
    
    this.logger.info('Agent status check requested', {
      user_id: userId,
      component: 'AgentStatusOperations'
    });

    try {
      // Get agent session from database
      const agentData = await this.agentService.getActiveAgent(userId);
      const agent = agentData?.[0]; // Handle array return format

      if (!agent) {
        this.logger.info('No active agent session found', {
          user_id: userId,
          component: 'AgentStatusOperations'
        });

        return res.json({
          agent_active: false,
          agent_id: null,
          last_active: null,
          container_status: 'stopped',
          container_health: null
        });
      }

      // Check container health if agent is active
      let containerStatus = 'unknown';
      let containerHealth = null;

      try {
        const healthCheck = await this.containerService.checkHealth();
        containerStatus = healthCheck.healthy ? 'running' : 'unhealthy';
        containerHealth = healthCheck.data;
        
        this.logger.success('Container health check completed', {
          user_id: userId,
          agent_id: agent.id,
          container_healthy: healthCheck.healthy,
          component: 'AgentStatusOperations'
        });
      } catch (healthError) {
        containerStatus = 'unreachable';
        this.logger.warn('Container health check failed', {
          user_id: userId,
          agent_id: agent.id,
          error: healthError.message,
          component: 'AgentStatusOperations'
        });
      }

      // Update agent last active
      await this.agentService.updateLastActive(agent.id);

      const response = {
        agent_active: true,
        agent_id: agent.id,
        last_active: agent.last_active,
        container_status: containerStatus,
        container_health: containerHealth,
        session_data: agent.session_data
      };

      this.logger.success('Agent status retrieved successfully', {
        user_id: userId,
        agent_id: agent.id,
        container_status: containerStatus,
        component: 'AgentStatusOperations'
      });

      res.json(response);

    } catch (error) {
      this.logger.error('Failed to get agent status', error, {
        user_id: userId,
        component: 'AgentStatusOperations'
      });

      res.status(500).json({
        error: 'Failed to get agent status',
        details: error.message
      });
    }
  }

  async performHealthCheck(req, res) {
    const userId = req.userId;
    
    this.logger.info('Manual health check requested', {
      user_id: userId,
      component: 'AgentStatusOperations'
    });

    try {
      const healthCheck = await this.containerService.checkHealth();
      
      this.logger.success('Manual health check completed', {
        user_id: userId,
        healthy: healthCheck.healthy,
        component: 'AgentStatusOperations'
      });

      res.json({
        healthy: healthCheck.healthy,
        data: healthCheck.data,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Manual health check failed', error, {
        user_id: userId,
        component: 'AgentStatusOperations'
      });

      res.status(500).json({
        error: 'Health check failed',
        details: error.message
      });
    }
  }
}

// Agent Lifecycle Operations
class AgentLifecycleOperations {
  constructor(agentService, containerService, logger) {
    this.agentService = agentService;
    this.containerService = containerService;
    this.logger = logger;
  }

  async startAgent(req, res) {
    const userId = req.userId;
    
    this.logger.info('Agent start requested', {
      user_id: userId,
      component: 'AgentLifecycleOperations'
    });

    try {
      // FIXED: Use createAgentSession instead of startAgent
      const sessionData = {
        started_at: new Date().toISOString(),
        capabilities: ['chat', 'embed', 'search'],
        runpod_endpoint: process.env.RUNPOD_EMBEDDING_URL || null
      };

      const result = await this.agentService.createAgentSession(userId, 'initializing', sessionData);
      const agent = result[0]; // Handle array return format

      if (!agent) {
        throw new Error('Failed to create agent session');
      }

      this.logger.success('Agent session created successfully', {
        user_id: userId,
        agent_id: agent.id,
        component: 'AgentLifecycleOperations'
      });

      // Try to activate the container
      try {
        const healthCheck = await this.containerService.checkHealth();
        if (healthCheck.healthy) {
          // Update agent status to active
          await this.agentService.updateAgentStatus(agent.id, 'active');
          
          this.logger.success('Agent activated successfully', {
            user_id: userId,
            agent_id: agent.id,
            container_healthy: true,
            component: 'AgentLifecycleOperations'
          });
        } else {
          this.logger.warn('Container not healthy, agent remains in initializing state', {
            user_id: userId,
            agent_id: agent.id,
            component: 'AgentLifecycleOperations'
          });
        }
      } catch (healthError) {
        this.logger.warn('Container health check failed during activation', {
          user_id: userId,
          agent_id: agent.id,
          error: healthError.message,
          component: 'AgentLifecycleOperations'
        });
      }

      res.json({
        status: 'activated',
        agent_id: agent.id,
        container_id: agent.session_data?.container_id || 'unknown',
        message: 'Agent session created successfully'
      });

    } catch (error) {
      this.logger.error('Failed to start agent', error, {
        user_id: userId,
        component: 'AgentLifecycleOperations'
      });

      res.status(500).json({
        error: 'Failed to start agent',
        details: error.message
      });
    }
  }

  async stopAgent(req, res) {
    const userId = req.userId;
    
    this.logger.info('Agent stop requested', {
      user_id: userId,
      component: 'AgentLifecycleOperations'
    });

    try {
      // FIXED: Use terminateAgentSession instead of stopAgent
      const result = await this.agentService.terminateAgentSession(userId);

      if (result) {
        this.logger.success('Agent session terminated successfully', {
          user_id: userId,
          component: 'AgentLifecycleOperations'
        });

        res.json({
          status: 'deactivated',
          message: 'Agent session terminated successfully'
        });
      } else {
        this.logger.warn('No active agent session found to terminate', {
          user_id: userId,
          component: 'AgentLifecycleOperations'
        });

        res.json({
          status: 'no_active_session',
          message: 'No active agent session found'
        });
      }

    } catch (error) {
      this.logger.error('Failed to stop agent', error, {
        user_id: userId,
        component: 'AgentLifecycleOperations'
      });

      res.status(500).json({
        error: 'Failed to stop agent',
        details: error.message
      });
    }
  }
}

// Agent Route Definitions
class AgentRouteDefinitions {
  constructor(statusOps, lifecycleOps, handlerFactory) {
    this.statusOps = statusOps;
    this.lifecycleOps = lifecycleOps;
    this.handlerFactory = handlerFactory;
  }

  getStatusRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.statusOps.getStatus.bind(this.statusOps)
    );
  }

  getHealthCheckRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.statusOps.performHealthCheck.bind(this.statusOps)
    );
  }

  getStartRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.lifecycleOps.startAgent.bind(this.lifecycleOps)
    );
  }

  getStopRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.lifecycleOps.stopAgent.bind(this.lifecycleOps)
    );
  }
}

// Main Router Configuration
class AgentRouterConfig {
  constructor(supabaseClient) {
    // Step 5: Validate Supabase Client Before Use
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client provided to AgentRouterConfig');
    }

    this.supabaseClient = supabaseClient;
    this.logger = errorLogger;
  }

  createRouter() {
    const router = express.Router();

    // Step 4: Apply Authentication Middleware
    router.use(verifyToken);

    // Step 1: Instantiate AgentService
    const agentService = new AgentService(this.supabaseClient);
    const containerService = new ContainerService();

    // Step 2: Wire into Component Classes
    const handlerFactory = new RouteHandlerFactory(agentService, containerService, this.logger);
    const statusOps = new AgentStatusOperations(agentService, containerService, this.logger);
    const lifecycleOps = new AgentLifecycleOperations(agentService, containerService, this.logger);
    const routeDefinitions = new AgentRouteDefinitions(statusOps, lifecycleOps, handlerFactory);

    // Step 3: Define Routes with Abstractions
    router.get('/status', routeDefinitions.getStatusRoute());
    router.post('/health-check', routeDefinitions.getHealthCheckRoute());
    router.post('/start', routeDefinitions.getStartRoute());
    router.post('/stop', routeDefinitions.getStopRoute());

    this.logger.success('Agent routes configured successfully', {
      routes: ['/status', '/health-check', '/start', '/stop'],
      component: 'AgentRouterConfig'
    });

    return router;
  }
}

// Factory function for creating agent router
export function createAgentRouter(supabaseClient) {
  const config = new AgentRouterConfig(supabaseClient);
  return config.createRouter();
}

// Legacy router with deprecation warnings
export function createAgentLegacyRouter(supabaseClient) {
  const router = express.Router();
  
  router.use((req, res, next) => {
    errorLogger.warn('Legacy agent route accessed', {
      path: req.path,
      method: req.method,
      user_agent: req.get('User-Agent'),
      component: 'LegacyAgentRouter'
    });
    next();
  });

  // Redirect legacy routes to new API
  router.all('*', (req, res) => {
    const newPath = `/api/agent${req.path}`;
    errorLogger.info('Redirecting legacy route to new API', {
      old_path: req.path,
      new_path: newPath,
      component: 'LegacyAgentRouter'
    });
    
    res.status(301).json({
      error: 'This endpoint has moved',
      new_endpoint: newPath,
      message: 'Please update your client to use the new API endpoint'
    });
  });

  return router;
}

// Export all classes for testing
export {
  RouteHandlerFactory,
  AgentStatusOperations,
  AgentLifecycleOperations,
  AgentRouteDefinitions,
  AgentRouterConfig
};