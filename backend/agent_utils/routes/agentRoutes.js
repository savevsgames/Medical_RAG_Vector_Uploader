// Consolidated agent route handlers
import express from 'express';
import { AgentService } from '../core/agentService.js';
import { ContainerService } from '../core/containerService.js';
import { agentMiddleware } from '../middleware/agentMiddleware.js';
import { errorLogger } from '../shared/logger.js';
import { handleAgentError, createAuthError } from '../shared/errors.js';
import { CONTAINER_STATUS } from '../shared/constants.js';

class AgentRoutes {
  constructor() {
    this.router = express.Router();
    this.legacyRouter = express.Router();
    this.agentService = new AgentService();
    this.containerService = new ContainerService();
    this.setupRoutes();
    this.setupLegacyRoutes();
  }

  setupRoutes() {
    this.router.use(agentMiddleware.logRequest.bind(agentMiddleware));
    this.router.use(agentMiddleware.rateLimit());

    this.router.post('/start', this.startAgent.bind(this));
    this.router.post('/stop', this.stopAgent.bind(this));
    this.router.get('/status', this.getStatus.bind(this));
    this.router.get('/stats', this.getStats.bind(this));
  }

  setupLegacyRoutes() {
    this.legacyRouter.use(agentMiddleware.deprecationWarning('agent'));
    this.legacyRouter.post('/start', this.startAgent.bind(this));
    this.legacyRouter.post('/stop', this.stopAgent.bind(this));
    this.legacyRouter.get('/status', this.getStatus.bind(this));
  }

  async startAgent(req, res) {
    try {
      const { userId } = req;
      const userJWT = req.headers.authorization;

      if (!userId || !userJWT) {
        throw createAuthError('start agent');
      }

      errorLogger.info('Activating TxAgent session', { user_id: userId });

      // Check existing status
      const existingStatus = await this.agentService.getStatus(userId, userJWT);
      
      if (existingStatus.agent_active) {
        errorLogger.info('Agent already active', {
          user_id: userId,
          agent_id: existingStatus.agent_id
        });
        
        return res.json({
          agent_id: existingStatus.agent_id,
          status: 'already_running',
          message: 'TxAgent session is already active'
        });
      }

      // Verify container health
      const healthResponse = await this.containerService.healthCheck(userJWT);
      
      if (healthResponse.status !== 'healthy') {
        throw new Error(`Container unhealthy: ${healthResponse.status}`);
      }

      // Create session
      const urlMatch = process.env.RUNPOD_EMBEDDING_URL?.match(/https:\/\/([^-]+)/);
      const containerId = urlMatch ? urlMatch[1] : 'unknown';

      const sessionData = await this.agentService.createSession(userId, {
        container_id: containerId,
        endpoint_url: process.env.RUNPOD_EMBEDDING_URL,
        health_status: healthResponse
      }, userJWT);

      res.json({
        agent_id: sessionData.id,
        container_id: containerId,
        endpoint_url: process.env.RUNPOD_EMBEDDING_URL,
        status: 'activated',
        message: 'TxAgent session activated successfully',
        health: healthResponse
      });

    } catch (error) {
      const errorResponse = handleAgentError('start', error, req.userId);
      res.status(errorResponse.status).json(errorResponse);
    }
  }

  async stopAgent(req, res) {
    try {
      const { userId } = req;
      const userJWT = req.headers.authorization;

      if (!userId || !userJWT) {
        throw createAuthError('stop agent');
      }

      errorLogger.info('Deactivating TxAgent session', { user_id: userId });

      await this.agentService.terminateSession(userId, userJWT);

      res.json({
        status: 'deactivated',
        message: 'TxAgent session deactivated successfully'
      });

    } catch (error) {
      const errorResponse = handleAgentError('stop', error, req.userId);
      res.status(errorResponse.status).json(errorResponse);
    }
  }

  async getStatus(req, res) {
    try {
      const { userId } = req;
      const userJWT = req.headers.authorization;

      if (!userId || !userJWT) {
        throw createAuthError('get status');
      }

      const localStatus = await this.agentService.getStatus(userId, userJWT);
      
      if (!localStatus.agent_active) {
        return res.json({
          ...localStatus,
          container_status: 'not_active'
        });
      }

      // Check container health if configured
      if (this.containerService.isConfigured()) {
        try {
          const healthResponse = await this.containerService.healthCheck(userJWT);
          
          res.json({
            ...localStatus,
            container_status: healthResponse.status,
            container_health: {
              status: healthResponse.status,
              model: healthResponse.model,
              device: healthResponse.device,
              version: healthResponse.version
            }
          });
        } catch (error) {
          res.json({
            ...localStatus,
            container_status: CONTAINER_STATUS.UNREACHABLE,
            container_health: 'health_check_failed'
          });
        }
      } else {
        res.json({
          ...localStatus,
          container_status: 'not_configured'
        });
      }

    } catch (error) {
      const errorResponse = handleAgentError('status', error, req.userId);
      res.status(errorResponse.status).json(errorResponse);
    }
  }

  async getStats(req, res) {
    try {
      const userJWT = req.headers.authorization;

      if (!userJWT) {
        throw createAuthError('get stats');
      }

      const stats = await this.agentService.getStats(userJWT);
      res.json(stats);

    } catch (error) {
      const errorResponse = handleAgentError('get_stats', error, req.userId);
      res.status(errorResponse.status).json(errorResponse);
    }
  }
}

export const agentRoutes = new AgentRoutes();