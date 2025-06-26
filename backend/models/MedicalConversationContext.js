/**
 * Medical Conversation Context Model
 * Manages the medical context for a conversation, including user profile,
 * conversation history, and relevant medical documents
 */
export class MedicalConversationContext {
  /**
   * Create a new medical conversation context
   * @param {Object} userProfile - User's medical profile
   * @param {Array} conversationHistory - Previous conversation messages
   */
  constructor(userProfile = {}, conversationHistory = []) {
    this.userProfile = userProfile;
    this.conversationHistory = conversationHistory;
    this.currentSymptoms = [];
    this.mentionedMedications = [];
    this.emergencyKeywords = [];
    this.relevantDocuments = [];
    this.riskLevel = 'low';
    this.conversationSummary = '';
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Update context with new information
   * @param {Object} updates - Context updates
   */
  update(updates) {
    Object.assign(this, updates);
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Add a symptom to current symptoms
   * @param {Object} symptom - Symptom information
   */
  addSymptom(symptom) {
    this.currentSymptoms.push({
      ...symptom,
      detected_at: new Date().toISOString()
    });
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Add a medication to mentioned medications
   * @param {Object} medication - Medication information
   */
  addMedication(medication) {
    this.mentionedMedications.push({
      ...medication,
      detected_at: new Date().toISOString()
    });
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Add relevant documents
   * @param {Array} documents - Relevant documents
   */
  addRelevantDocuments(documents) {
    this.relevantDocuments = [
      ...this.relevantDocuments,
      ...documents.map(doc => ({
        ...doc,
        added_at: new Date().toISOString()
      }))
    ];
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Update risk level based on detected keywords and symptoms
   * @param {string} level - Risk level (low, medium, high)
   * @param {Array} keywords - Detected emergency keywords
   */
  updateRiskLevel(level, keywords = []) {
    this.riskLevel = level;
    this.emergencyKeywords = keywords;
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Get context summary for AI prompt
   * @returns {string} - Formatted context summary
   */
  getContextSummary() {
    let summary = '';

    // Add user profile
    if (Object.keys(this.userProfile).length > 0) {
      summary += 'User Profile:\n';
      if (this.userProfile.age) summary += `- Age: ${this.userProfile.age}\n`;
      if (this.userProfile.gender) summary += `- Gender: ${this.userProfile.gender}\n`;
      
      if (this.userProfile.conditions && this.userProfile.conditions.length > 0) {
        summary += `- Medical Conditions: ${this.userProfile.conditions.join(', ')}\n`;
      }
      
      if (this.userProfile.medications && this.userProfile.medications.length > 0) {
        summary += `- Current Medications: ${this.userProfile.medications.join(', ')}\n`;
      }
      
      if (this.userProfile.allergies && this.userProfile.allergies.length > 0) {
        summary += `- Known Allergies: ${this.userProfile.allergies.join(', ')}\n`;
      }
      
      summary += '\n';
    }

    // Add current symptoms
    if (this.currentSymptoms.length > 0) {
      summary += 'Current Symptoms:\n';
      this.currentSymptoms.forEach(symptom => {
        summary += `- ${symptom.name}${symptom.severity ? ` (Severity: ${symptom.severity})` : ''}\n`;
      });
      summary += '\n';
    }

    // Add mentioned medications
    if (this.mentionedMedications.length > 0) {
      summary += 'Mentioned Medications:\n';
      this.mentionedMedications.forEach(med => {
        summary += `- ${med.name}${med.dosage ? ` (${med.dosage})` : ''}\n`;
      });
      summary += '\n';
    }

    // Add risk level if elevated
    if (this.riskLevel !== 'low') {
      summary += `Risk Level: ${this.riskLevel.toUpperCase()}\n`;
      if (this.emergencyKeywords.length > 0) {
        summary += `Emergency Keywords: ${this.emergencyKeywords.join(', ')}\n`;
      }
      summary += '\n';
    }

    return summary;
  }

  /**
   * Convert to database format
   * @returns {Object} - Database representation
   */
  toDatabase() {
    return {
      user_profile: this.userProfile,
      conversation_history: this.conversationHistory,
      current_symptoms: this.currentSymptoms,
      mentioned_medications: this.mentionedMedications,
      emergency_keywords: this.emergencyKeywords,
      relevant_documents: this.relevantDocuments,
      risk_level: this.riskLevel,
      conversation_summary: this.conversationSummary,
      last_updated: this.lastUpdated
    };
  }

  /**
   * Create from database record
   * @param {Object} record - Database record
   * @returns {MedicalConversationContext} - Context instance
   */
  static fromDatabase(record) {
    const context = new MedicalConversationContext(
      record.user_profile,
      record.conversation_history
    );
    
    context.currentSymptoms = record.current_symptoms || [];
    context.mentionedMedications = record.mentioned_medications || [];
    context.emergencyKeywords = record.emergency_keywords || [];
    context.relevantDocuments = record.relevant_documents || [];
    context.riskLevel = record.risk_level || 'low';
    context.conversationSummary = record.conversation_summary || '';
    context.lastUpdated = record.last_updated || new Date().toISOString();
    
    return context;
  }
}