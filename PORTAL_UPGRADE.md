# PORTAL_UPGRADE_PLAN.md (Revised - Phase 1 Focus)

## Overview
This document provides a comprehensive integration plan for adding TxAgent Medical RAG capabilities to the existing Doctor's Portal backend. The portal will serve as an intermediary between the mobile user application (SymptomSavior) and the TxAgent container, orchestrating medical consultations, document processing, and multimedia generation.

## System Architecture

```
Mobile App (SymptomSavior)
    ↓ JWT + Request
Doctor's Portal Backend (Node.js/Express)
    ↓ JWT Forwarding + Orchestration
┌─────────────────┬─────────────────┬─────────────────┐
│   TxAgent       │   ElevenLabs    │    TavusAI      │
│  Container      │    (Voice)      │   (Video)       │
└─────────────────┴─────────────────┴─────────────────┘
                    ↓
                Supabase Database
                (RLS Protected)
```

## PHASE 1: CORE FUNCTIONALITY IMPLEMENTATION

### Priority 1: Database Schema Updates

**New Migration Required**: `add_medical_consultation_tables.sql`

```sql
-- Medical consultations log (PHASE 1 - CORE TABLE)
CREATE TABLE IF NOT EXISTS public.medical_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL, -- Agent session identifier for tracking
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  voice_audio_url TEXT,
  video_url TEXT,
  consultation_type TEXT DEFAULT 'symptom_inquiry',
  processing_time INTEGER,
  emergency_detected BOOLEAN DEFAULT FALSE,
  context_used JSONB DEFAULT '{}'::jsonb,
  confidence_score FLOAT,
  recommendations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.medical_consultations ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can insert their own consultations"
    ON public.medical_consultations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own consultations"
    ON public.medical_consultations FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX medical_consultations_user_id_idx ON public.medical_consultations (user_id);
CREATE INDEX medical_consultations_created_at_idx ON public.medical_consultations (created_at DESC);
CREATE INDEX medical_consultations_session_id_idx ON public.medical_consultations (session_id);
```

### Priority 2: Environment Variables Setup

**Add to backend `.env`**:

```bash
# Phase 1 - Core TxAgent Integration
TXAGENT_CONTAINER_URL=https://your-txagent-url.proxy.runpod.net
TXAGENT_TIMEOUT=30000

# Phase 1 - Basic Safety Features
ENABLE_EMERGENCY_DETECTION=true
MEDICAL_DISCLAIMER_REQUIRED=true

# Phase 1 - Logging Level
LOG_LEVEL=info
```

### Priority 3: Core Medical Consultation Endpoint

**File**: `backend/routes/medicalConsultation.js` (NEW FILE)

**Route**: `POST /api/medical-consultation`

**Phase 1 Implementation** (Basic functionality without voice/video):

```javascript
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
    'suicidal thoughts', 'overdose', 'can\'t breathe', 'choking'
  ];

  const detectEmergency = (text) => {
    const hasKeywords = emergencyKeywords.some(keyword =>
      text.toLowerCase().includes(keyword)
    );
    return {
      isEmergency: hasKeywords,
      confidence: hasKeywords ? 'high' : 'low',
      detectedKeywords: emergencyKeywords.filter(keyword =>
        text.toLowerCase().includes(keyword)
      )
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
        timeout: parseInt(process.env.TXAGENT_TIMEOUT) || 30000
      });

      if (!txAgentResponse.ok) {
        throw new Error(`TxAgent responded with status ${txAgentResponse.status}`);
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
```

### Priority 4: Update Main Routes

**File**: `backend/routes/index.js` (UPDATE EXISTING)

Add the new medical consultation router:

```javascript
// Add import
import { createMedicalConsultationRouter } from './medicalConsultation.js';

// In setupRoutes function, add:
const medicalConsultationRouter = createMedicalConsultationRouter(supabaseClient);
app.use('/api', medicalConsultationRouter);
```

