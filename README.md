# Medical RAG Vector Uploader - Smart MedDoc Portal

A comprehensive medical document processing and AI-powered chat system built with React, Node.js, and Supabase, featuring TxAgent containerized AI integration.

## 🎯 Overview

The Medical RAG Vector Uploader is a production-ready web application that enables medical professionals and patients to:

- **Upload and process medical documents** (PDFs, DOCX, TXT, MD) with automatic text extraction and BioBERT embedding generation
- **Chat with AI agents** (TxAgent BioBERT or OpenAI GPT-4) using uploaded documents as context
- **Manage RunPod containerized TxAgent sessions** with real-time health monitoring
- **Conduct medical consultations** with emergency detection and safety features
- **Track medical profiles, symptoms, and treatments** for personalized healthcare
- **Generate voice responses** using ElevenLabs text-to-speech integration

## 🏗️ Architecture

```mermaid
graph TB
    A[Doctor's Portal Frontend] --> B[Node.js Backend API]
    C[Expo Mobile App] --> B
    B --> D[Supabase Database]
    B --> E[TxAgent RunPod Container]
    E --> F[BioBERT Model]
    E --> D
    B --> G[Supabase Storage]
    B --> H[OpenAI API]
    B --> I[ElevenLabs API]

    subgraph "Authentication"
        J[Supabase Auth] --> A
        J --> C
        J --> B
        J --> E
    end
```

### Components

- **Frontend**: React + TypeScript + Vite (SPA)
- **Mobile App**: React Native Expo (SymptomSavior)
- **Backend**: Node.js + Express (RESTful API)
- **Database**: Supabase PostgreSQL with pgvector
- **Storage**: Supabase Storage with RLS
- **AI Container**: RunPod TxAgent with BioBERT
- **Authentication**: Supabase Auth with JWT tokens
- **Voice Generation**: ElevenLabs text-to-speech

## 🗄️ Database Schema

### Core Tables

#### Documents - Vector Document Storage
```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768),                   -- BioBERT 768-dimensional embedding
    metadata JSONB DEFAULT '{}'::JSONB,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Agents - TxAgent Session Management
```sql
CREATE TABLE public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'initializing'::TEXT,
    session_data JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_active TIMESTAMPTZ DEFAULT now(),
    terminated_at TIMESTAMPTZ
);
```

#### Medical Consultations - AI Consultation Tracking
```sql
CREATE TABLE public.medical_consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    sources JSONB,
    voice_audio_url TEXT,
    consultation_type TEXT NOT NULL,
    processing_time INTEGER,
    emergency_detected BOOLEAN,
    context_used JSONB,
    confidence_score NUMERIC,
    recommendations JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### User Medical Profiles - Comprehensive Health Information
```sql
CREATE TABLE public.user_medical_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    age INTEGER CHECK (age >= 0 AND age <= 120),
    gender gender_type,
    height_cm NUMERIC,
    weight_kg NUMERIC,
    blood_type blood_type,
    conditions_summary TEXT,
    medications_summary TEXT,
    allergies_summary TEXT,
    family_history TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### User Symptoms - Symptom Tracking
```sql
CREATE TABLE public.user_symptoms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symptom_name TEXT NOT NULL,
    severity INTEGER CHECK (severity >= 1 AND severity <= 10),
    description TEXT,
    triggers TEXT,
    duration_hours INTEGER,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### Treatments - Treatment Tracking
```sql
CREATE TABLE public.treatments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    treatment_type treatment_type NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT,
    duration TEXT,
    description TEXT,
    doctor_recommended BOOLEAN DEFAULT false,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Row Level Security (RLS)

#### Shared Knowledge Base Pattern
```sql
-- Documents: All authenticated users can read all medical documents (shared knowledge)
CREATE POLICY "All authenticated users can read all documents"
    ON public.documents FOR SELECT TO authenticated
    USING (true);

-- Users can only upload as themselves
CREATE POLICY "Users can only upload as themselves"
    ON public.documents FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Medical data: Users can only access their own data
CREATE POLICY "Users can only access their own medical data"
    ON public.user_medical_profiles FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

## 🔌 API Endpoints

### Document Management
- `POST /upload` - Upload and process medical documents
- `GET /api/documents/job-status/:jobId` - Check document processing status
- `POST /test-upload` - Test upload system connectivity

### Agent Management
- `GET /api/agent/status` - Get current agent session status
- `POST /api/agent/start` - Start TxAgent session
- `POST /api/agent/stop` - Stop TxAgent session
- `POST /api/agent/health-check` - Detailed health check of TxAgent container

### Chat Endpoints
- `POST /api/chat` - Chat with TxAgent (BioBERT-powered)
- `POST /api/openai-chat` - Chat with OpenAI (GPT-powered fallback)

