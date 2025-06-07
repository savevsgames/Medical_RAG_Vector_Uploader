// Agent Controller - Route handlers for agent management
// Handles all agent-related HTTP endpoints (new API and legacy)

import express from 'express';
import axios from 'axios';
import { AgentManager } from './agentManager.js';
import { agentMiddleware } from './agentMiddleware.js';
import { errorLogger } from './errorLogger.js';

class AgentController {
  constructor() {
    this.router = express.Router();
    this.legacyRouter = express.Router();
    this.legacyChatRouter = express.Router();
    this.agentManager = null; // Will be initialized when supabase is available
    this.setupRoutes();
    this.setupLegacyRoutes();
  }

  // Initialize with Supabase client
  initialize(supabaseClient) {
    this.agentManager = new AgentManager(supabaseClient);
    errorLogger.success('Agent controller initialized with Supabase client');
  }

  setupRoutes() {
    // Apply middleware to all routes
    this.router.use(agentMiddleware.logAgentRequest);
    this.router.use(agentMiddleware.rateLimitAgent(20, 60000)); // 20 requests per minute

    // New API routes
    this.router.post('/start', this.startAgent.bind(this));
    this.router.post('/stop', this.stopAgent.bind(this));
    this.router.get('/status', this.getAgentStatus.bind(this));
    this.router.get('/stats', this.getAgentStats.bind(this));
  }

  setupLegacyRoutes() {
    // Legacy routes with deprecation warnings
    this.legacyRouter.use(this.deprecationWarning('agent'));
    this.legacyRouter.post('/start', this.legacyStartAgent.bind(this));
    this.legacyRouter.post('/stop', this.legacyStopAgent.bind(this));
    this.legacyRouter.get('/status', this.legacyGetAgentStatus.bind(this));

    // Legacy chat route
    this.legacyChatRouter.use(this.deprecationWarning('chat'));
    this.legacyChatRouter.post('/', this.legacyChat.bind(this));
  }

  // Middleware for deprecation warnings
  deprecationWarning(endpoint) {
    return (req, res, next) => {
      errorLogger.warn(`Legacy ${endpoint} endpoint used`, {
        user_id: req.userId,
        path: req.path,
        ip: req.ip,
        user_agent: req.get('User-Agent')
      });
      
      res.setHeader('X-Deprecated', 'true');
      res.setHeader('X-Deprecation-Message', `Use /api/${endpoint} instead`);
      next();
    };
  }

