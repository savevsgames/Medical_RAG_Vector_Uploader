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
      // The auth middleware should have already validated the token
      // and set req.userId
      if (!req.userId) {
        errorLogger.warn('No user ID found in request', {
          component: 'AgentRouter',
          path: req.path,
          method: req.method
        });
        return res.status(401).json({ error: 'Authentication required' });
      }
      next();
    } catch (error) {
      errorLogger.error('Failed to extract user ID', error, {
        component: 'AgentRouter'
      });
      res.status(401).json({ error: 'Invalid authentication' });
    }
  };

  // Apply user ID extraction to all routes
  router.use(extractUserId);

  // Start agent session
  router.post('/start', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent start request received', {
        userId,
        component: 'AgentRouter'
      });

      // Check if there's already an active session
      const existingSession = await agentService.getActiveSession(userId);
      
      if (existingSession) {
        errorLogger.info('Existing active session found', {
          userId,
          existingAgentId: existingSession.id,
          existingStatus: existingSession.status,
          component: 'AgentRouter'
        });

        // Return existing session info
        return res.json({
          status: 'already_active',
          agent_id: existingSession.id,
          message: 'Agent session is already active',
          session_data: existingSession.session_data,
          processing_time_ms: Date.now() - startTime
        });
      }

      // Create new session using SECURITY DEFINER function
      const newSession = await agentService.createSession(userId, {
        started_at: new Date().toISOString(),
        runpod_endpoint: process.env.RUNPOD_EMBEDDING_URL,
        capabilities: ['chat', 'embed', 'health_check']
      });

      errorLogger.success('Agent session started successfully', {
        userId,
        agentId: newSession.id,
        status: newSession.status,
        processing_time_ms: Date.now() - startTime,
        component: 'AgentRouter'
      });

      res.json({
        status: 'activated',
        agent_id: newSession.id,
        container_id: newSession.id, // For backward compatibility
        message: 'Agent session activated successfully',
        session_data: newSession.session_data,
        processing_time_ms: Date.now() - startTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Failed to start agent session', error, {
        userId: req.userId,
        processing_time_ms: processingTime,
        error_stack: error.stack,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to start agent session',
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  // Stop agent session
  router.post('/stop', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.userId;
      
      errorLogger.info('Agent stop request received', {
        userId,
        component: 'AgentRouter'
      });

      // Terminate session using SECURITY DEFINER function
      const result = await agentService.terminateSession(userId);

      errorLogger.success('Agent session stopped successfully', {
        userId,
        terminated: result.terminated,
        processing_time_ms: Date.now() - startTime,
        component: 'AgentRouter'
      });

      res.json({
        status: 'deactivated',
        message: 'Agent session deactivated successfully',
        terminated: result.terminated,
        processing_time_ms: Date.now() - startTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Failed to stop agent session', error, {
        userId: req.userId,
        processing_time_ms: processingTime,
        error_stack: error.stack,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to stop agent session',
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  // Get agent status
  router.get('/status', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.userId;
      
      errorLogger.debug('Agent status request received', {
        userId,
        component: 'AgentRouter'
      });

      // Get session status using SECURITY DEFINER functions
      const status = await agentService.getSessionStatus(userId);

      errorLogger.debug('Agent status retrieved successfully', {
        userId,
        agent_active: status.agent_active,
        agent_id: status.agent_id,
        container_status: status.container_status,
        processing_time_ms: Date.now() - startTime,
        component: 'AgentRouter'
      });

      res.json({
        ...status,
        processing_time_ms: Date.now() - startTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Failed to get agent status', error, {
        userId: req.userId,
        processing_time_ms: processingTime,
        error_stack: error.stack,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to get agent status',
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  // Update agent last active (for heartbeat)
  router.post('/heartbeat', async (req, res) => {
    try {
      const userId = req.userId;
      
      // Get active session first
      const activeSession = await agentService.getActiveSession(userId);
      
      if (!activeSession) {
        return res.status(404).json({
          error: 'No active agent session found'
        });
      }

      // Update last active using SECURITY DEFINER function
      await agentService.updateLastActive(activeSession.id);

      res.json({
        status: 'updated',
        agent_id: activeSession.id,
        last_active: new Date().toISOString()
      });

    } catch (error) {
      errorLogger.error('Failed to update agent heartbeat', error, {
        userId: req.userId,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to update agent heartbeat',
        details: error.message
      });
    }
  });

  // Cleanup stale sessions (admin endpoint)
  router.post('/cleanup', async (req, res) => {
    try {
      errorLogger.info('Agent cleanup request received', {
        userId: req.userId,
        component: 'AgentRouter'
      });

      // Cleanup stale sessions using SECURITY DEFINER function
      const result = await agentService.cleanupStaleSessions();

      res.json({
        status: 'completed',
        cleaned_count: result.cleanedCount,
        message: `Cleaned up ${result.cleanedCount} stale agent sessions`
      });

    } catch (error) {
      errorLogger.error('Failed to cleanup stale sessions', error, {
        userId: req.userId,
        component: 'AgentRouter'
      });

      res.status(500).json({
        error: 'Failed to cleanup stale sessions',
        details: error.message
      });
    }
  });

  return router;
}

// Legacy router for backward compatibility
export function createAgentLegacyRouter(supabaseClient) {
  const router = express.Router();
  
  // Add deprecation warning middleware
  router.use((req, res, next) => {
    errorLogger.warn('Legacy agent endpoint accessed', {
      path: req.path,
      method: req.method,
      user_agent: req.get('User-Agent'),
      component: 'AgentLegacyRouter'
    });
    
    // Add deprecation header
    res.set('X-API-Deprecated', 'true');
    res.set('X-API-Deprecation-Info', 'Use /api/agent/* endpoints instead');
    
    next();
  });

  // Mount the new router under legacy paths
  const newRouter = createAgentRouter(supabaseClient);
  router.use('/', newRouter);

  return router;
}