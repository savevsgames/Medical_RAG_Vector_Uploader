import express from 'express';
import { AgentService } from '../core/agentService.js';
import { ContainerService } from '../core/containerService.js';
import { verifyToken } from '../../middleware/auth.js';
import { errorLogger } from '../shared/logger.js';

// FIXED: Removed legacy router creation
export function createAgentRouter(supabaseClient) {
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to createAgentRouter');
  }

  const router = express.Router();
  
  // Apply authentication to all agent routes
  router.use(verifyToken);
  
  // Initialize services
  const agentService = new AgentService(supabaseClient);
  const containerService = new ContainerService();

  // Agent Lifecycle Operations
  class AgentLifecycleOperations {
    constructor(agentService, containerService) {
      this.agentService = agentService;
      this.containerService = containerService;
    }

    async startAgent(req, res) {
      const startTime = Date.now();
      
      try {
        const userId = req.userId;
        
        errorLogger.info('Agent start request received', {
          userId,
          ip: req.ip,
          userAgent: req.get('User-Agent')?.substring(0, 100),
          component: 'AgentLifecycleOperations'
        });

        // FIXED: Use the correct method name that exists in AgentService
        const sessionData = {
          runpod_endpoint: process.env.RUNPOD_EMBEDDING_URL,
          started_at: new Date().toISOString(),
          capabilities: ['chat', 'embed', 'health']
        };

        const result = await this.agentService.startAgent(userId, sessionData);

        const processingTime = Date.now() - startTime;

        errorLogger.success('Agent started successfully', {
          userId,
          agentId: result.id,
          status: result.status,
          processingTime,
          component: 'AgentLifecycleOperations'
        });

        res.json({
          success: true,
          message: 'TxAgent session activated successfully',
          agent_id: result.id,
          container_id: result.id, // For compatibility
          status: result.status,
          session_data: result.session_data,
          processing_time: processingTime
        });

      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        errorLogger.error('Agent start failed', error, {
          userId: req.userId,
          processingTime,
          error: errorMessage,
          component: 'AgentLifecycleOperations'
        });

        res.status(500).json({
          error: 'Failed to start TxAgent session',
          details: errorMessage,
          processing_time: processingTime
        });
      }
    }

    async stopAgent(req, res) {
      const startTime = Date.now();
      
      try {
        const userId = req.userId;
        
        errorLogger.info('Agent stop request received', {
          userId,
          component: 'AgentLifecycleOperations'
        });

        const result = await this.agentService.terminateAgentSession(userId);

        const processingTime = Date.now() - startTime;

        errorLogger.success('Agent stopped successfully', {
          userId,
          result,
          processingTime,
          component: 'AgentLifecycleOperations'
        });

        res.json({
          success: true,
          message: 'TxAgent session deactivated successfully',
          processing_time: processingTime
        });

      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        errorLogger.error('Agent stop failed', error, {
          userId: req.userId,
          processingTime,
          error: errorMessage,
          component: 'AgentLifecycleOperations'
        });

        res.status(500).json({
          error: 'Failed to stop TxAgent session',
          details: errorMessage,
          processing_time: processingTime
        });
      }
    }
  }

  // Agent Status Operations
  class AgentStatusOperations {
    constructor(agentService, containerService) {
      this.agentService = agentService;
      this.containerService = containerService;
    }

    async getStatus(req, res) {
      try {
        const userId = req.userId;
        
        errorLogger.debug('Agent status request received', {
          userId,
          component: 'AgentStatusOperations'
        });

        const agent = await this.agentService.getActiveAgent(userId);

        if (!agent) {
          errorLogger.debug('No active agent found', {
            userId,
            component: 'AgentStatusOperations'
          });

          return res.json({
            agent_active: false,
            agent_id: null,
            last_active: null,
            container_status: 'stopped',
            container_health: null,
            session_data: null
          });
        }

        // Check container health if endpoint is available
        let containerStatus = 'unknown';
        let containerHealth = null;

        if (agent.session_data?.runpod_endpoint) {
          try {
            const healthCheck = await this.checkContainerHealth(agent);
            containerStatus = healthCheck.status;
            containerHealth = healthCheck.data;
          } catch (healthError) {
            errorLogger.warn('Container health check failed', {
              userId,
              agentId: agent.id,
              error: healthError.message,
              component: 'AgentStatusOperations'
            });
            containerStatus = 'unreachable';
            containerHealth = { error: healthError.message };
          }
        }

        errorLogger.debug('Agent status retrieved', {
          userId,
          agentId: agent.id,
          containerStatus,
          component: 'AgentStatusOperations'
        });

        res.json({
          agent_active: true,
          agent_id: agent.id,
          last_active: agent.last_active,
          container_status: containerStatus,
          container_health: containerHealth,
          session_data: agent.session_data
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        errorLogger.error('Agent status check failed', error, {
          userId: req.userId,
          error: errorMessage,
          component: 'AgentStatusOperations'
        });

        res.status(500).json({
          error: 'Failed to check agent status',
          details: errorMessage
        });
      }
    }

    async checkContainerHealth(agent) {
      // FIXED: Validate session data first
      if (!agent.session_data?.runpod_endpoint) {
        return {
          status: 'no_endpoint',
          data: { error: 'No RunPod endpoint configured' }
        };
      }

      try {
        const healthUrl = `${agent.session_data.runpod_endpoint.replace(/\/+$/, '')}/health`;
        
        errorLogger.debug('Checking container health', {
          agentId: agent.id,
          healthUrl,
          component: 'AgentStatusOperations'
        });

        const response = await fetch(healthUrl, { 
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const healthData = await response.json();
          return {
            status: 'running',
            data: healthData
          };
        } else {
          return {
            status: 'unhealthy',
            data: { 
              error: `HTTP ${response.status}: ${response.statusText}`,
              status_code: response.status
            }
          };
        }
      } catch (error) {
        return {
          status: 'unreachable',
          data: { error: error.message }
        };
      }
    }

    async performHealthCheck(req, res) {
      try {
        const userId = req.userId;
        
        errorLogger.info('Detailed health check requested', {
          userId,
          component: 'AgentStatusOperations'
        });

        const agent = await this.agentService.getActiveAgent(userId);

        if (!agent) {
          return res.status(404).json({
            error: 'No active agent session found',
            details: 'Start an agent session first'
          });
        }

        const healthCheck = await this.checkContainerHealth(agent);

        errorLogger.success('Detailed health check completed', {
          userId,
          agentId: agent.id,
          containerStatus: healthCheck.status,
          component: 'AgentStatusOperations'
        });

        res.json({
          agent_id: agent.id,
          container_status: healthCheck.status,
          container_health: healthCheck.data,
          last_check: new Date().toISOString()
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        errorLogger.error('Detailed health check failed', error, {
          userId: req.userId,
          error: errorMessage,
          component: 'AgentStatusOperations'
        });

        res.status(500).json({
          error: 'Health check failed',
          details: errorMessage
        });
      }
    }
  }

  // Initialize operation handlers
  const lifecycleOps = new AgentLifecycleOperations(agentService, containerService);
  const statusOps = new AgentStatusOperations(agentService, containerService);

  // FIXED: Simplified route definitions - no legacy routes
  router.post('/start', (req, res) => lifecycleOps.startAgent(req, res));
  router.post('/stop', (req, res) => lifecycleOps.stopAgent(req, res));
  router.get('/status', (req, res) => statusOps.getStatus(req, res));
  router.post('/health-check', (req, res) => statusOps.performHealthCheck(req, res));

  errorLogger.info('Agent router created successfully with routes:', {
    routes: [
      'POST /api/agent/start',
      'POST /api/agent/stop', 
      'GET /api/agent/status',
      'POST /api/agent/health-check'
    ],
    component: 'createAgentRouter'
  });

  return router;
}