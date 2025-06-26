/**
 * Conversation Session Model
 * Represents a real-time conversation session between a user and the AI
 */
export class ConversationSession {
  /**
   * Create a new conversation session
   * @param {string} id - Session ID
   * @param {string} userId - User ID
   * @param {Object} medicalProfile - User's medical profile
   * @param {Object} metadata - Additional session metadata
   */
  constructor(id, userId, medicalProfile = {}, metadata = {}) {
    this.id = id;
    this.userId = userId;
    this.medicalProfile = medicalProfile;
    this.conversationHistory = [];
    this.status = 'active';
    this.sessionMetadata = {
      ...metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Add a message to the conversation history
   * @param {Object} message - Message to add
   */
  addMessage(message) {
    const formattedMessage = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...message
    };

    this.conversationHistory.push(formattedMessage);
    this.sessionMetadata.updated_at = new Date().toISOString();
    
    return formattedMessage;
  }

  /**
   * Update session status
   * @param {string} status - New status (active, paused, ended)
   */
  updateStatus(status) {
    if (!['active', 'paused', 'ended'].includes(status)) {
      throw new Error('Invalid session status');
    }

    this.status = status;
    this.sessionMetadata.updated_at = new Date().toISOString();
    
    if (status === 'ended') {
      this.sessionMetadata.ended_at = new Date().toISOString();
    }
  }

  /**
   * Get recent conversation history
   * @param {number} count - Number of recent messages to retrieve
   * @returns {Array} - Recent messages
   */
  getRecentHistory(count = 5) {
    return this.conversationHistory.slice(-count);
  }

  /**
   * Get session duration in seconds
   * @returns {number} - Duration in seconds
   */
  getDuration() {
    const startTime = new Date(this.sessionMetadata.created_at);
    const endTime = this.sessionMetadata.ended_at ? 
      new Date(this.sessionMetadata.ended_at) : new Date();
    
    return Math.floor((endTime - startTime) / 1000);
  }

  /**
   * Convert to database format
   * @returns {Object} - Database representation
   */
  toDatabase() {
    return {
      id: this.id,
      user_id: this.userId,
      medical_profile: this.medicalProfile,
      conversation_history: this.conversationHistory,
      status: this.status,
      session_metadata: this.sessionMetadata,
      created_at: this.sessionMetadata.created_at,
      updated_at: this.sessionMetadata.updated_at,
      ended_at: this.sessionMetadata.ended_at
    };
  }

  /**
   * Create from database record
   * @param {Object} record - Database record
   * @returns {ConversationSession} - Conversation session instance
   */
  static fromDatabase(record) {
    const session = new ConversationSession(
      record.id,
      record.user_id,
      record.medical_profile,
      record.session_metadata
    );
    
    session.conversationHistory = record.conversation_history || [];
    session.status = record.status;
    
    if (record.session_metadata) {
      session.sessionMetadata = record.session_metadata;
    }
    
    return session;
  }
}