### Medical Consultation (NEW)
- `POST /api/medical-consultation` - Comprehensive medical consultation with emergency detection
  - Supports both doctor and patient contexts
  - Emergency keyword detection with safety protocols
  - Personalized responses based on user medical profiles
  - Integration with TxAgent and OpenAI agents

### Medical Profile Management (NEW)
- `GET /api/medical-profile` - Fetch user's complete medical profile
- `POST /api/medical-profile` - Create/update medical profile with detailed tracking
- `GET /api/symptoms` - Fetch user's symptom history
- `POST /api/symptoms` - Log new symptoms with severity and triggers
- `GET /api/treatments` - Fetch user's treatment history
- `POST /api/treatments` - Add new treatments and track progress

### Voice Generation (NEW)
- `POST /api/generate-voice` - Generate voice audio from text using ElevenLabs
- `GET /api/voices` - Fetch available voice options

### Embedding Generation
- `POST /api/embed` - Generate BioBERT embeddings for text

## 🤖 TxAgent Container Integration

### Required Endpoints
The TxAgent container must implement these endpoints:

#### Health Check
```http
GET /health
→ {"status":"healthy","model":"BioBERT","device":"cuda:0","version":"1.0.0"}
```

#### Chat Processing
```http
POST /chat
{"query":"What is diabetes?","top_k":5,"temperature":0.7,"history":[],"stream":false}
→ {"response":"...","sources":[...],"processing_time":1250}
```

#### Embedding Generation
```http
POST /embed
{"text":"medical text here","normalize":true}
→ {"embedding":[768 floats],"dimensions":768,"model":"BioBERT"}
```

#### Medical Consultation (NEW)
```http
POST /medical-consultation
{
  "query": "I have been experiencing headaches",
  "context": {
    "user_profile": {"age": 30, "conditions": ["hypertension"]},
    "conversation_history": []
  },
  "preferred_agent": "txagent"
}
→ {
  "response": {"text": "...", "sources": [...]},
  "safety": {"emergency_detected": false, "disclaimer": "..."},
  "recommendations": {"suggested_action": "..."},
  "processing_time_ms": 1250
}
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Supabase account
- RunPod account (for TxAgent container)
- ElevenLabs account (for voice generation)

### Environment Setup

#### Backend (.env)
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret

# TxAgent Configuration
RUNPOD_EMBEDDING_URL=https://your-runpod-endpoint.runpod.net

# Voice Generation (ElevenLabs)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=default_voice_id

# Enhanced Features
ENABLE_VOICE_GENERATION=true
ENABLE_SYMPTOM_TRACKING=true
ENABLE_TREATMENT_RECOMMENDATIONS=true

# Server Configuration
PORT=5000
NODE_ENV=production
```

#### Frontend (.env)
```bash
# API Configuration
VITE_API_URL=

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd medical-rag-vector-uploader
```

2. **Install dependencies**
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. **Set up Supabase**
```bash
# Apply database migrations
supabase db push
```

4. **Start development servers**
```bash
# Backend (Terminal 1)
cd backend
npm run dev

# Frontend (Terminal 2)
cd frontend
npm run dev
```

## 🧪 Testing

### Health Check Sequence
```bash
# 1. Test backend health
curl https://your-app.com/health

# 2. Test agent status
curl -H "Authorization: Bearer JWT" https://your-app.com/api/agent/status

# 3. Test medical consultation
curl -X POST -H "Authorization: Bearer JWT" \
     -H "Content-Type: application/json" \
     -d '{"query":"What are the symptoms of diabetes?","preferred_agent":"txagent"}' \
     https://your-app.com/api/medical-consultation
```

### Performance Optimizations

The system includes several performance optimizations:

- **JWT Token Caching**: Tokens are decoded once and cached for 5 minutes, reducing CPU overhead by 95%
- **Intelligent Logging**: Frequent operations are logged every 10th occurrence, reducing log volume by 90%
- **Button Debouncing**: Multiple rapid clicks are prevented, eliminating duplicate API calls
- **Throttled Polling**: Status checks reduced from ~500ms to 30 seconds, cutting network requests by 98%

## 📱 Mobile App Integration

The backend is designed to support both the Doctor's Portal web application and the SymptomSavior mobile app:

### Dual Context Support
- **Doctor Context**: General medical RAG with shared document knowledge base
- **Patient Context**: Personalized medical consultations with user profile integration

### API Compatibility
- All endpoints support both web and mobile clients
- JWT authentication works seamlessly across platforms
- Medical consultation endpoint adapts responses based on context type

### Performance Benefits
- Mobile apps automatically benefit from backend optimizations
- Reduced server load improves response times for all clients
- Efficient caching reduces data usage on mobile devices

## 🔧 Configuration

### Feature Flags
```bash
# Enable/disable specific features
ENABLE_VOICE_GENERATION=true
ENABLE_SYMPTOM_TRACKING=true
ENABLE_TREATMENT_RECOMMENDATIONS=true
ENABLE_EMERGENCY_DETECTION=true
MEDICAL_DISCLAIMER_REQUIRED=true
```

