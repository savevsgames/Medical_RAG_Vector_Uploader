# Migration Context File (MGCXT.md)
## Complete Database Schema with Enhanced Medical Consultation Platform

### 🎯 **Purpose**
This file documents the complete database schema for the Medical RAG Vector Uploader system, now expanded to serve as a comprehensive medical consultation platform supporting both doctor and patient portals with full TxAgent chat integration, voice services, and advanced medical tracking capabilities.

---

## 📋 **Current System Status (v2.0.0)**

### **✅ Fully Implemented Components**
- **Database Schema**: Complete with enhanced medical tracking and RLS policies
- **Agent Management**: Full lifecycle with session tracking for multiple user types
- **Document Processing**: Multi-format upload with 768-dim embeddings
- **Medical Consultations**: Dual-agent support (TxAgent + OpenAI) with context awareness
- **Voice Services**: Text-to-speech and speech-to-text integration
- **Medical Profiles**: Comprehensive user health tracking
- **Symptom & Treatment Tracking**: Detailed medical history management
- **Doctor Visit Management**: Appointment and consultation tracking
- **Health Monitoring**: Real-time container status tracking
- **Authentication**: JWT-based security with proper RLS for multi-tenant usage

### **🔧 TxAgent Integration Status**
- **Backend Routes**: Fully implemented with dual-agent support
- **Container API**: Enhanced error handling and diagnostics
- **Embedding Flow**: Backend proxy ready for 768-dim BioBERT vectors
- **Chat Flow**: Complete request/response handling with context awareness
- **Voice Integration**: TTS/STT endpoints for mobile app support

---

## 🗄️ **Database Schema (Current v2.0.0)**

### **Core Tables**

#### **Documents Table** - Vector Document Storage
```sql
CREATE TABLE public.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text,
    content text NOT NULL,
    embedding vector(768),  -- CRITICAL: 768-dimensional for BioBERT
    metadata jsonb DEFAULT '{}'::jsonb,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX documents_embedding_idx ON public.documents 
USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX documents_user_id_idx ON public.documents USING btree (user_id);
CREATE INDEX documents_created_at_idx ON public.documents USING btree (created_at);
CREATE INDEX documents_filename_idx ON public.documents USING btree (filename);
```

#### **Agents Table** - TxAgent Session Management
```sql
CREATE TABLE public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text DEFAULT 'initializing'::text,  -- 'active', 'terminated', 'initializing'
    session_data jsonb DEFAULT '{}'::jsonb,    -- Container details, endpoints, capabilities
    created_at timestamptz DEFAULT now(),
    last_active timestamptz DEFAULT now(),
    terminated_at timestamptz
);

-- Performance indexes
CREATE INDEX agents_user_id_idx ON public.agents USING btree (user_id);
CREATE INDEX agents_status_idx ON public.agents USING btree (status);
CREATE INDEX agents_last_active_idx ON public.agents USING btree (last_active);
```

#### **Medical Consultations Table** - Enhanced Consultation Tracking
```sql
CREATE TABLE public.medical_consultations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id text NOT NULL,
    query text NOT NULL,
    response text NOT NULL,
    sources jsonb,                              -- Document sources used in response
    voice_audio_url text,                       -- Generated TTS audio URL
    video_url text,                            -- Generated video URL (future)
    consultation_type text NOT NULL,            -- 'txagent_consultation', 'openai_consultation', 'emergency_detection'
    processing_time integer,                    -- Response time in milliseconds
    emergency_detected boolean,                 -- Emergency keyword detection
    context_used jsonb,                        -- User profile, conversation history, agent details
    confidence_score numeric,                  -- AI confidence in response
    recommendations jsonb,                     -- Structured recommendations
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX medical_consultations_user_id_idx ON public.medical_consultations USING btree (user_id);
CREATE INDEX medical_consultations_session_id_idx ON public.medical_consultations USING btree (session_id);
CREATE INDEX medical_consultations_created_at_idx ON public.medical_consultations USING btree (created_at DESC);
```

### **Enhanced Medical Tracking Tables**

