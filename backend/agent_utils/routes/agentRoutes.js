import express from 'express';
import { AgentService } from '../core/agentService.js';
import { ContainerService } from '../core/containerService.js';
import { verifyToken } from '../../middleware/auth.js';
import { errorLogger } from '../shared/logger.js';

/**
 * Route Handler Factory - Creates standardized route handlers
 */
class RouteHandlerFactory {
  constructor(agentService, logger) {
    this.agentService = agentService;
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

/**
 * Agent Status Operations - Handles status-related endpoints
 */
class AgentStatusOperations {
  constructor(agentService, logger) {
    this.agentService = agentService;
    this.logger = logger;
  }

  async handleGetStatus(req, res) {
    const userId = req.userId;
    
    this.logger.info('Agent status requested', {
      user_id: userId,
      component: 'AgentStatusOperations'
    });

    try {
      const status = await this.agentService.getAgentStatus(userId);
      
      this.logger.success('Agent status retrieved', {
        user_id: userId,
        agent_active: status.agent_active,
        container_status: status.container_status,
        component: 'AgentStatusOperations'
      });

      res.json(status);
    } catch (error) {
      this.logger.error('Failed to get agent status', error, {
        user_id: userId,
        component: 'AgentStatusOperations'
      });
      
      res.status(500).json({
        error: 'Failed to retrieve agent status',
        details: error.message
      });
    }
  }

  async handleHealthCheck(req, res) {
    const userId = req.userId;
    
    this.logger.info('Detailed health check requested', {
      user_id: userId,
      component: 'AgentStatusOperations'
    });

    try {
      const healthStatus = await this.agentService.performDetailedStatusCheck(userId);
      
      this.logger.success('Health check completed', {
        user_id: userId,
        container_reachable: healthStatus.container_reachable,
        endpoints_working: healthStatus.endpoints_working,
        component: 'AgentStatusOperations'
      });

      res.json(healthStatus);
    } catch (error) {
      this.logger.error('Health check failed', error, {
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

/**
 * Agent Lifecycle Operations - Handles start/stop operations
 */
class AgentLifecycleOperations {
  constructor(agentService, logger) {
    this.agentService = agentService;
    this.logger = logger;
  }

  async handleStart(req, res) {
    const userId = req.userId;
    
    this.logger.info('Agent start requested', {
      user_id: userId,
      component: 'AgentLifecycleOperations'
    });

    try {
      const result = await this.agentService.startAgent(userId);
      
      this.logger.success('Agent started successfully', {
        user_id: userId,
        agent_id: result.agent_id,
        container_id: result.container_id,
        component: 'AgentLifecycleOperations'
      });

      res.json({
        message: 'Agent started successfully',
        agent_id: result.agent_id,
        container_id: result.container_id,
        status: result.status || 'activated'
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

  async handleStop(req, res) {
    const userId = req.userId;
    
    this.logger.info('Agent stop requested', {
      user_id: userId,
      component: 'AgentLifecycleOperations'
    });

    try {
      const result = await this.agentService.stopAgent(userId);
      
      this.logger.success('Agent stopped successfully', {
        user_id: userId,
        terminated_sessions: result.terminated_sessions,
        component: 'AgentLifecycleOperations'
      });

      res.json({
        message: 'Agent stopped successfully',
        terminated_sessions: result.terminated_sessions
      });
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

/**
 * Agent Route Definitions - Defines all route handlers
 */
class AgentRouteDefinitions {
  constructor(statusOps, lifecycleOps, handlerFactory) {
    this.statusOps = statusOps;
    this.lifecycleOps = lifecycleOps;
    this.handlerFactory = handlerFactory;
  }

  getStatusRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.statusOps.handleGetStatus.bind(this.statusOps)
    );
  }

  getHealthCheckRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.statusOps.handleHealthCheck.bind(this.statusOps)
    );
  }

  getStartRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.lifecycleOps.handleStart.bind(this.lifecycleOps)
    );
  }

  getStopRoute() {
    return this.handlerFactory.createAsyncHandler(
      this.lifecycleOps.handleStop.bind(this.lifecycleOps)
    );
  }
}

/**
 * Agent Router Configuration - Main router factory
 */
class AgentRouterConfig {
  constructor(supabaseClient, logger = errorLogger) {
    // Step 5: Validate Supabase Client Before Use
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      throw new Error('Invalid Supabase client provided to AgentRouterConfig');
    }
    
    this.supabaseClient = supabaseClient;
    this.logger = logger;
  }

  createRouter() {
    const router = express.Router();
    
    // Step 4: Apply Authentication Middleware
    router.use(verifyToken);
    
    this.logger.info('Creating agent router with dependencies', {
      component: 'AgentRouterConfig'
    });

    try {
      // Step 1: Instantiate AgentService
      const agentService = new AgentService(this.supabaseClient);
      
      // Step 2: Wire into Component Classes
      const handlerFactory = new RouteHandlerFactory(agentService, this.logger);
      const statusOps = new AgentStatusOperations(agentService, this.logger);
      const lifecycleOps = new AgentLifecycleOperations(agentService, this.logger);
      const routeDefinitions = new AgentRouteDefinitions(statusOps, lifecycleOps, handlerFactory);

      // Step 3: Define Routes with Abstractions
      router.get('/status', routeDefinitions.getStatusRoute());
      router.post('/health-check', routeDefinitions.getHealthCheckRoute());
      router.post('/start', routeDefinitions.getStartRoute());
      router.post('/stop', routeDefinitions.getStopRoute());

      this.logger.success('Agent router created successfully', {
        routes: ['/status', '/health-check', '/start', '/stop'],
        component: 'AgentRouterConfig'
      });

      return router;
    } catch (error) {
      this.logger.error('Failed to create agent router', error, {
        component: 'AgentRouterConfig'
      });
      throw error;
    }
  }
}

/**
 * Factory function to create agent router
 */
export function createAgentRouter(supabaseClient) {
  const config = new AgentRouterConfig(supabaseClient);
  return config.createRouter();
}

/**
 * Legacy router for backward compatibility
 */
export function createAgentLegacyRouter(supabaseClient) {
  const router = express.Router();
  
  // Add deprecation warning middleware
  router.use((req, res, next) => {
    errorLogger.warn('Legacy agent route accessed', {
      path: req.path,
      method: req.method,
      user_agent: req.get('User-Agent'),
      component: 'LegacyAgentRouter'
    });
    
    res.setHeader('X-Deprecated', 'true');
    res.setHeader('X-Deprecation-Message', 'Use /api/agent/* endpoints instead');
    next();
  });

  // Create main router and mount legacy paths
  const mainRouter = createAgentRouter(supabaseClient);
  router.use('/', mainRouter);

  return router;
}

// Export individual classes for testing
export {
  AgentRouterConfig,
  RouteHandlerFactory,
  AgentStatusOperations,
  AgentLifecycleOperations,
  AgentRouteDefinitions
};