  // New API: Activate TxAgent session (container is already running)
  async startAgent(req, res) {
    try {
      const userId = req.userId;
      const userJWT = req.headers.authorization; // Get user's Supabase JWT
      const { RUNPOD_EMBEDDING_URL } = process.env;

      errorLogger.debug('Start agent request initiated', {
        user_id: userId,
        has_jwt: !!userJWT,
        jwt_preview: userJWT ? userJWT.substring(0, 50) + '...' : 'none',
        runpod_url: RUNPOD_EMBEDDING_URL,
        component: 'AgentController.startAgent'
      });

      if (!userId) {
        errorLogger.warn('Start agent called without user ID', {
          path: req.path,
          ip: req.ip,
          headers: Object.keys(req.headers)
        });
        return res.status(401).json({ 
          error: 'Authentication required',
          details: 'User ID not found in request'
        });
      }

      if (!RUNPOD_EMBEDDING_URL) {
        errorLogger.error('RunPod service not configured', {
          user_id: userId,
          missing_env_var: 'RUNPOD_EMBEDDING_URL',
          component: 'AgentController.startAgent'
        });
        return res.status(503).json({ 
          error: 'RunPod service not configured',
          details: 'Missing RUNPOD_EMBEDDING_URL'
        });
      }

      errorLogger.info('Activating TxAgent session', { 
        user_id: userId,
        has_jwt: !!userJWT,
        runpod_url: RUNPOD_EMBEDDING_URL
      });

      // Check if user already has an active agent
      errorLogger.debug('Checking for existing agent session', {
        user_id: userId,
        component: 'AgentController.startAgent'
      });

      const existingStatus = await this.agentManager.getAgentStatus(userId);
      
      errorLogger.debug('Existing agent status retrieved', {
        user_id: userId,
        agent_active: existingStatus.agent_active,
        agent_id: existingStatus.agent_id,
        component: 'AgentController.startAgent'
      });

      if (existingStatus.agent_active) {
        errorLogger.info('Agent already active for user', {
          user_id: userId,
          agent_id: existingStatus.agent_id
        });
        
        return res.json({
          agent_id: existingStatus.agent_id,
          status: 'already_running',
          message: 'TxAgent session is already active'
        });
      }

      // Verify TxAgent container is healthy using user's JWT
      errorLogger.debug('Performing TxAgent health check', {
        user_id: userId,
        health_url: `${RUNPOD_EMBEDDING_URL}/health`,
        has_auth_header: !!userJWT,
        component: 'AgentController.startAgent'
      });

      const healthResponse = await axios.get(
        `${RUNPOD_EMBEDDING_URL}/health`,
        { 
          headers: { 
            'Authorization': userJWT, // Send user's Supabase JWT
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      errorLogger.debug('TxAgent health check response received', {
        user_id: userId,
        status: healthResponse.status,
        status_text: healthResponse.statusText,
        response_data: healthResponse.data,
        component: 'AgentController.startAgent'
      });

      if (healthResponse.data.status !== 'healthy') {
        errorLogger.error('TxAgent container unhealthy', {
          user_id: userId,
          container_status: healthResponse.data.status,
          health_data: healthResponse.data,
          component: 'AgentController.startAgent'
        });
        throw new Error(`TxAgent container unhealthy: ${healthResponse.data.status}`);
      }

      // Extract container ID from RunPod URL for tracking
      const urlMatch = RUNPOD_EMBEDDING_URL.match(/https:\/\/([^-]+)/);
      const containerId = urlMatch ? urlMatch[1] : 'unknown';

      errorLogger.debug('Creating agent session in database', {
        user_id: userId,
        container_id: containerId,
        endpoint_url: RUNPOD_EMBEDDING_URL,
        component: 'AgentController.startAgent'
      });

      // Create agent session in database
      const sessionData = await this.agentManager.createAgentSession(userId, {
        container_id: containerId,
        endpoint_url: RUNPOD_EMBEDDING_URL,
        health_status: healthResponse.data
      });

      errorLogger.success('TxAgent session created successfully', {
        user_id: userId,
        agent_id: sessionData.id,
        container_id: containerId,
        component: 'AgentController.startAgent'
      });

      res.json({
        agent_id: sessionData.id,
        container_id: containerId,
        endpoint_url: RUNPOD_EMBEDDING_URL,
        status: 'activated',
        message: 'TxAgent session activated successfully',
        health: healthResponse.data
      });

    } catch (error) {
      errorLogger.agentError(req.userId, 'start', error, {
        error_type: error.constructor.name,
        error_message: error.message,
        error_stack: error.stack,
        axios_response: error.response ? {
          status: error.response.status,
          status_text: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        } : null,
        component: 'AgentController.startAgent'
      });
      
      if (error.code === 'ECONNABORTED') {
        return res.status(504).json({ 
          error: 'TxAgent health check timeout',
          details: 'Container may be starting up or overloaded'
        });
      }
      
      if (error.response?.status === 401) {
        return res.status(401).json({
          error: 'TxAgent authentication failed',
          details: 'Invalid or expired user token'
        });
      }
      
      if (error.response?.status === 404) {
        return res.status(503).json({
          error: 'TxAgent container not found',
          details: 'Verify RUNPOD_EMBEDDING_URL is correct and container is running'
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to activate TxAgent session',
        details: error.response?.data?.error || error.message
      });
    }
  }

  // New API: Deactivate TxAgent session (container remains running)
  async stopAgent(req, res) {
    try {
      const userId = req.userId;

      errorLogger.debug('Stop agent request initiated', {
        user_id: userId,
        component: 'AgentController.stopAgent'
      });

      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          details: 'User ID not found in request'
        });
      }

      errorLogger.info('Deactivating TxAgent session', { user_id: userId });

      // Update agent session in database
      await this.agentManager.terminateAgentSession(userId);

      errorLogger.success('TxAgent session deactivated successfully', {
        user_id: userId,
        component: 'AgentController.stopAgent'
      });

      res.json({
        status: 'deactivated',
        message: 'TxAgent session deactivated successfully'
      });

    } catch (error) {
      errorLogger.agentError(req.userId, 'stop', error, {
        error_type: error.constructor.name,
        error_message: error.message,
        error_stack: error.stack,
        component: 'AgentController.stopAgent'
      });
      res.status(500).json({ 
        error: 'Failed to deactivate TxAgent session',
        details: error.message
      });
    }
  }

  // New API: Get agent status with TxAgent health check
  async getAgentStatus(req, res) {
    try {
      const userId = req.userId;
      const userJWT = req.headers.authorization; // Get user's Supabase JWT
      
      errorLogger.debug('Agent status request initiated', {
        user_id: userId,
        has_jwt: !!userJWT,
        component: 'AgentController.getAgentStatus'
      });
      
      if (!userId) {
        errorLogger.warn('Agent status called without user ID', {
          path: req.path,
          ip: req.ip,
          headers: Object.keys(req.headers)
        });
        return res.status(401).json({ 
          error: 'Authentication required',
          details: 'User ID not found in request'
        });
      }
      
      // Get local database status
      errorLogger.debug('Fetching local agent status from database', {
        user_id: userId,
        component: 'AgentController.getAgentStatus'
      });

      const localStatus = await this.agentManager.getAgentStatus(userId);
      
      errorLogger.debug('Local agent status retrieved', {
        user_id: userId,
        agent_active: localStatus.agent_active,
        agent_id: localStatus.agent_id,
        last_active: localStatus.last_active,
        component: 'AgentController.getAgentStatus'
      });
      
      if (!localStatus.agent_active) {
        errorLogger.info('No active agent session found', {
          user_id: userId,
          component: 'AgentController.getAgentStatus'
        });
        return res.json({
          ...localStatus,
          container_status: 'not_active'
        });
      }

      // Check TxAgent container health if configured
      if (process.env.RUNPOD_EMBEDDING_URL) {
        try {
          errorLogger.debug('Performing TxAgent health check for status', {
            user_id: userId,
            health_url: `${process.env.RUNPOD_EMBEDDING_URL}/health`,
            has_auth_header: !!userJWT,
            component: 'AgentController.getAgentStatus'
          });

          const response = await axios.get(
            `${process.env.RUNPOD_EMBEDDING_URL}/health`,
            { 
              headers: { 
                'Authorization': userJWT // Send user's Supabase JWT
              },
              timeout: 10000
            }
          );

          errorLogger.debug('TxAgent health check successful for status', {
            user_id: userId,
            status: response.status,
            response_data: response.data,
            component: 'AgentController.getAgentStatus'
          });

          res.json({
            ...localStatus,
            container_status: response.data.status,
            container_health: {
              status: response.data.status,
              model: response.data.model,
              device: response.data.device,
              version: response.data.version
            }
          });

        } catch (runpodError) {
          errorLogger.warn('TxAgent health check failed', {
            user_id: userId,
            error: runpodError.message,
            status: runpodError.response?.status,
            response_data: runpodError.response?.data,
            component: 'AgentController.getAgentStatus'
          });
          
          res.json({
            ...localStatus,
            container_status: 'unreachable',
            container_health: 'health_check_failed'
          });
        }
      } else {
        errorLogger.warn('RunPod URL not configured for health check', {
          user_id: userId,
          component: 'AgentController.getAgentStatus'
        });
        res.json({
          ...localStatus,
          container_status: 'not_configured'
        });
      }

    } catch (error) {
      errorLogger.agentError(req.userId, 'status', error, {
        error_type: error.constructor.name,
        error_message: error.message,
        error_stack: error.stack,
        component: 'AgentController.getAgentStatus'
      });
      res.status(500).json({ error: 'Failed to get agent status' });
    }
  }

  // Get agent statistics
  async getAgentStats(req, res) {
    try {
      errorLogger.debug('Agent stats request initiated', {
        user_id: req.userId,
        component: 'AgentController.getAgentStats'
      });

      const stats = await this.agentManager.getAgentStats();
      
      errorLogger.debug('Agent stats retrieved successfully', {
        user_id: req.userId,
        active_agents: stats.active_agents,
        total_agents: stats.total_agents,
        component: 'AgentController.getAgentStats'
      });

      res.json(stats);
    } catch (error) {
      errorLogger.error('Failed to get agent stats', error, {
        user_id: req.userId,
        error_type: error.constructor.name,
        component: 'AgentController.getAgentStats'
      });
      res.status(500).json({ error: 'Failed to get agent statistics' });
    }
  }

  // Legacy endpoints (with deprecation warnings)
  async legacyStartAgent(req, res) {
    errorLogger.warn('DEPRECATED: Use /api/agent/start instead of /agent/start', {
      user_id: req.userId
    });
    
    // Add deprecation header
    res.setHeader('X-Deprecated-Endpoint', '/agent/start');
    res.setHeader('X-New-Endpoint', '/api/agent/start');
    
    return this.startAgent(req, res);
  }

  async legacyStopAgent(req, res) {
    errorLogger.warn('DEPRECATED: Use /api/agent/stop instead of /agent/stop', {
      user_id: req.userId
    });
    
    res.setHeader('X-Deprecated-Endpoint', '/agent/stop');
    res.setHeader('X-New-Endpoint', '/api/agent/stop');
    
    return this.stopAgent(req, res);
  }

  async legacyGetAgentStatus(req, res) {
    errorLogger.warn('DEPRECATED: Use /api/agent/status instead of /agent/status', {
      user_id: req.userId
    });
    
    res.setHeader('X-Deprecated-Endpoint', '/agent/status');
    res.setHeader('X-New-Endpoint', '/api/agent/status');
    
    return this.getAgentStatus(req, res);
  }

  async legacyChat(req, res) {
    errorLogger.warn('DEPRECATED: Use /api/chat instead of /chat', {
      user_id: req.userId
    });
    
    res.setHeader('X-Deprecated-Endpoint', '/chat');
    res.setHeader('X-New-Endpoint', '/api/chat');
    
    // Legacy chat implementation (simplified)
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // This is a simplified legacy response
      res.json({
        response: 'Legacy chat endpoint. Please use /api/chat for full TxAgent functionality.',
        sources: [],
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      errorLogger.error('Legacy chat error', error, { user_id: req.userId });
      res.status(500).json({ error: 'Chat processing failed' });
    }
  }
}

export const agentController = new AgentController();