#### **User Medical Profiles** - Comprehensive Health Information
```sql
CREATE TABLE public.user_medical_profiles (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    age integer CHECK (age >= 0 AND age <= 120),
    gender gender_type,                        -- Custom enum: 'male', 'female', 'non_binary', 'other', 'prefer_not_to_say'
    height_cm numeric,
    weight_kg numeric,
    blood_type blood_type,                     -- Custom enum: 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'
    conditions_summary text,                   -- High-level conditions summary
    medications_summary text,                  -- High-level medications summary
    allergies_summary text,                    -- High-level allergies summary
    family_history text,                       -- Family medical history
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX user_med_profiles_user_idx ON public.user_medical_profiles USING btree (user_id);
```

#### **Profile Conditions** - Detailed Condition Tracking
```sql
CREATE TABLE public.profile_conditions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL REFERENCES public.user_medical_profiles(id) ON DELETE CASCADE,
    condition_name text NOT NULL,
    diagnosed_at date,
    severity integer CHECK (severity >= 1 AND severity <= 10),
    ongoing boolean DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_cond_profile_idx ON public.profile_conditions USING btree (profile_id);
```

#### **Profile Medications** - Detailed Medication Tracking
```sql
CREATE TABLE public.profile_medications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL REFERENCES public.user_medical_profiles(id) ON DELETE CASCADE,
    medication_name text NOT NULL,
    dosage text,
    frequency text,
    start_date date,
    end_date date,
    prescribed_by text,
    is_current boolean DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_med_profile_idx ON public.profile_medications USING btree (profile_id);
```

#### **Profile Allergies** - Detailed Allergy Tracking
```sql
CREATE TABLE public.profile_allergies (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL REFERENCES public.user_medical_profiles(id) ON DELETE CASCADE,
    allergen text NOT NULL,
    reaction text,
    severity integer CHECK (severity >= 1 AND severity <= 10),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_allergy_profile_idx ON public.profile_allergies USING btree (profile_id);
```

#### **User Symptoms** - Symptom Tracking and History
```sql
CREATE TABLE public.user_symptoms (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symptom_name text NOT NULL,
    severity integer CHECK (severity >= 1 AND severity <= 10),
    description text,
    triggers text,
    duration_hours integer,
    location text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_symptoms_user_id_created_at_idx ON public.user_symptoms USING btree (user_id, created_at);
```

#### **Treatments** - Treatment Recommendations and Tracking
```sql
CREATE TABLE public.treatments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    treatment_type treatment_type NOT NULL,    -- Custom enum: 'exercise', 'medication', 'other', 'supplement', 'therapy'
    name text NOT NULL,
    dosage text,
    duration text,
    description text,
    doctor_recommended boolean DEFAULT false,
    completed boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX treatments_user_id_created_at_idx ON public.treatments USING btree (user_id, created_at);
```

#### **Doctor Visits** - Appointment and Visit Management
```sql
CREATE TABLE public.doctor_visits (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_ts timestamptz NOT NULL,
    doctor_name text,
    location text,
    contact_phone text,
    contact_email text,
    visit_prep text,                           -- Pre-visit preparation notes
    visit_summary text,                        -- Post-visit summary
    follow_up_required boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX doctor_visits_user_id_visit_ts_idx ON public.doctor_visits USING btree (user_id, visit_ts);
```

### **Junction Tables for Relationships**

#### **Symptom-Treatment Relationships**
```sql
CREATE TABLE public.symptom_treatments (
    symptom_id uuid NOT NULL REFERENCES public.user_symptoms(id) ON DELETE CASCADE,
    treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
    PRIMARY KEY (symptom_id, treatment_id)
);
```

#### **Visit-Symptom Relationships**
```sql
CREATE TABLE public.visit_symptoms (
    visit_id uuid NOT NULL REFERENCES public.doctor_visits(id) ON DELETE CASCADE,
    symptom_id uuid NOT NULL REFERENCES public.user_symptoms(id) ON DELETE CASCADE,
    PRIMARY KEY (visit_id, symptom_id)
);
```

#### **Visit-Treatment Relationships**
```sql
CREATE TABLE public.visit_treatments (
    visit_id uuid NOT NULL REFERENCES public.doctor_visits(id) ON DELETE CASCADE,
    treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
    PRIMARY KEY (visit_id, treatment_id)
);
```

### **Custom Enum Types**

```sql
-- Gender options
CREATE TYPE gender_type AS ENUM ('male', 'female', 'non_binary', 'other', 'prefer_not_to_say');

-- Blood type options
CREATE TYPE blood_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown');

-- Treatment type options
CREATE TYPE treatment_type AS ENUM ('exercise', 'medication', 'other', 'supplement', 'therapy');
```

