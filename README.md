# Medical RAG Vector Uploader

A sophisticated medical document analysis system that combines BioBERT-powered AI with OpenAI's GPT models for comprehensive medical document processing and intelligent chat interactions.

## 🏗️ Architecture Overview

### Frontend (React + TypeScript)
- **Chat Interface**: Dual-agent system (TxAgent + OpenAI)
- **Document Management**: Upload, view, edit medical documents
- **Agent Monitoring**: Real-time TxAgent container status and health
- **Authentication**: Supabase Auth with JWT tokens

### Backend (Node.js + Express)
- **Document Processing**: PDF, DOCX, TXT, MD text extraction and chunking
- **Embedding Generation**: BioBERT (768-dim) via TxAgent + OpenAI fallback
- **Vector Storage**: Supabase with pgvector extension
- **Agent Management**: RunPod container lifecycle and health monitoring
- **Chat Proxy**: Routes chat requests to appropriate AI service

### Database (Supabase + PostgreSQL)
- **Documents**: Vector embeddings with metadata and RLS
- **Agents**: Session management for TxAgent containers
- **Embedding Jobs**: Processing status tracking

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account
- RunPod account (for TxAgent)
- OpenAI API key (fallback)

### Environment Setup

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

#### Backend (.env)
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret

# TxAgent Configuration
RUNPOD_EMBEDDING_URL=https://your-runpod-url.proxy.runpod.net
RUNPOD_EMBEDDING_KEY=your_runpod_api_key

# OpenAI Fallback
OPENAI_API_KEY=your_openai_key

# Server Configuration
PORT=8000
BACKEND_DEBUG_LOGGING=true
```

### Installation

```bash
# Install dependencies
npm install
cd frontend && npm install
cd ../backend && npm install

# Start development servers
npm run dev:frontend  # Port 5173
npm run dev:backend   # Port 8000
```

## 🤖 TxAgent Container Integration

### Required Endpoints

The TxAgent container must implement these endpoints for full integration:

#### 1. Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "model": "BioBERT",
  "device": "cuda:0",
  "version": "1.0.0"
}
```

#### 2. Chat Endpoint
```http
POST /chat
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Request:**
```json
{
  "query": "What are the symptoms of myocardial infarction?",
  "top_k": 5,
  "temperature": 0.7,
  "history": [],
  "stream": false
}
```

**Response:**
```json
{
  "response": "Myocardial infarction symptoms include chest pain, shortness of breath...",
  "sources": [
    {
      "filename": "cardiology-guidelines.pdf",
      "similarity": 0.89
    }
  ],
  "processing_time": 1250
}
```

#### 3. Embedding Endpoint
```http
POST /embed
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Request:**
```json
{
  "text": "Patient presents with chest pain and dyspnea"
}
```

**Response:**
```json
{
  "embedding": [0.1234, -0.5678, ...],  // 768-dimensional array
  "dimensions": 768,
  "model": "BioBERT"
}
```

### Authentication
- All endpoints receive the user's JWT token in the `Authorization` header
- The container should validate tokens or trust the backend proxy
- User context can be extracted from JWT for personalization

### Error Handling
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional error details"
}
```

## 📊 API Endpoints

### Chat Endpoints

#### TxAgent Chat
```http
POST /api/chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "What are the symptoms of diabetes?",
  "top_k": 5,
  "temperature": 0.7
}
```

#### OpenAI Chat
```http
POST /api/openai-chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "Summarize the uploaded cardiology documents",
  "context": []
}
```

### Agent Management

#### Start TxAgent
```http
POST /api/agent/start
Authorization: Bearer <jwt_token>
```

#### Get Agent Status
```http
GET /api/agent/status
Authorization: Bearer <jwt_token>
```

#### Stop TxAgent
```http
POST /api/agent/stop
Authorization: Bearer <jwt_token>
```

### Document Management

#### Upload Document
```http
POST /upload
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

