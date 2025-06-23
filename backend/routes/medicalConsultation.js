import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';
import { AgentService } from '../agent_utils/core/agentService.js';

export function createMedicalConsultationRouter(supabaseClient) {
  const router = express.Router();
  router.use(verifyToken);
  
  const agentService = new AgentService(supabaseClient);

  // Emergency keywords for Phase 1
  const emergencyKeywords = [
    'chest pain', 'difficulty breathing', 'severe bleeding', 'unconscious',
    'heart attack', 'stroke', 'seizure', 'severe allergic reaction',
    'suicidal thoughts', 'overdose', 'can\'t breathe', 'choking',
    'severe headache', 'loss of consciousness', 'severe abdominal pain',
    'severe burns', 'poisoning', 'drug overdose', 'suicide', 'kill myself'
  ];

  const detectEmergency = (text) => {
    const lowerText = text.toLowerCase();
    const detectedKeywords = emergencyKeywords.filter(keyword =>
      lowerText.includes(keyword)
    );
    
    return {
      isEmergency: detectedKeywords.length > 0,
      confidence: detectedKeywords.length > 0 ? 'high' : 'low',
      detectedKeywords
    };
  };

  router.post('/medical-consultation', async (req, res) => {
    const startTime = Date.now();
    let userId = req.userId;

    try {
      const { query, context, session_id } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          error: 'Query is required and must be a string',
          code: 'INVALID_QUERY'
        });
      }

      errorLogger.info('Medical consultation request started', {
        userId,
        queryLength: query.length,
        queryPreview: query.substring(0, 100),
        hasContext: !!context,
        sessionId: session_id,
        component: 'MedicalConsultation'
      });

      // Phase 1: Emergency Detection
      const emergencyCheck = detectEmergency(query);
      
      if (emergencyCheck.isEmergency) {
        errorLogger.warn('Emergency detected in consultation', {
          userId,
          detectedKeywords: emergencyCheck.detectedKeywords,
          query: query.substring(0, 200),
          component: 'MedicalConsultation'
        });

        // Log emergency consultation
        await supabaseClient
          .from('medical_consultations')
          .insert({
            user_id: userId,
            session_id: session_id || 'emergency-session',
            query: query,
            response: 'Emergency detected - immediate medical attention recommended',
            emergency_detected: true,
            consultation_type: 'emergency_detection',
            processing_time: Date.now() - startTime,
            context_used: { emergency_keywords: emergencyCheck.detectedKeywords }
          });

        return res.json({
          response: {
            text: 'I\'ve detected that you may be experiencing a medical emergency. Please contact emergency services immediately (call 911) or go to the nearest emergency room. This system cannot provide emergency medical care.',
            confidence_score: 0.95
          },
          safety: {
            emergency_detected: true,
            disclaimer: 'This is not a substitute for professional medical advice. In case of emergency, contact emergency services immediately.',
            urgent_care_recommended: true
          },
          recommendations: {
            suggested_action: 'Contact emergency services immediately (911)',
            follow_up_questions: []
          },
          processing_time_ms: Date.now() - startTime,
          session_id: session_id || 'emergency-session'
        });
      }

      // Phase 1: Get active agent for TxAgent communication
      const agent = await agentService.getActiveAgent(userId);
      
      if (!agent || !agent.session_data?.runpod_endpoint) {
        errorLogger.warn('No active TxAgent found for consultation', {
          userId,
          hasAgent: !!agent,
          component: 'MedicalConsultation'
        });

        return res.status(503).json({
          error: 'Medical AI service is not available. Please ensure TxAgent is running.',
          code: 'SERVICE_UNAVAILABLE'
        });
      }

      // Phase 1: Call TxAgent chat endpoint
      const txAgentUrl = `${agent.session_data.runpod_endpoint}/chat`;
      
      errorLogger.info('Calling TxAgent for consultation', {
        userId,
        txAgentUrl,
        agentId: agent.id,
        component: 'MedicalConsultation'
      });

      const txAgentResponse = await fetch(txAgentUrl, {
        method: 'POST',
        headers: {
          'Authorization': req.headers.authorization,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: query,
          history: context?.conversation_history || [],
          top_k: 5,
          temperature: 0.7,
          stream: false
        }),
        signal: AbortSignal.timeout(parseInt(process.env.TXAGENT_TIMEOUT) || 30000)
      });

      if (!txAgentResponse.ok) {
        const errorText = await txAgentResponse.text();
        throw new Error(`TxAgent responded with status ${txAgentResponse.status}: ${errorText}`);
      }

      const txAgentData = await txAgentResponse.json();

      // Phase 1: Log successful consultation
      const consultationRecord = {
        user_id: userId,
        session_id: session_id || agent.id,
        query: query,
        response: txAgentData.response,
        sources: txAgentData.sources || [],
        consultation_type: 'ai_consultation',
        processing_time: Date.now() - startTime,
        emergency_detected: false,
        context_used: {
          agent_id: agent.id,
          sources_count: txAgentData.sources?.length || 0
        },
        confidence_score: txAgentData.confidence_score || null,
        recommendations: {
          suggested_action: 'Consult with healthcare provider for personalized advice',
          follow_up_questions: []
        }
      };

      await supabaseClient
        .from('medical_consultations')
        .insert(consultationRecord);

      errorLogger.info('Medical consultation completed successfully', {
        userId,
        processingTime: Date.now() - startTime,
        sourcesCount: txAgentData.sources?.length || 0,
        agentId: agent.id,
        component: 'MedicalConsultation'
      });

      // Phase 1: Return response
      res.json({
        response: {
          text: txAgentData.response,
          sources: txAgentData.sources || [],
          confidence_score: txAgentData.confidence_score
        },
        safety: {
          emergency_detected: false,
          disclaimer: 'This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment.',
          urgent_care_recommended: false
        },
        recommendations: consultationRecord.recommendations,
        processing_time_ms: Date.now() - startTime,
        session_id: session_id || agent.id
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Medical consultation failed', error, {
        userId,
        processingTime,
        query: req.body.query?.substring(0, 100),
        component: 'MedicalConsultation'
      });

      res.status(500).json({
        error: 'Medical consultation failed. Please try again.',
        code: 'CONSULTATION_FAILED',
        processing_time_ms: processingTime
      });
    }
  });

  return router;
}