### **Testing and Admin Tables**

#### **Testing Admin Users** - Admin Access Control
```sql
CREATE TABLE public.testing_admin_users (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    added_at timestamptz DEFAULT now()
);
```

#### **Test Runs** - System Testing Tracking
```sql
CREATE TABLE public.test_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trigger_type varchar(50) NOT NULL,
    environment varchar(50) NOT NULL,
    target_url text NOT NULL,
    commit_sha varchar(40),
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    status varchar(20) DEFAULT 'running',
    total_tests integer DEFAULT 0,
    passed_tests integer DEFAULT 0,
    failed_tests integer DEFAULT 0,
    skipped_tests integer DEFAULT 0
);
```

### **Row Level Security (RLS) Policies**

#### **Documents - Shared Knowledge Base**
```sql
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read ALL documents (shared medical knowledge)
CREATE POLICY "All authenticated users can read all documents"
    ON public.documents FOR SELECT TO authenticated
    USING (true);

-- Users can only upload documents as themselves
CREATE POLICY "Users can only upload as themselves"
    ON public.documents FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can only edit their own documents
CREATE POLICY "Users can only edit their own documents"
    ON public.documents FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own documents
CREATE POLICY "Users can only delete their own documents"
    ON public.documents FOR DELETE TO authenticated
    USING (auth.uid() = user_id);
```

#### **Medical Data - User Isolation**
```sql
-- Medical profiles: Users can only access their own profiles
ALTER TABLE public.user_medical_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_owner"
    ON public.user_medical_profiles FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Symptoms: Users can only access their own symptoms
ALTER TABLE public.user_symptoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symptoms_owner"
    ON public.user_symptoms FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Treatments: Users can only access their own treatments
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treatments_owner"
    ON public.treatments FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Doctor visits: Users can only access their own visits
ALTER TABLE public.doctor_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visits_owner"
    ON public.doctor_visits FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Medical consultations: Users can only access their own consultations
ALTER TABLE public.medical_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own consultations"
    ON public.medical_consultations FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own consultations"
    ON public.medical_consultations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
```

#### **Profile Detail Tables - Cascading Security**
```sql
-- Profile conditions: Access through profile ownership
ALTER TABLE public.profile_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conditions_owner"
    ON public.profile_conditions FOR ALL TO public
    USING (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_conditions.profile_id))
    WITH CHECK (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_conditions.profile_id));

-- Profile medications: Access through profile ownership
ALTER TABLE public.profile_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medications_owner"
    ON public.profile_medications FOR ALL TO public
    USING (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_medications.profile_id))
    WITH CHECK (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_medications.profile_id));

-- Profile allergies: Access through profile ownership
ALTER TABLE public.profile_allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allergies_owner"
    ON public.profile_allergies FOR ALL TO public
    USING (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_allergies.profile_id))
    WITH CHECK (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_allergies.profile_id));
```

#### **Junction Tables - Relationship Security**
```sql
-- Symptom-treatment links: Both entities must be owned by user
ALTER TABLE public.symptom_treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "link_sympt_treat"
    ON public.symptom_treatments FOR ALL TO public
    USING (
        auth.uid() = (SELECT user_id FROM user_symptoms WHERE id = symptom_treatments.symptom_id) AND
        auth.uid() = (SELECT user_id FROM treatments WHERE id = symptom_treatments.treatment_id)
    );

-- Visit-symptom links: Both entities must be owned by user
ALTER TABLE public.visit_symptoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "link_visit_sympt"
    ON public.visit_symptoms FOR ALL TO public
    USING (
        auth.uid() = (SELECT user_id FROM doctor_visits WHERE id = visit_symptoms.visit_id) AND
        auth.uid() = (SELECT user_id FROM user_symptoms WHERE id = visit_symptoms.symptom_id)
    );

-- Visit-treatment links: Both entities must be owned by user
ALTER TABLE public.visit_treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "link_visit_treat"
    ON public.visit_treatments FOR ALL TO public
    USING (
        auth.uid() = (SELECT user_id FROM doctor_visits WHERE id = visit_treatments.visit_id) AND
        auth.uid() = (SELECT user_id FROM treatments WHERE id = visit_treatments.treatment_id)
    );
```