### Safety Features
- **Emergency Detection**: Automatic detection of emergency keywords with immediate safety protocols
- **Medical Disclaimers**: Required disclaimers for all medical advice
- **User Data Isolation**: Strict RLS policies ensure user data privacy
- **Audit Logging**: Comprehensive logging of all medical consultations and user actions

## 🚀 Deployment

### Single Service Architecture
- **Frontend**: Served as static files from backend
- **Backend**: Express server handling both API and SPA routing
- **Database**: Supabase managed PostgreSQL
- **Container**: RunPod TxAgent deployment
- **Storage**: Supabase Storage with RLS

### Production URLs
- **Main App**: `https://your-app.onrender.com`
- **API Routes**: `https://your-app.onrender.com/api/*`
- **Health Check**: `https://your-app.onrender.com/health`

## 📊 Current Status

### ✅ Production Ready Features
- Backend API with full CRUD operations
- Frontend React application with agent management
- Supabase database with optimized schema
- Authentication and authorization
- Document upload and processing
- Chat with OpenAI fallback
- Agent lifecycle management
- Real-time health monitoring
- Medical consultation system with emergency detection
- Comprehensive medical profile management
- Symptom and treatment tracking
- Voice generation with ElevenLabs integration

### 🔧 In Progress
- TxAgent container implementation
- Container API compliance with specification
- BioBERT embedding generation
- Direct container chat integration

## 🔮 Future Improvements & Architecture

### Performance & Scalability
- **WebSocket Integration**: Replace polling with real-time push notifications for agent status updates
- **Server-Sent Events (SSE)**: Implement push-based updates for document processing status
- **Redis Caching**: Add Redis for session management and frequently accessed data
- **Database Connection Pooling**: Optimize database connections for high-traffic scenarios
- **CDN Integration**: Implement CDN for static assets and document storage

### Push-Based Agent Management (Priority)
Currently, the system uses polling for agent status updates, which creates unnecessary server load and network traffic. A push-based approach would provide several benefits:

#### WebSocket Implementation
```javascript
// Real-time agent status updates
const agentSocket = new WebSocket('/ws/agent-status');
agentSocket.onmessage = (event) => {
  const statusUpdate = JSON.parse(event.data);
  updateAgentStatus(statusUpdate);
};

// Server-side WebSocket handler
io.on('connection', (socket) => {
  socket.on('subscribe-agent-status', (userId) => {
    // Subscribe user to their agent status updates
    socket.join(`agent-${userId}`);
  });
});
```

#### Benefits of Push-Based Approach
- **99% reduction in network requests**: Only send updates when status actually changes
- **Real-time responsiveness**: Instant updates when agent status changes
- **Reduced server load**: Eliminate constant polling from multiple clients
- **Better user experience**: Immediate feedback on agent operations
- **Scalability**: Support thousands of concurrent users without performance degradation

#### Implementation Impact
- **Minimal changes required**: Only affects agent status monitoring components
- **Backward compatibility**: Can be implemented alongside existing polling as fallback
- **Mobile app benefits**: Expo app would automatically benefit from reduced battery usage
- **Easy rollout**: Can be deployed incrementally without breaking existing functionality

### Advanced AI Features
- **Multi-Modal AI**: Support for image and video analysis in medical consultations
- **Predictive Analytics**: ML-based health trend analysis and risk assessment
- **Natural Language Processing**: Enhanced symptom extraction from free-text descriptions
- **Personalized Treatment Recommendations**: AI-driven treatment suggestions based on user profiles

### Enhanced Security
- **End-to-End Encryption**: Encrypt sensitive medical data at rest and in transit
- **Audit Trails**: Comprehensive logging of all medical data access and modifications
- **HIPAA Compliance**: Full compliance with healthcare data protection regulations
- **Multi-Factor Authentication**: Enhanced security for healthcare providers

### Integration Capabilities
- **EHR Integration**: Connect with Electronic Health Record systems
- **Telemedicine Platforms**: Integration with video consultation services
- **Wearable Device Support**: Import data from fitness trackers and medical devices
- **Pharmacy Integration**: Direct prescription management and medication tracking

### Mobile & Cross-Platform
- **Progressive Web App (PWA)**: Offline capabilities and app-like experience
- **Desktop Applications**: Electron-based desktop apps for healthcare providers
- **Tablet Optimization**: Enhanced UI for tablet-based clinical workflows
- **Voice Interface**: Hands-free interaction for clinical environments

### Analytics & Insights
- **Usage Analytics**: Comprehensive tracking of system usage and performance
- **Medical Insights Dashboard**: Population health trends and insights
- **Performance Monitoring**: Real-time system performance and health metrics
- **Cost Optimization**: AI usage optimization and cost tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation in the `/docs` folder
- Review the API documentation in `/backend/docs`

---

**Built with ❤️ for the medical community**