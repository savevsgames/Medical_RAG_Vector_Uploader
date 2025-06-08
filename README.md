# Medical RAG Vector Uploader

A full-stack intelligent document analysis platform that combines BioBERT embeddings with containerized AI agents for medical document processing and query assistance.

## 🚀 Quick Links

- **🐳 Container Image**: [ghcr.io/savevsgames/txagent-hybrid:latest](https://ghcr.io/savevsgames/txagent-hybrid:latest) (v15)
- **🌐 Live Demo**: [medical-rag-vector-uploader.onrender.com](https://medical-rag-vector-uploader.onrender.com/)
- **📦 Container Repository**: [TxAgentContainer-SupabaseRAG](https://github.com/savevsgames/TxAgentContainer-SupabaseRAG)
- **🖥️ Frontend Repository**: [Medical_RAG_Vector_Uploader](https://github.com/savevsgames/Medical_RAG_Vector_Uploader)

## 🏗️ Architecture Overview

This application consists of three main components:

1. **Frontend**: React + TypeScript application with Tailwind CSS
2. **Backend**: Node.js + Express API server with comprehensive agent management
3. **TxAgent Container**: Containerized BioBERT processing engine (RunPod/Docker)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │───▶│   Node.js API   │───▶│  TxAgent        │
│   (Frontend)    │    │   (Backend)     │    │  Container      │
│                 │    │                 │    │  (BioBERT)      │
│ • Document UI   │    │ • Authentication│    │ • Embeddings    │
│ • Chat Interface│    │ • File Processing│    │ • Chat AI       │
│ • Agent Monitor │    │ • Agent Sessions│    │ • Health Check  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │     Supabase DB         │
                    │                         │
                    │ • User Authentication   │
                    │ • Document Storage      │
                    │ • Vector Embeddings     │
                    │ • Agent Sessions        │
                    └─────────────────────────┘
```

## ✨ Features

### Current Features
- ✅ **Secure Authentication**: Supabase Auth with JWT tokens
- ✅ **Document Upload**: Support for PDF, DOCX, TXT, MD files
- ✅ **BioBERT Embeddings**: Medical-specific 768-dimensional vectors
- ✅ **Vector Search**: Fast similarity search with pgvector
- ✅ **Agent Management**: TxAgent container session lifecycle
- ✅ **Real-time Monitoring**: Agent status and health checks
- ✅ **Row-Level Security**: User-isolated data access
- ✅ **Responsive UI**: Modern React interface with Tailwind CSS
- ✅ **Comprehensive Logging**: Debug and monitoring capabilities

### AI Capabilities
- 🤖 **Dual AI Agents**: TxAgent (BioBERT) + OpenAI (GPT) fallback
- 📄 **Document Analysis**: Intelligent chunking and embedding
- 💬 **Contextual Chat**: RAG-powered medical query assistance
- 🔍 **Semantic Search**: Vector similarity matching
- 📊 **Source Attribution**: Document references with similarity scores

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **Supabase Project** with vector extension enabled
- **RunPod Account** (optional, for TxAgent container)

### Local Development

1. **Clone and Install**
```bash
git clone <repository-url>
cd medical-rag-vector-uploader

# Install all dependencies (frontend + backend)
npm install
```

2. **Environment Setup**
```bash
# Copy environment templates
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. **Configure Environment Variables**

**Root `.env`:**
```env
# Frontend Environment Variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_API_URL=http://localhost:8000

# Backend Environment Variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key_here
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here
PORT=8000

# TxAgent Container (Optional)
RUNPOD_EMBEDDING_URL=https://your-runpod-proxy-url.proxy.runpod.net
RUNPOD_EMBEDDING_KEY=your_runpod_api_key_here

# Fallback Services
OPENAI_API_KEY=your_openai_api_key_here
```

**Backend `.env`:**
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key_here
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here

# API Configuration
PORT=8000
BACKEND_DEBUG_LOGGING=true

# TxAgent Container
RUNPOD_EMBEDDING_URL=https://your-runpod-proxy-url.proxy.runpod.net
RUNPOD_EMBEDDING_KEY=your_runpod_api_key_here

# External Services
OPENAI_API_KEY=your_openai_api_key_here
```

**Frontend `.env`:**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_API_URL=http://localhost:8000
```

4. **Database Setup**

Run the Supabase migration to set up the database schema:
```sql
-- Apply the migration from supabase/migrations/
-- This creates documents, agents, and embedding_jobs tables
-- with proper RLS policies and vector search functions
```

5. **Start Development**
```bash
# Start both frontend and backend
npm run dev

# Or start individually:
npm run dev:frontend  # Frontend only (http://localhost:5173)
npm run dev:backend   # Backend only (http://localhost:8000)
```

### Production Deployment

#### Option 1: Render.com (Recommended)
1. **Fork the repository**
2. **Connect to Render.com**
3. **Configure environment variables** in Render dashboard
4. **Deploy using the provided `render.yaml`**

#### Option 2: Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up --build

# Or build individually
cd backend && docker build -t medical-rag-backend .
cd frontend && docker build -t medical-rag-frontend .
```

#### Option 3: Manual Deployment
```bash
# Build frontend
npm run build:frontend

# Start backend (serves frontend static files)
npm run start
```

## 🗄️ Database Schema

### Core Tables

#### `documents`
Stores document chunks with BioBERT embeddings for vector search.
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  filename TEXT,
  content TEXT NOT NULL,
  embedding VECTOR(768),           -- BioBERT embeddings
  metadata JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `agents`
Manages TxAgent container sessions and lifecycle.
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'initializing',
  session_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now(),
  terminated_at TIMESTAMPTZ
);
```

#### `embedding_jobs`
Tracks document processing job status.
```sql
CREATE TABLE embedding_jobs (
  id UUID PRIMARY KEY,
  file_path TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  chunk_count INTEGER DEFAULT 0,
  error TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Vector Search Function
```sql
-- Optimized vector similarity search with RLS
CREATE FUNCTION match_documents(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INTEGER DEFAULT 5
) RETURNS TABLE (
  id UUID,
  filename TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
);
```

## 🔌 API Endpoints

### Authentication
All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### Health & Status
- `GET /health` - Service health check
- `GET /api/agent/status` - Agent session status
- `GET /api/agent/stats` - Agent statistics

### Document Management
- `POST /upload` - Upload and process documents
- `GET /api/documents` - List user documents
- `DELETE /api/documents/:id` - Delete document

### Agent Operations
- `POST /api/agent/start` - Activate TxAgent session
- `POST /api/agent/stop` - Deactivate TxAgent session
- `GET /api/agent/status` - Check agent status

### AI Chat & Embeddings
- `POST /api/chat` - Chat with TxAgent (BioBERT)
- `POST /api/openai-chat` - Chat with OpenAI (GPT + RAG)
- `POST /api/embed` - Generate embeddings via TxAgent

### Legacy Endpoints (Deprecated)
- `POST /agent/*` - Legacy agent endpoints
- `POST /chat` - Legacy chat endpoint

## 🐳 TxAgent Container

The TxAgent container provides specialized BioBERT processing capabilities:

### Container Endpoints
- `GET /health` - Container health check
- `POST /embed` - Generate BioBERT embeddings
- `POST /chat` - Medical document chat
- `GET /embedding-jobs/:id` - Job status

### Container Features
- **BioBERT Model**: Medical-specific transformer model
- **GPU Acceleration**: CUDA support for fast processing
- **Authentication**: JWT token validation
- **Logging**: Comprehensive request/response logging
- **Health Monitoring**: Real-time status reporting

### RunPod Integration
```bash
# Deploy TxAgent container on RunPod
docker run -p 8000:8000 \
  -e SUPABASE_URL=your_url \
  -e SUPABASE_ANON_KEY=your_key \
  ghcr.io/savevsgames/txagent-hybrid:latest
```

## 🔒 Security Features

### Authentication & Authorization
- **JWT Tokens**: Supabase Auth integration
- **Row-Level Security**: User data isolation
- **CORS Protection**: Configured origins
- **Rate Limiting**: API endpoint protection

### Data Security
- **Encrypted Storage**: Supabase encryption at rest
- **Secure Transmission**: HTTPS/TLS encryption
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries

## 📊 Monitoring & Debugging

### Logging Levels
- **Frontend**: Browser console with structured logging
- **Backend**: File-based logging with rotation
- **Container**: Structured JSON logging

### Debug Mode
Enable comprehensive logging:
```env
BACKEND_DEBUG_LOGGING=true
VITE_DEBUG_LOGGING=true
```

### Health Checks
- **Database**: Connection and query performance
- **Container**: TxAgent availability and response times
- **Authentication**: JWT validation success rates

## 🛠️ Development Tools

### Available Scripts
```bash
# Development
npm run dev                 # Start both frontend and backend
npm run dev:frontend        # Frontend only
npm run dev:backend         # Backend only

# Building
npm run build              # Build frontend for production
npm run build:frontend     # Build frontend only

# Production
npm start                  # Start production server
npm run render:build       # Render.com build command
npm run render:start       # Render.com start command

# Maintenance
npm run lint               # Lint frontend code
npm run install:frontend   # Install frontend dependencies
npm run install:backend    # Install backend dependencies
```

### File Structure
```
medical-rag-vector-uploader/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Main application pages
│   │   ├── hooks/          # Custom React hooks
│   │   ├── contexts/       # React contexts
│   │   └── utils/          # Utility functions
│   └── dist/               # Built frontend assets
├── backend/                 # Node.js API server
│   ├── agent_utils/        # Agent management logic
│   ├── lib/                # Core services
│   ├── middleware/         # Express middleware
│   ├── routes/             # API route handlers
│   └── config/             # Configuration files
├── supabase/
│   └── migrations/         # Database migrations
└── docs/                   # Documentation
```

## 🚨 Known Issues & Troubleshooting

### Common Issues

1. **404 on /api/agent/start**
   - **Cause**: TxAgent container doesn't have /start endpoint
   - **Solution**: Use Node.js backend /api/agent/start for session management

2. **"undefined" in API URLs**
   - **Cause**: Environment variables not properly loaded
   - **Solution**: Verify VITE_API_URL is set correctly

3. **Vector Search Errors**
   - **Cause**: Missing pgvector extension or wrong function signature
   - **Solution**: Run latest migration and verify function permissions

4. **Authentication Failures**
   - **Cause**: Invalid JWT secret or expired tokens
   - **Solution**: Check SUPABASE_JWT_SECRET and token expiration

### Debug Commands
```bash
# Check environment variables
echo $VITE_API_URL
echo $SUPABASE_URL

# Test database connection
curl http://localhost:8000/health

# Test TxAgent container
curl https://your-runpod-url.proxy.runpod.net/health
```

## 📈 Performance Optimization

### Database Performance
- **Vector Indexes**: IVFFlat indexes for fast similarity search
- **Connection Pooling**: Optimized Supabase connections
- **Query Optimization**: Efficient RLS policies

### Frontend Performance
- **Code Splitting**: Lazy-loaded components
- **Bundle Optimization**: Tree shaking and minification
- **Caching**: React Query for server state management

### Container Performance
- **GPU Acceleration**: CUDA-enabled BioBERT processing
- **Memory Management**: Optimized model loading
- **Request Batching**: Efficient embedding generation

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

### Code Standards
- **TypeScript**: Strict type checking
- **ESLint**: Code quality enforcement
- **Prettier**: Code formatting
- **Testing**: Unit and integration tests

## 📄 License

This project is licensed under the MIT License. See LICENSE file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/savevsgames/Medical_RAG_Vector_Uploader/issues)
- **Documentation**: See `SUPABASE_CONFIG.md` and `IMPROVEMENT_PLAN.md`
- **Container Docs**: [TxAgent Repository](https://github.com/savevsgames/TxAgentContainer-SupabaseRAG)

---

**Built with ❤️ for medical professionals and researchers**