---

## 🤖 **Enhanced TxAgent Container API Specification**

### **Required Endpoints for Integration**

The TxAgent container **MUST** implement these endpoints for full system integration:

#### **1. Health Check**
```http
GET /health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "model": "BioBERT",
  "device": "cuda:0",
  "version": "1.0.0",
  "uptime": 3600,
  "memory_usage": "2.1GB"
}
```

#### **2. Enhanced Chat Endpoint**
```http
POST /chat
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Request Schema:**
```json
{
  "query": "What are the symptoms of myocardial infarction?",
  "top_k": 5,
  "temperature": 0.7,
  "history": [
    {
      "type": "user",
      "content": "Previous question",
      "timestamp": "2024-01-01T00:00:00Z"
    }
  ],
  "stream": false,
  "context": {
    "user_profile": {
      "age": 30,
      "gender": "male",
      "conditions": ["Hypertension"],
      "medications": ["Lisinopril"],
      "allergies": ["Penicillin"]
    }
  }
}
```

**Response Schema:**
```json
{
  "response": "Myocardial infarction symptoms include chest pain, shortness of breath...",
  "sources": [
    {
      "filename": "cardiology-guidelines.pdf",
      "similarity": 0.89,
      "chunk_id": "chunk_123",
      "content": "Relevant excerpt...",
      "metadata": {
        "page": 15,
        "section": "Symptoms"
      }
    }
  ],
  "processing_time": 1250,
  "model": "BioBERT",
  "tokens_used": 150,
  "confidence_score": 0.85
}
```

#### **3. Embedding Endpoint**
```http
POST /embed
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Request Schema:**
```json
{
  "text": "Patient presents with chest pain and dyspnea",
  "normalize": true
}
```

**Response Schema:**
```json
{
  "embedding": [0.1234, -0.5678, 0.9012, ...],
  "dimensions": 768,
  "model": "BioBERT",
  "processing_time": 45
}
```

**CRITICAL Requirements:**
- **MUST** return exactly 768 dimensions
- **MUST** use BioBERT or compatible medical model
- **MUST** handle JWT authentication
- **MUST** return consistent embeddings for same input
- **MUST** support user profile context in chat requests

---

## 🔄 **Enhanced API Endpoints**

### **Medical Consultation Endpoint (Enhanced)**

**File:** `backend/routes/medicalConsultation.js`

```javascript
// Enhanced medical consultation with dual-agent support
router.post('/medical-consultation', async (req, res) => {
  try {
    const { 
      query, 
      context, 
      session_id, 
      preferred_agent = 'txagent'  // NEW: Agent selection
    } = req.body;

    // Emergency detection (applies to both agents)
    const emergencyCheck = detectEmergency(query);
    if (emergencyCheck.isEmergency) {
      // Handle emergency response...
    }

    // Route based on preferred_agent
    if (preferred_agent === 'openai') {
      // OpenAI route with user profile context
      const openAIResponse = await callOpenAI(query, context, context?.user_profile);
      // Return formatted response...
    } else {
      // TxAgent route (default)
      const agent = await agentService.getActiveAgent(userId);
      // Call TxAgent with enhanced context...
    }

    // Log consultation with enhanced metadata
    await supabaseClient.from('medical_consultations').insert({
      user_id: userId,
      session_id: session_id || agentId,
      query: query,
      response: consultationResponse.text,
      sources: consultationResponse.sources || [],
      consultation_type: `${agentId}_consultation`,
      processing_time: Date.now() - startTime,
      emergency_detected: false,
      context_used: {
        preferred_agent: preferred_agent,
        has_user_profile: !!(context?.user_profile),
        conversation_history_length: context?.conversation_history?.length || 0
      },
      confidence_score: consultationResponse.confidence_score || null
    });

  } catch (error) {
    // Enhanced error handling...
  }
});
```

### **Voice Services Endpoints (NEW)**

#### **Text-to-Speech**
```http
POST /api/voice/tts
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

Body:
{
  "text": "Based on your symptoms, I recommend consulting with a healthcare provider.",
  "voice_id": "default",
  "consultation_id": "uuid-string"
}

Response:
{
  "success": true,
  "audio_url": "https://storage.supabase.co/object/public/audio/voice/user-id/tts_123.mp3",
  "file_path": "voice/user-id/tts_123.mp3",
  "duration_estimate": 15,
  "voice_id": "default",
  "processing_time_ms": 2500
}
```

