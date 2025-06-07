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
    this.router.post('/start', agentMiddleware.validateRunPodConfig, this.startAgent.bind(this));
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

  // New API: Start TxAgent container
  async startAgent(req, res) {
    try {
      const userId = req.userId;
      const { RUNPOD_EMBEDDING_URL, RUNPOD_EMBEDDING_KEY } = process.env;

      errorLogger.info('Starting TxAgent container', { user_id: userId });

      // Check if user already has an active agent
      const existingStatus = await this.agentManager.getAgentStatus(userId);
      if (existingStatus.agent_active) {
        errorLogger.info('Agent already active for user', {
          user_id: userId,
          agent_id: existingStatus.agent_id
        });
        
        return res.json({
          agent_id: existingStatus.agent_id,
          status: 'already_running',
          message: 'TxAgent container is already active'
        });
      }

      // Start container via RunPod
      const response = await axios.post(
        `${RUNPOD_EMBEDDING_URL}/agent/start`,
        { 
          user_id: userId,
          config: {
            memory_limit: '2GB',
            timeout: 3600, // 1 hour
            capabilities: ['embedding', 'chat', 'document_analysis']
          }
        },
        { 
          headers: { 
            'Authorization': `Bearer ${RUNPOD_EMBEDDING_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      // Create agent session in database
      await this.agentManager.createAgentSession(userId, {
        container_id: response.data.container_id,
        endpoint_url: response.data.endpoint_url
      });

      res.json({
        agent_id: response.data.container_id,
        endpoint_url: response.data.endpoint_url,
        status: 'started',
        message: 'TxAgent container initialized successfully'
      });

    } catch (error) {
      errorLogger.agentError(req.userId, 'start', error);
      
      if (error.code === 'ECONNABORTED') {
        return res.status(504).json({ 
          error: 'TxAgent startup timeout',
          details: 'Container is taking longer than expected to start'
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to start TxAgent container',
        details: error.response?.data?.error || error.message
      });
    }
  }

  // New API: Stop TxAgent container
  async stopAgent(req, res) {
    try {
      const userId = req.userId;
      const { RUNPOD_EMBEDDING_URL, RUNPOD_EMBEDDING_KEY } = process.env;

      if (!RUNPOD_EMBEDDING_URL || !RUNPOD_EMBEDDING_KEY) {
        return res.status(503).json({ error: 'RunPod service not configured' });
      }

      errorLogger.info('Stopping TxAgent container', { user_id: userId });

      // Stop container via RunPod
      const response = await axios.post(
        `${RUNPOD_EMBEDDING_URL}/agent/stop`,
        { user_id: userId },
        { 
          headers: { 
            'Authorization': `Bearer ${RUNPOD_EMBEDDING_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      // Update agent session in database
      await this.agentManager.terminateAgentSession(userId);

      res.json({
        status: 'stopped',
        message: 'TxAgent container terminated successfully'
      });

    } catch (error) {
      errorLogger.agentError(req.userId, 'stop', error);
      res.status(500).json({ 
        error: 'Failed to stop TxAgent container',
        details: error.response?.data?.error || error.message
      });
    }
  }

  // New API: Get agent status with RunPod health check
  async getAgentStatus(req, res) {
    try {
      const userId = req.userId;
      
      // Get local database status
      const localStatus = await this.agentManager.getAgentStatus(userId);
      
      if (!localStatus.agent_active) {
        return res.json({
          ...localStatus,
          container_status: 'not_found'
        });
      }

      // Check RunPod container status if configured
      if (process.env.RUNPOD_EMBEDDING_URL && process.env.RUNPOD_EMBEDDING_KEY) {
        try {
          const response = await axios.get(
            `${process.env.RUNPOD_EMBEDDING_URL}/agent/status`,
            { 
              headers: { 
                'Authorization': `Bearer ${process.env.RUNPOD_EMBEDDING_KEY}`
              },
              params: { user_id: userId },
              timeout: 10000
            }
          );

          res.json({
            ...localStatus,
            container_status: response.data.status,
            container_health: response.data.health
          });

        } catch (runpodError) {
          errorLogger.warn('RunPod status check failed', {
            user_id: userId,
            error: runpodError.message
          });
          
          res.json({
            ...localStatus,
            container_status: 'unknown'
          });
        }
      } else {
        res.json({
          ...localStatus,
          container_status: 'local_only'
        });
      }

    } catch (error) {
      errorLogger.agentError(req.userId, 'status', error);
      res.status(500).json({ error: 'Failed to get agent status' });
    }
  }

  // Get agent statistics
  async getAgentStats(req, res) {
    try {
      const stats = await this.agentManager.getAgentStats();
      res.json(stats);
    } catch (error) {
      errorLogger.error('Failed to get agent stats', error);
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