### Priority 5: Basic Health Check Enhancement

**File**: `backend/routes/health.js` (UPDATE EXISTING)

Add TxAgent connectivity check:

```javascript
// Add TxAgent health check
if (process.env.TXAGENT_CONTAINER_URL) {
  try {
    const txAgentHealthUrl = `${process.env.TXAGENT_CONTAINER_URL}/health`;
    const txAgentResponse = await axios.get(txAgentHealthUrl, { timeout: 5000 });
    services.txagent = txAgentResponse.data?.status || 'connected';
  } catch (error) {
    services.txagent = 'unavailable';
    errorLogger.warn('TxAgent health check failed', {
      error: error.message,
      component: 'HealthCheck'
    });
  }
}
```

## PHASE 1 TESTING PLAN

### 1. Database Migration Test
```sql
-- Test the new table creation
SELECT * FROM public.medical_consultations LIMIT 1;

-- Test RLS policies
INSERT INTO public.medical_consultations (user_id, session_id, query, response)
VALUES (auth.uid(), 'test-session', 'test query', 'test response');
```

### 2. API Endpoint Tests

**Test 1: Basic Medical Consultation**
```bash
curl -X POST "http://localhost:8000/api/medical-consultation" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the symptoms of diabetes?",
    "session_id": "test-session-123"
  }'
```

**Test 2: Emergency Detection**
```bash
curl -X POST "http://localhost:8000/api/medical-consultation" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I am having severe chest pain and difficulty breathing",
    "session_id": "emergency-test-123"
  }'
```

**Test 3: Service Unavailable (No TxAgent)**
```bash
# Test when TxAgent is not running
curl -X POST "http://localhost:8000/api/medical-consultation" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is hypertension?",
    "session_id": "unavailable-test-123"
  }'
```

### 3. Health Check Test
```bash
curl -X GET "http://localhost:8000/health"
# Should include txagent status in services object
```

## PHASE 1 SUCCESS CRITERIA

### ✅ Database Ready
- [ ] `medical_consultations` table created successfully
- [ ] RLS policies working correctly
- [ ] Can insert and query consultation records

### ✅ API Functionality
- [ ] `/api/medical-consultation` endpoint responds correctly
- [ ] Emergency detection works for dangerous keywords
- [ ] JWT forwarding to TxAgent works
- [ ] Error handling for TxAgent unavailable
- [ ] Consultation logging to database works

### ✅ Integration Testing
- [ ] Mobile app can call consultation endpoint
- [ ] TxAgent container receives and processes requests
- [ ] Database records are created with proper user isolation
- [ ] Health check includes TxAgent status

### ✅ Security & Compliance
- [ ] JWT authentication required for all endpoints
- [ ] RLS policies prevent cross-user data access
- [ ] Emergency detection logs properly
- [ ] Medical disclaimers included in responses

## PHASE 1 DEPLOYMENT CHECKLIST

### Environment Setup
- [ ] `TXAGENT_CONTAINER_URL` configured
- [ ] `ENABLE_EMERGENCY_DETECTION=true` set
- [ ] Database migration applied
- [ ] New route mounted in main router

### Testing
- [ ] All Phase 1 tests pass
- [ ] Emergency detection working
- [ ] TxAgent integration functional
- [ ] Database logging operational

### Monitoring
- [ ] Logs show consultation requests
- [ ] Emergency detections are logged
- [ ] TxAgent call success/failure tracked
- [ ] Database operations logged

## NEXT PHASES PREVIEW

### Phase 2: Enhanced Features (Week 2)
- Voice generation via ElevenLabs
- Enhanced emergency detection
- User medical profiles table
- Symptom tracking

### Phase 3: Advanced Features (Week 3)
- Video generation via TavusAI
- Advanced analytics
- Performance optimization
- Production monitoring

---

**Phase 1 Focus**: Get the core medical consultation endpoint working with basic emergency detection and TxAgent integration. This provides the foundation for all future enhancements.