import { errorLogger } from '../agent_utils/shared/logger.js';

export class ConversationSessionService {
  constructor(supabaseClient) {
    this.supabaseClient = supabaseClient;
  }

  /**
   * Create a new conversation session
   * @param {string} userId - User ID
   * @param {Object} medicalProfile - User's medical profile
   * @param {Object} initialContext - Initial conversation context
   * @returns {Promise<Object>} - Created session data
   */
  async createSession(userId, medicalProfile = {}, initialContext = {}) {
    try {
      const sessionId = `conv-${Date.now()}-${userId.substring(0, 8)}`;
      
      const sessionData = {
        id: sessionId,
        user_id: userId,
        medical_profile: medicalProfile,
        conversation_history: [],
        status: 'active',
        session_metadata: {
          ...initialContext,
          created_by: 'conversational_ai',
          version: '1.0.0'
        }
      };

      errorLogger.info('Creating new conversation session', {
        sessionId,
        userId,
        hasMedicalProfile: Object.keys(medicalProfile).length > 0,
        component: 'ConversationSessionService'
      });

      const { data, error } = await this.supabaseClient
        .from('conversation_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      errorLogger.success('Conversation session created successfully', {
        sessionId,
        userId,
        component: 'ConversationSessionService'
      });

      return data;

    } catch (error) {
      errorLogger.error('Failed to create conversation session', error, {
        userId,
        component: 'ConversationSessionService'
      });
      throw new Error(`Session creation failed: ${error.message}`);
    }
  }

  /**
   * Get conversation session by ID
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID for security check
   * @returns {Promise<Object>} - Session data
   */
  async getSession(sessionId, userId) {
    try {
      errorLogger.debug('Retrieving conversation session', {
        sessionId,
        userId,
        component: 'ConversationSessionService'
      });

      const { data, error } = await this.supabaseClient
        .from('conversation_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Session not found or access denied');
        }
        throw error;
      }

      return data;

    } catch (error) {
      errorLogger.error('Failed to retrieve conversation session', error, {
        sessionId,
        userId,
        component: 'ConversationSessionService'
      });
      throw error;
    }
  }

  /**
   * Update conversation history
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID for security check
   * @param {Object} message - New message to add
   * @returns {Promise<Object>} - Updated session data
   */
  async addMessage(sessionId, userId, message) {
    try {
      const session = await this.getSession(sessionId, userId);
      
      const newMessage = {
        id: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...message
      };

      const updatedHistory = [...(session.conversation_history || []), newMessage];

      errorLogger.debug('Adding message to conversation session', {
        sessionId,
        userId,
        messageType: message.type,
        historyLength: updatedHistory.length,
        component: 'ConversationSessionService'
      });

      const { data, error } = await this.supabaseClient
        .from('conversation_sessions')
        .update({
          conversation_history: updatedHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      errorLogger.error('Failed to add message to conversation session', error, {
        sessionId,
        userId,
        messageType: message?.type,
        component: 'ConversationSessionService'
      });
      throw error;
    }
  }

  /**
   * Update session status
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID for security check
   * @param {string} status - New status (active, paused, ended)
   * @returns {Promise<Object>} - Updated session data
   */
  async updateStatus(sessionId, userId, status) {
    try {
      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'ended') {
        updateData.ended_at = new Date().toISOString();
      }

      errorLogger.info('Updating conversation session status', {
        sessionId,
        userId,
        newStatus: status,
        component: 'ConversationSessionService'
      });

      const { data, error } = await this.supabaseClient
        .from('conversation_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      errorLogger.error('Failed to update conversation session status', error, {
        sessionId,
        userId,
        status,
        component: 'ConversationSessionService'
      });
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of active sessions
   */
  async getActiveSessions(userId) {
    try {
      const { data, error } = await this.supabaseClient
        .from('conversation_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];

    } catch (error) {
      errorLogger.error('Failed to get active conversation sessions', error, {
        userId,
        component: 'ConversationSessionService'
      });
      throw error;
    }
  }

  /**
   * Clean up old sessions (older than 24 hours and ended)
   * @returns {Promise<number>} - Number of sessions cleaned up
   */
  async cleanupOldSessions() {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabaseClient
        .from('conversation_sessions')
        .delete()
        .eq('status', 'ended')
        .lt('ended_at', cutoffTime)
        .select('id');

      if (error) {
        throw error;
      }

      const cleanedCount = data?.length || 0;

      errorLogger.info('Cleaned up old conversation sessions', {
        cleanedCount,
        cutoffTime,
        component: 'ConversationSessionService'
      });

      return cleanedCount;

    } catch (error) {
      errorLogger.error('Failed to cleanup old conversation sessions', error, {
        component: 'ConversationSessionService'
      });
      throw error;
    }
  }
}