import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';
import { AgentService } from '../agent_utils/core/agentService.js';
import axios from 'axios';

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

  // ✅ NEW: OpenAI API call function
  const callOpenAI = async (query, context, userProfile) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // Construct system prompt based on context
    let systemPrompt = `You are a helpful medical AI assistant. Provide accurate, evidence-based medical information while being clear that you are not a substitute for professional medical advice.

IMPORTANT DISCLAIMERS:
- Always remind users that this information is for educational purposes only
- Recommend consulting healthcare professionals for personalized medical advice
- Never provide emergency medical advice - direct users to emergency services for urgent situations

Guidelines:
- Be empathetic and understanding
- Use clear, accessible language
- Cite general medical knowledge when appropriate
- Acknowledge limitations of AI medical advice`;

    // Add user profile context if available
    if (userProfile) {
      systemPrompt += `\n\nUser Profile Context:`;
      if (userProfile.age) systemPrompt += `\n- Age: ${userProfile.age}`;
      if (userProfile.gender) systemPrompt += `\n- Gender: ${userProfile.gender}`;
      if (userProfile.conditions && userProfile.conditions.length > 0) {
        systemPrompt += `\n- Medical Conditions: ${userProfile.conditions.join(', ')}`;
      }
      if (userProfile.medications && userProfile.medications.length > 0) {
        systemPrompt += `\n- Current Medications: ${userProfile.medications.join(', ')}`;
      }
      if (userProfile.allergies && userProfile.allergies.length > 0) {
        systemPrompt += `\n- Known Allergies: ${userProfile.allergies.join(', ')}`;
      }
      systemPrompt += `\n\nPlease consider this profile information when providing advice, but always recommend consulting with their healthcare provider for personalized guidance.`;
    }

    // Prepare conversation history
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history if available
    if (context?.conversation_history && Array.isArray(context.conversation_history)) {
      context.conversation_history.forEach(msg => {
        if (msg.type === 'user') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.type === 'assistant') {
          messages.push({ role: 'assistant', content: msg.content });
        }
      });
    }

    // Add current query
    messages.push({ role: 'user', content: query });

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: messages,
          max_tokens: 800,
          temperature: 0.7,
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        text: response.data.choices[0].message.content,
        confidence: 0.8, // Default confidence for OpenAI responses
        usage: response.data.usage,
        model: 'gpt-4'
      };

    } catch (error) {
      errorLogger.error('OpenAI API call failed', error, {
        error_response: error.response?.data,
        error_status: error.response?.status,
        component: 'MedicalConsultation'
      });
      
      if (error.response?.status === 429) {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      } else if (error.response?.status === 401) {
        throw new Error('OpenAI API authentication failed. Please check configuration.');
      } else {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
    }
  };

  router.post('/medical-consultation', async (req, res) => {
    const startTime = Date.now();
    let userId = req.userId;

    try {
      const { 
        query, 
        context, 
        session_id, 
        preferred_agent = 'txagent' // ✅ NEW: Default to TxAgent
      } = req.body;

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
        preferredAgent: preferred_agent, // ✅ NEW: Log preferred agent
        component: 'MedicalConsultation'
      });

      // Phase 1: Emergency Detection (applies to both agents)
      const emergencyCheck = detectEmergency(query);
      
      if (emergencyCheck.isEmergency) {
        errorLogger.warn('Emergency detected in consultation', {
          userId,
          detectedKeywords: emergencyCheck.detectedKeywords,
          query: query.substring(0, 200),
          preferredAgent: preferred_agent,
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
            context_used: { 
              emergency_keywords: emergencyCheck.detectedKeywords,
              preferred_agent: preferred_agent
            }
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
          session_id: session_id || 'emergency-session',
          agent_id: preferred_agent
        });
      }

      // ✅ NEW: Route based on preferred_agent
      let consultationResponse;
      let agentId;
      let processingDetails = {};

      if (preferred_agent === 'openai') {
        // ✅ NEW: OpenAI Route
        errorLogger.info('Routing consultation to OpenAI', {
          userId,
          queryLength: query.length,
          hasUserProfile: !!(context?.user_profile),
          component: 'MedicalConsultation'
        });

        try {
          const openAIResponse = await callOpenAI(
            query, 
            context, 
            context?.user_profile
          );

          consultationResponse = {
            text: openAIResponse.text,
            sources: [], // OpenAI doesn't use document sources
            confidence_score: openAIResponse.confidence
          };

          agentId = 'openai';
          processingDetails = {
            model: openAIResponse.model,
            usage: openAIResponse.usage,
            agent_type: 'openai'
          };

          errorLogger.info('OpenAI consultation completed successfully', {
            userId,
            responseLength: openAIResponse.text.length,
            tokensUsed: openAIResponse.usage?.total_tokens,
            model: openAIResponse.model,
            component: 'MedicalConsultation'
          });

        } catch (error) {
          errorLogger.error('OpenAI consultation failed', error, {
            userId,
            query: query.substring(0, 100),
            component: 'MedicalConsultation'
          });

          return res.status(500).json({
            error: 'OpenAI consultation failed. Please try again or switch to TxAgent.',
            code: 'OPENAI_CONSULTATION_FAILED',
            details: error.message,
            processing_time_ms: Date.now() - startTime
          });
        }

      } else {
        // ✅ EXISTING: TxAgent Route (default)
        errorLogger.info('Routing consultation to TxAgent', {
          userId,
          queryLength: query.length,
          component: 'MedicalConsultation'
        });

        // Get active agent for TxAgent communication
        const agent = await agentService.getActiveAgent(userId);
        
        if (!agent || !agent.session_data?.runpod_endpoint) {
          errorLogger.warn('No active TxAgent found for consultation', {
            userId,
            hasAgent: !!agent,
            component: 'MedicalConsultation'
          });

          return res.status(503).json({
            error: 'TxAgent service is not available. Please ensure TxAgent is running or try using OpenAI.',
            code: 'TXAGENT_SERVICE_UNAVAILABLE',
            suggestions: [
              'Start TxAgent from the Monitor page',
              'Switch to OpenAI by setting preferred_agent to "openai"'
            ]
          });
        }

        // Call TxAgent chat endpoint
        const txAgentUrl = `${agent.session_data.runpod_endpoint}/chat`;
        
        try {
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

          consultationResponse = {
            text: txAgentData.response,
            sources: txAgentData.sources || [],
            confidence_score: txAgentData.confidence_score
          };

          agentId = 'txagent';
          processingDetails = {
            agent_id: agent.id,
            sources_count: txAgentData.sources?.length || 0,
            processing_time: txAgentData.processing_time,
            model: txAgentData.model || 'BioBERT',
            agent_type: 'txagent'
          };

          errorLogger.info('TxAgent consultation completed successfully', {
            userId,
            processingTime: txAgentData.processing_time,
            sourcesCount: txAgentData.sources?.length || 0,
            agentId: agent.id,
            component: 'MedicalConsultation'
          });

        } catch (error) {
          errorLogger.error('TxAgent consultation failed', error, {
            userId,
            query: query.substring(0, 100),
            agentId: agent.id,
            component: 'MedicalConsultation'
          });

          return res.status(502).json({
            error: 'TxAgent consultation failed. Please try again or switch to OpenAI.',
            code: 'TXAGENT_CONSULTATION_FAILED',
            details: error.message,
            processing_time_ms: Date.now() - startTime,
            suggestions: [
              'Check TxAgent container status',
              'Try using OpenAI by setting preferred_agent to "openai"'
            ]
          });
        }
      }

      // ✅ UPDATED: Log consultation with agent information
      const consultationRecord = {
        user_id: userId,
        session_id: session_id || agentId,
        query: query,
        response: consultationResponse.text,
        sources: consultationResponse.sources || [],
        consultation_type: `${agentId}_consultation`, // ✅ NEW: Include agent type
        processing_time: Date.now() - startTime,
        emergency_detected: false,
        context_used: {
          ...processingDetails,
          preferred_agent: preferred_agent,
          has_user_profile: !!(context?.user_profile),
          conversation_history_length: context?.conversation_history?.length || 0
        },
        confidence_score: consultationResponse.confidence_score || null,
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
        sourcesCount: consultationResponse.sources?.length || 0,
        agentUsed: agentId,
        preferredAgent: preferred_agent,
        component: 'MedicalConsultation'
      });

      // ✅ UPDATED: Return response with agent information
      res.json({
        response: {
          text: consultationResponse.text,
          sources: consultationResponse.sources || [],
          confidence_score: consultationResponse.confidence_score
        },
        safety: {
          emergency_detected: false,
          disclaimer: 'This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment.',
          urgent_care_recommended: false
        },
        recommendations: consultationRecord.recommendations,
        processing_time_ms: Date.now() - startTime,
        session_id: session_id || agentId,
        agent_id: agentId, // ✅ NEW: Include which agent was actually used
        preferred_agent: preferred_agent // ✅ NEW: Include what was requested
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('Medical consultation failed', error, {
        userId,
        processingTime,
        query: req.body.query?.substring(0, 100),
        preferredAgent: req.body.preferred_agent,
        component: 'MedicalConsultation'
      });

      res.status(500).json({
        error: 'Medical consultation failed. Please try again.',
        code: 'CONSULTATION_FAILED',
        processing_time_ms: processingTime,
        preferred_agent: req.body.preferred_agent
      });
    }
  });

  return router;
}