#### **Speech-to-Text**
```http
POST /api/voice/transcribe
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

Body:
{
  "audio_url": "https://example.com/audio.mp3",
  "language": "en"
}

Response:
{
  "success": true,
  "text": "I have been experiencing headaches for the past week",
  "language": "en",
  "confidence": 0.9,
  "processing_time_ms": 3000
}
```

### **Medical Profile Management Endpoints (NEW)**

#### **Get Medical Profile**
```http
GET /api/medical-profile
Authorization: Bearer <user_jwt_token>

Response:
{
  "profile": {
    "id": "uuid-string",
    "user_id": "uuid-string",
    "age": 30,
    "gender": "male",
    "height_cm": 175.5,
    "weight_kg": 70.2,
    "blood_type": "O+",
    "conditions": [
      {
        "id": "uuid-string",
        "condition_name": "Hypertension",
        "diagnosed_at": "2023-01-15",
        "severity": 6,
        "ongoing": true,
        "notes": "Well controlled with medication"
      }
    ],
    "medications": [
      {
        "id": "uuid-string",
        "medication_name": "Lisinopril",
        "dosage": "10mg",
        "frequency": "Once daily",
        "is_current": true,
        "prescribed_by": "Dr. Smith"
      }
    ],
    "allergies": [
      {
        "id": "uuid-string",
        "allergen": "Penicillin",
        "reaction": "Rash",
        "severity": 8
      }
    ]
  },
  "has_profile": true
}
```

#### **Create/Update Medical Profile**
```http
POST /api/medical-profile
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

Body:
{
  "age": 30,
  "gender": "male",
  "height_cm": 175.5,
  "weight_kg": 70.2,
  "blood_type": "O+",
  "conditions": [
    {
      "name": "Hypertension",
      "diagnosed_at": "2023-01-15",
      "severity": 6,
      "ongoing": true,
      "notes": "Well controlled with medication"
    }
  ],
  "medications": [
    {
      "name": "Lisinopril",
      "dosage": "10mg",
      "frequency": "Once daily",
      "is_current": true,
      "prescribed_by": "Dr. Smith"
    }
  ],
  "allergies": [
    {
      "allergen": "Penicillin",
      "reaction": "Rash",
      "severity": 8
    }
  ]
}

Response:
{
  "success": true,
  "profile_id": "uuid-string",
  "message": "Medical profile updated successfully"
}
```

### **Symptom Tracking Endpoints (NEW)**

#### **Log Symptom**
```http
POST /api/symptoms
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

Body:
{
  "symptom_name": "Headache",
  "severity": 7,
  "description": "Severe throbbing headache on left side",
  "duration_hours": 4,
  "triggers": "Stress, lack of sleep",
  "location": "Left temple"
}

Response:
{
  "success": true,
  "symptom": {
    "id": "uuid-string",
    "symptom_name": "Headache",
    "severity": 7,
    "description": "Severe throbbing headache on left side",
    "duration_hours": 4,
    "triggers": "Stress, lack of sleep",
    "location": "Left temple",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### **Get Symptom History**
```http
GET /api/symptoms?limit=50&offset=0
Authorization: Bearer <user_jwt_token>