file: <document_file>
```

#### Direct Embedding
```http
POST /api/embed
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "documentText": "Medical text to embed",
  "metadata": {}
}
```

## 🔧 Current Implementation Status

### ✅ Working Components
- **Agent Activation**: Complete lifecycle management
- **Health Monitoring**: Real-time container status
- **OpenAI Chat**: Full RAG functionality
- **Document Upload**: Multi-format processing
- **Vector Search**: 768-dimensional similarity search
- **Authentication**: JWT-based security

### 🚧 In Progress
- **TxAgent Chat Integration**: Backend proxy implemented, awaiting container API compliance
- **Embedding Consistency**: Ensuring 768-dim vectors across all services

### 📋 Known Issues
1. **TxAgent Chat**: Container must implement exact request/response format above
2. **Health Check**: Container must handle trailing slash removal in URLs
3. **Vector Dimensions**: All embeddings must be 768-dimensional for compatibility

## 🧪 Testing

### Manual Testing
```bash
# Test TxAgent health directly
curl -X GET "https://your-runpod-url.proxy.runpod.net/health"

# Test TxAgent chat directly
curl -X POST "https://your-runpod-url.proxy.runpod.net/chat" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","top_k":5,"temperature":0.7,"history":[],"stream":false}'

# Test TxAgent embedding directly
curl -X POST "https://your-runpod-url.proxy.runpod.net/embed" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"test medical text"}'
```

### Integration Testing
1. **Agent Activation**: Monitor page → Activate TxAgent
2. **Health Check**: Verify all endpoints return 200
3. **Chat Flow**: Send message via chat interface
4. **Document Upload**: Upload PDF and verify embedding generation

## 🔒 Security

### Row Level Security (RLS)
- **Documents**: Shared read access, user-owned write access
- **Agents**: User-isolated sessions
- **Embedding Jobs**: User-isolated processing

### Function Security
- All database functions use `SECURITY DEFINER`
- Fixed search paths prevent injection attacks
- Proper volatility classifications for PostgreSQL compliance

## 📈 Performance

### Vector Search Optimization
- IVFFlat index with 100 lists for 768-dimensional vectors
- Cosine similarity for medical document matching
- Configurable similarity thresholds

### Caching Strategy
- Agent status cached for 30 seconds
- Document embeddings cached permanently
- Health checks cached for 5 minutes

## 🚀 Deployment

### Backend (Render/Railway)
```yaml
services:
  - type: web
    name: medical-rag-backend
    env: node
    buildCommand: cd backend && npm install
    startCommand: cd backend && npm start
```

### Frontend (Netlify/Vercel)
```yaml
build:
  command: cd frontend && npm run build
  publish: frontend/dist
redirects:
  - from: /*
    to: /index.html
    status: 200
```

## 📚 Documentation

- **[ROUTING.md](ROUTING.md)**: Complete request flow analysis
- **[MGCXT.md](MGCXT.md)**: Database schema and migration context
- **[SUPABASE_CONFIG.md](SUPABASE_CONFIG.md)**: Database setup guide

## 🤝 Contributing

### For TxAgent Container Developers
1. Implement the three required endpoints above
2. Ensure 768-dimensional embeddings
3. Handle JWT authentication properly
4. Test with the provided curl commands

### For Frontend/Backend Developers
1. Follow the established patterns in the codebase
2. Add comprehensive logging for debugging
3. Maintain type safety with TypeScript
4. Test both TxAgent and OpenAI paths

## 📞 Support

For issues related to:
- **TxAgent Container**: Check endpoint implementations against this spec
- **Backend API**: Review logs and error messages
- **Database**: Check Supabase dashboard and RLS policies
- **Frontend**: Use browser dev tools and network tab

## 🎯 Roadmap

- [ ] **TxAgent Chat**: Complete container API implementation
- [ ] **Streaming Responses**: Real-time chat streaming
- [ ] **Multi-modal Support**: Image and audio processing
- [ ] **Advanced RAG**: Hybrid search and re-ranking
- [ ] **Analytics Dashboard**: Usage metrics and insights