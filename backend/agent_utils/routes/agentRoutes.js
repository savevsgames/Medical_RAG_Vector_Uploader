import express from 'express';
import { AgentService } from '../core/agentService.js';
import { errorLogger } from '../shared/logger.js';

export function createAgentRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to createAgentRouter');
  }

  const router = express.Router();
  const agentService = new AgentService(supabaseClient);

  // Middleware to extract user ID from JWT
  const extractUserId = (req, res, next) => {
    try {
      // Extract user ID from the JWT token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No authorization token provided' });
      }

      const token = authHeader.substring(7);
      
      // Decode JWT to get user ID (basic decode, validation happens in Supabase)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      req.userId = payload.sub;

      if (!req.userId) {
        return res.status(401).json({ error: 'Invalid token: no user ID found' });
      }

      next();
    } catch (error) {
      errorLogger.error('Failed to extract user ID from token', error, {
        component: 'AgentRouter'
      });
      return res.status(401).json({ error: 'Invalid authorization token' });
    }
  };

  // Apply user ID extraction to all routes
  router.use(extractUserId);

  /**
   * POST /api/agent/start - Start/Activate TxAgent session
   */
  router.post('/start', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent start request received', {
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100),
        component: 'AgentRouter'
      });

      // Check if user already has an active agent
      const existingAgent = await agentService.getActiveAgent(userId);
      
      if (existingAgent) {
        errorLogger.info('User already has active agent, updating status', {
          userId,
          existingAgentId: existingAgent.agent_id,
          component: 'AgentRouter'
        });

        // Update the existing agent's last active timestamp
        await agentService.updateAgentLastActive(existingAgent.agent_id);

        return res.json({
          status: 'already_active',
          message: 'TxAgent session is already active',
          agent_id: existingAgent.agent_id,
          session_data: existingAgent.session_data,
          processing_time_ms: Date.now() - startTime
        });
      }

      // Create new agent session with enhanced session data
      const sessionData = {
        started_at: new Date().toISOString(),
        user_agent: req.get('User-Agent'),
        ip_address: req.ip,
        capabilities: ['chat', 'embed', 'document_search'],
        runpod_endpoint: process.env.RUNPOD_EMBEDDING_URL || null,
        backend_version: '1.0.0'
      };

      const newAgent = await agentService.createAgentSession(userId, 'active', sessionData);

      errorLogger.success('Agent session created successfully', {
        userId,
        agentId: newAgent.agent_id,
        processingTime: Date.now() - startTime,
        component: 'AgentRouter'
      });

      res.json({
        status: 'activated',
        message: 'TxAgent session activated successfully',
        agent_id: newAgent.agent_id,
        session_data: newAgent.session_data,
        created_at: newAgent.created_at,
        processing_time_ms: Date.now() - startTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Agent start request failed', error, {
        userId: req.userId,
        processingTime,
        errorStack: error.stack,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to start TxAgent session',
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  /**
   * POST /api/agent/stop - Stop/Terminate TxAgent session
   */
  router.post('/stop', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent stop request received', {
        userId,
        component: 'AgentRouter'
      });

      const success = await agentService.terminateAgentSession(userId);

      if (success) {
        errorLogger.success('Agent session terminated successfully', {
          userId,
          processingTime: Date.now() - startTime,
          component: 'AgentRouter'
        });

        res.json({
          status: 'terminated',
          message: 'TxAgent session terminated successfully',
          processing_time_ms: Date.now() - startTime
        });
      } else {
        errorLogger.warn('No active agent session found to terminate', {
          userId,
          component: 'AgentRouter'
        });

        res.json({
          status: 'not_active',
          message: 'No active TxAgent session found',
          processing_time_ms: Date.now() - startTime
        });
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Agent stop request failed', error, {
        userId: req.userId,
        processingTime,
        errorStack: error.stack,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to stop TxAgent session',
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  /**
   * GET /api/agent/status - Get TxAgent session status
   */
  router.get('/status', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.userId;
      
      errorLogger.debug('Agent status request received', {
        userId,
        component: 'AgentRouter'
      });

      const status = await agentService.getAgentStatus(userId);

      errorLogger.debug('Agent status retrieved successfully', {
        userId,
        agentActive: status.agent_active,
        agentId: status.agent_id,
        processingTime: Date.now() - startTime,
        component: 'AgentRouter'
      });

      res.json({
        ...status,
        processing_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Agent status request failed', error, {
        userId: req.userId,
        processingTime,
        errorStack: error.stack,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to get TxAgent status',
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  /**
   * POST /api/agent/cleanup - Cleanup stale agent sessions (admin endpoint)
   */
  router.post('/cleanup', async (req, res) => {
    const startTime = Date.now();
    
    try {
      errorLogger.info('Agent cleanup request received', {
        userId: req.userId,
        component: 'AgentRouter'
      });

      const cleanedCount = await agentService.cleanupStaleAgents();

      errorLogger.success('Agent cleanup completed', {
        cleanedCount,
        processingTime: Date.now() - startTime,
        component: 'AgentRouter'
      });

      res.json({
        status: 'completed',
        message: `Cleaned up ${cleanedCount} stale agent sessions`,
        cleaned_count: cleanedCount,
        processing_time_ms: Date.now() - startTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Agent cleanup request failed', error, {
        userId: req.userId,
        processingTime,
        errorStack: error.stack,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to cleanup stale agents',
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  return router;
}

// Legacy router for backward compatibility (deprecated)
export function createAgentLegacyRouter(supabaseClient) {
  const router = express.Router();
  
  // Add deprecation warning middleware
  router.use((req, res, next) => {
    errorLogger.warn('Legacy agent endpoint accessed', {
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      component: 'AgentLegacyRouter'
    });
    
    // Add deprecation header
    res.set('X-API-Deprecated', 'true');
    res.set('X-API-Deprecation-Message', 'This endpoint is deprecated. Use /api/agent/* instead.');
    
    next();
  });

  // Redirect legacy routes to new API
  router.post('/start', (req, res) => {
    res.status(301).json({
      error: 'Endpoint moved',
      message: 'This endpoint has moved to /api/agent/start',
      new_endpoint: '/api/agent/start'
    });
  });

  router.post('/stop', (req, res) => {
    res.status(301).json({
      error: 'Endpoint moved',
      message: 'This endpoint has moved to /api/agent/stop',
      new_endpoint: '/api/agent/stop'
    });
  });

  router.get('/status', (req, res) => {
    res.status(301).json({
      error: 'Endpoint moved',
      message: 'This endpoint has moved to /api/agent/status',
      new_endpoint: '/api/agent/status'
    });
  });

  return router;
}