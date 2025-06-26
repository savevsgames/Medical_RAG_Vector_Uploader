import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';
import { ConversationSessionService } from '../services/ConversationSessionService.js';

export function createConversationWebSocketRouter(supabaseClient) {
  const router = express.Router();
  router.use(verifyToken);

  const sessionService = new ConversationSessionService(supabaseClient);

  /**
   * Initialize a new conversation session
   * POST /api/conversation/start
   */
  router.post('/conversation/start', async (req, res) => {
    const startTime = Date.now();
    const userId = req.userId;

    try {
      const { 
        medical_profile = {}, 
        initial_context = {},
        session_type = 'voice_conversation'
      } = req.body;

      errorLogger.info('Starting new conversation session', {
        userId,
        sessionType: session_type,
        hasMedicalProfile: Object.keys(medical_profile).length > 0,
        hasInitialContext: Object.keys(initial_context).length > 0,
        component: 'ConversationWebSocket'
      });

      // Create new conversation session
      const session = await sessionService.createSession(
        userId, 
        medical_profile, 
        {
          ...initial_context,
          session_type,
          client_info: {
            user_agent: req.get('User-Agent'),
            ip: req.ip
          }
        }
      );

      // Generate WebSocket URL
      const websocketUrl = `${process.env.WEBSOCKET_BASE_URL || 'ws://localhost:8000'}/conversation/stream/${session.id}`;

      const response = {
        session_id: session.id,
        websocket_url: websocketUrl,
        status: 'connected',
        medical_profile: session.medical_profile,
        session_metadata: session.session_metadata,
        processing_time_ms: Date.now() - startTime
      };

      errorLogger.success('Conversation session initialized successfully', {
        userId,
        sessionId: session.id,
        websocketUrl,
        processingTime: Date.now() - startTime,
        component: 'ConversationWebSocket'
      });

      res.json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      errorLogger.error('Failed to start conversation session', error, {
        userId,
        processingTime,
        error_message: errorMessage,
        component: 'ConversationWebSocket'
      });

      res.status(500).json({
        error: 'Failed to start conversation session',
        details: errorMessage,
        processing_time_ms: processingTime
      });
    }
  });

  /**
   * Get conversation session status
   * GET /api/conversation/:sessionId/status
   */
  router.get('/conversation/:sessionId/status', async (req, res) => {
    const userId = req.userId;
    const { sessionId } = req.params;

    try {
      const session = await sessionService.getSession(sessionId, userId);

      const response = {
        session_id: session.id,
        status: session.status,
        created_at: session.created_at,
        updated_at: session.updated_at,
        ended_at: session.ended_at,
        message_count: session.conversation_history?.length || 0,
        medical_profile: session.medical_profile
      };

      res.json(response);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      errorLogger.error('Failed to get conversation session status', error, {
        userId,
        sessionId,
        error_message: errorMessage,
        component: 'ConversationWebSocket'
      });

      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Session not found',
          details: errorMessage
        });
      } else {
        res.status(500).json({
          error: 'Failed to get session status',
          details: errorMessage
        });
      }
    }
  });

  /**
   * End conversation session
   * POST /api/conversation/:sessionId/end
   */
  router.post('/conversation/:sessionId/end', async (req, res) => {
    const userId = req.userId;
    const { sessionId } = req.params;

    try {
      const session = await sessionService.updateStatus(sessionId, userId, 'ended');

      errorLogger.info('Conversation session ended', {
        userId,
        sessionId,
        duration: session.ended_at ? 
          new Date(session.ended_at) - new Date(session.created_at) : null,
        messageCount: session.conversation_history?.length || 0,
        component: 'ConversationWebSocket'
      });

      res.json({
        session_id: session.id,
        status: session.status,
        ended_at: session.ended_at,
        message_count: session.conversation_history?.length || 0
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      errorLogger.error('Failed to end conversation session', error, {
        userId,
        sessionId,
        error_message: errorMessage,
        component: 'ConversationWebSocket'
      });

      res.status(500).json({
        error: 'Failed to end session',
        details: errorMessage
      });
    }
  });

  /**
   * Get user's active conversation sessions
   * GET /api/conversation/active
   */
  router.get('/conversation/active', async (req, res) => {
    const userId = req.userId;

    try {
      const sessions = await sessionService.getActiveSessions(userId);

      res.json({
        active_sessions: sessions,
        count: sessions.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      errorLogger.error('Failed to get active conversation sessions', error, {
        userId,
        error_message: errorMessage,
        component: 'ConversationWebSocket'
      });

      res.status(500).json({
        error: 'Failed to get active sessions',
        details: errorMessage
      });
    }
  });

  return router;
}