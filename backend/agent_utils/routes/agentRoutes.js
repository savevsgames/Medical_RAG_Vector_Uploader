import express from 'express';
import { AgentService } from '../core/agentService.js';
import { verifyToken } from '../../middleware/auth.js';
import { errorLogger } from '../shared/logger.js';

const router = express.Router();
const legacyRouter = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
legacyRouter.use(verifyToken);

// Create a single instance of AgentService for this router
const agentService = new AgentService();

// Status endpoint
router.get('/status', async (req, res) => {
  try {
    const userId = req.userId;
    errorLogger.info('Agent status requested', { 
      user_id: userId, 
      component: 'AgentRoutes' 
    });

    const status = await agentService.getActiveAgent(userId);
    
    errorLogger.debug('Agent status retrieved', {
      user_id: userId,
      status,
      component: 'AgentRoutes'
    });

    res.json(status);
  } catch (error) {
    errorLogger.error('Failed to get agent status', error, {
      user_id: req.userId,
      error_message: error.message,
      error_stack: error.stack,
      component: 'AgentRoutes'
    });
    res.status(500).json({ 
      error: 'Failed to retrieve agent status', 
      details: error.message 
    });
  }
});

// Start agent endpoint
router.post('/start', async (req, res) => {
  try {
    const userId = req.userId;
    errorLogger.info('Agent start requested', { 
      user_id: userId, 
      component: 'AgentRoutes' 
    });

    const result = await agentService.startAgent(userId);
    
    errorLogger.success('Agent start completed', {
      user_id: userId,
      result,
      component: 'AgentRoutes'
    });

    res.json({
      message: result.message || 'Agent started successfully',
      agent_id: result.id,
      status: result.status,
      container_id: result.container_id
    });
  } catch (error) {
    errorLogger.error('Failed to start agent', error, {
      user_id: req.userId,
      error_message: error.message,
      error_stack: error.stack,
      component: 'AgentRoutes'
    });
    res.status(500).json({ 
      error: 'Failed to start agent', 
      details: error.message 
    });
  }
});

// Stop agent endpoint
router.post('/stop', async (req, res) => {
  try {
    const userId = req.userId;
    errorLogger.info('Agent stop requested', { 
      user_id: userId, 
      component: 'AgentRoutes' 
    });

    const result = await agentService.stopAgent(userId);
    
    errorLogger.success('Agent stop completed', {
      user_id: userId,
      result,
      component: 'AgentRoutes'
    });

    res.json({
      message: result.message || 'Agent stopped successfully',
      agent_id: result.id,
      status: result.status
    });
  } catch (error) {
    errorLogger.error('Failed to stop agent', error, {
      user_id: req.userId,
      error_message: error.message,
      error_stack: error.stack,
      component: 'AgentRoutes'
    });
    res.status(500).json({ 
      error: 'Failed to stop agent', 
      details: error.message 
    });
  }
});

// Legacy router for backward compatibility
legacyRouter.get('/status', async (req, res) => {
  errorLogger.warn('Legacy /agent/status endpoint accessed', { 
    user_id: req.userId,
    component: 'AgentRoutes'
  });
  // Forward to new router
  router.handle(req, res);
});

legacyRouter.post('/start', async (req, res) => {
  errorLogger.warn('Legacy /agent/start endpoint accessed', { 
    user_id: req.userId,
    component: 'AgentRoutes'
  });
  // Forward to new router
  router.handle(req, res);
});

legacyRouter.post('/stop', async (req, res) => {
  errorLogger.warn('Legacy /agent/stop endpoint accessed', { 
    user_id: req.userId,
    component: 'AgentRoutes'
  });
  // Forward to new router
  router.handle(req, res);
});

export { router, legacyRouter };