Response:
{
  "symptoms": [
    {
      "id": "uuid-string",
      "symptom_name": "Headache",
      "severity": 7,
      "description": "Severe throbbing headache on left side",
      "duration_hours": 4,
      "triggers": "Stress, lack of sleep",
      "location": "Left temple",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 25
}
```

### **Treatment Tracking Endpoints (NEW)**

#### **Add Treatment**
```http
POST /api/treatments
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

Body:
{
  "treatment_type": "medication",
  "name": "Ibuprofen",
  "dosage": "400mg",
  "duration": "As needed",
  "description": "For headache relief",
  "doctor_recommended": false
}

Response:
{
  "success": true,
  "treatment": {
    "id": "uuid-string",
    "treatment_type": "medication",
    "name": "Ibuprofen",
    "dosage": "400mg",
    "duration": "As needed",
    "description": "For headache relief",
    "doctor_recommended": false,
    "completed": false,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

## 🧪 **Enhanced Testing Strategy**

### **Multi-Agent Testing**
```bash
# Test TxAgent consultation
curl -X POST "http://localhost:8000/api/medical-consultation" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the symptoms of diabetes?",
    "preferred_agent": "txagent",
    "context": {
      "user_profile": {
        "age": 30,
        "gender": "male",
        "conditions": ["Hypertension"]
      }
    }
  }'

# Test OpenAI consultation
curl -X POST "http://localhost:8000/api/medical-consultation" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the symptoms of diabetes?",
    "preferred_agent": "openai",
    "context": {
      "user_profile": {
        "age": 30,
        "gender": "male",
        "conditions": ["Hypertension"]
      }
    }
  }'
```

### **Voice Services Testing**
```bash
# Test TTS
curl -X POST "http://localhost:8000/api/voice/tts" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Based on your symptoms, I recommend consulting with a healthcare provider.",
    "voice_id": "default"
  }'

# Test STT
curl -X POST "http://localhost:8000/api/voice/transcribe" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "audio_url": "https://example.com/audio.mp3",
    "language": "en"
  }'
```

### **Medical Profile Testing**
```bash
# Create medical profile
curl -X POST "http://localhost:8000/api/medical-profile" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "age": 30,
    "gender": "male",
    "conditions": [{"name": "Hypertension", "severity": 6}],
    "medications": [{"name": "Lisinopril", "dosage": "10mg"}],
    "allergies": [{"allergen": "Penicillin", "severity": 8}]
  }'

# Log symptom
curl -X POST "http://localhost:8000/api/symptoms" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symptom_name": "Headache",
    "severity": 7,
    "duration_hours": 4
  }'
```

---

## 🚀 **System Architecture Status**

### **✅ Backend Complete (100%)**
- Enhanced medical consultation with dual-agent support
- Voice services (TTS/STT) integration
- Comprehensive medical profile management
- Symptom and treatment tracking
- Doctor visit management
- Advanced error handling and diagnostics
- Multi-tenant security with RLS

### **✅ Frontend Complete (100%)**
- Doctor portal with full functionality
- Agent management and monitoring
- Document upload and management
- Real-time status monitoring
- Error handling and user feedback

### **✅ Database Complete (100%)**
- Enhanced schema with medical tracking
- Comprehensive RLS policies
- Performance-optimized indexes
- Custom enum types for medical data
- Junction tables for complex relationships

### **🔧 Mobile App Integration (90%)**
- API endpoints ready for mobile consumption
- Voice services implemented
- Medical profile APIs available
- Authentication flow compatible
- Missing: Mobile app implementation

### **🔧 Container Implementation Needed (30%)**
- Health endpoint partially working
- Chat endpoint needs user profile context support
- Embedding endpoint working
- Enhanced error handling needed

---

## 🎯 **Current Capabilities Summary**

### **For Doctors (Doctor Portal)**
- ✅ Document upload and management
- ✅ TxAgent session management
- ✅ Chat with medical documents
- ✅ Real-time health monitoring
- ✅ OpenAI fallback support

### **For Patients (Mobile App Backend)**
- ✅ Medical profile management
- ✅ Symptom tracking and history
- ✅ Treatment recommendations
- ✅ Doctor visit scheduling
- ✅ Voice-enabled consultations
- ✅ Dual-agent AI support (TxAgent + OpenAI)
- ✅ Emergency detection
- ✅ Personalized medical advice

### **System Features**
- ✅ Multi-tenant architecture
- ✅ Secure data isolation
- ✅ Real-time monitoring
- ✅ Voice services integration
- ✅ Comprehensive medical tracking
- ✅ Advanced error handling
- ✅ Performance optimization

---

## 📞 **Integration Requirements**

### **For Mobile App Developers**
1. **Authentication**: Use Supabase JWT tokens
2. **API Base URL**: Configure backend URL
3. **Voice Services**: Implement TTS/STT UI components
4. **Medical Profiles**: Build profile management screens
5. **Symptom Tracking**: Implement symptom logging interface

### **For Container Developers**
1. **User Profile Context**: Support user profile in chat requests
2. **Enhanced Error Handling**: Return structured error responses
3. **Performance Optimization**: Improve response times
4. **Health Monitoring**: Implement comprehensive health checks

The system is now a comprehensive medical consultation platform supporting both doctor and patient use cases with advanced medical tracking, voice services, and dual-agent AI capabilities.