# Medical RAG Vector Uploader

A comprehensive medical document processing and chat application with RunPod containerized AI agent integration.

## 🏗️ Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express
- **Database**: Supabase (PostgreSQL)
- **AI Agent**: TxAgent (RunPod containerized)
- **Authentication**: Supabase Auth with JWT
- **Storage**: Supabase Storage with RLS

## 🔐 Authentication Flow

### JWT Token Flow

1. **Frontend** → Login via Supabase Auth
2. **Supabase** → Returns JWT token
3. **Frontend** → Stores token in localStorage
4. **All API calls** → Include `Authorization: Bearer {token}`
5. **Backend** → Validates JWT with `SUPABASE_JWT_SECRET`
6. **TxAgent** → Receives JWT and uses authenticated Supabase client

### Key Auth Points

- **Backend**: Service role for admin operations
- **TxAgent**: User JWT for RLS-compliant operations
- **Storage**: User-scoped uploads (`userId/filename` structure)

## 🛠️ API Endpoints

### Core Application Endpoints

#### Health & Status

```http
GET /health
# Public endpoint - no auth required
# Returns: Server health status
```

#### Document Management

```http
POST /upload
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data
Body: { file: File }
# Returns: { job_id, status, file_path, poll_url }

GET /api/documents/job-status/{job_id}
Authorization: Bearer {jwt_token}
# Returns: { job_id, status, progress, created_at, updated_at }
```

#### Chat Endpoints

```http
POST /api/chat
Authorization: Bearer {jwt_token}
Content-Type: application/json
Body: {
  "message": "string",
  "top_k": 5,
  "temperature": 0.7
}
# Routes to TxAgent /chat endpoint
# Returns: { response, sources, processing_time }

POST /api/openai-chat
Authorization: Bearer {jwt_token}
Content-Type: application/json
Body: {
  "message": "string"
}
# Fallback OpenAI RAG chat
# Returns: { response, sources, model, tokens_used }
```

#### Agent Management

```http
GET /api/agent/status
Authorization: Bearer {jwt_token}
# Returns: { agent_active, agent_id, container_status, session_data }

POST /api/agent/start
Authorization: Bearer {jwt_token}
# Creates new TxAgent session
# Returns: { agent_id, session_data, runpod_endpoint }

POST /api/agent/stop
Authorization: Bearer {jwt_token}
# Terminates active TxAgent session
# Returns: { success, message }

POST /api/agent/health-check
Authorization: Bearer {jwt_token}
# Comprehensive health check of TxAgent endpoints
# Returns: { container_reachable, endpoints_working, test_results }
```

#### Embedding Proxy

```http
POST /api/embed
Authorization: Bearer {jwt_token}
Content-Type: application/json
Body: {
  "text": "string",
  "normalize": true
}
# Proxies to TxAgent /embed endpoint
# Returns: { embedding: number[], metadata }
```

### TxAgent Container Endpoints

#### Direct TxAgent Endpoints (via RUNPOD_EMBEDDING_URL)

```http
GET /health
# Container health check
# Returns: { status, version, uptime }

POST /chat
Authorization: Bearer {jwt_token}
Content-Type: application/json
Body: {
  "query": "string",
  "top_k": 5,
  "temperature": 0.7,
  "history": []
}
# Returns: { response, sources, processing_time }

POST /embed
Authorization: Bearer {jwt_token}
Content-Type: application/json
Body: {
  "text": "string",
  "normalize": true,
  "metadata": {}
}
# Returns: { embedding: number[], metadata }

POST /process-document
Authorization: Bearer {jwt_token}
Content-Type: application/json
Body: {
  "file_path": "userId/filename.pdf",
  "metadata": {
    "title": "string",
    "description": "string",
    "user_id": "string"
  }
}
# Returns: { job_id, status, message }

GET /embedding-jobs/{job_id}
Authorization: Bearer {jwt_token}
# Returns: { job_id, status, progress, created_at, updated_at }
```

## 🔄 Document Processing Flow

### Complete Upload & Processing Pipeline

1. **File Upload**

   ```
   Frontend → POST /upload → Backend
   ├── Validates file (50MB limit, allowed types)
   ├── Creates object key: userId/timestamp_filename
   ├── Uploads to Supabase Storage (RLS compliant)
   └── Returns: { file_path, job_id }
   ```

2. **TxAgent Processing**

   ```
   Backend → POST /process-document → TxAgent
   ├── TxAgent validates JWT
   ├── Creates job record in embedding_jobs table
   ├── Starts background processing
   └── Returns: { job_id, status: "queued" }
   ```

3. **Status Polling**

   ```
   Frontend → GET /job-status/{job_id} → Backend → TxAgent
   ├── TxAgent uses authenticated client
   ├── Queries embedding_jobs with RLS
   └── Returns: { status: "queued" | "processing" | "completed" | "failed" }
   ```

4. **Vector Storage**
   ```
   TxAgent Background Process:
   ├── Downloads file from Supabase Storage
   ├── Extracts text content
   ├── Generates embeddings
   ├── Stores vectors in vector database
   └── Updates job status to "completed"
   ```

## 🔧 Key Configuration

### Environment Variables

#### Backend (.env)

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key_here  # Service role key
SUPABASE_JWT_SECRET=your_jwt_secret_here

# TxAgent Configuration
RUNPOD_EMBEDDING_URL=https://your-runpod-endpoint.runpod.net

# Server Configuration
PORT=5000
NODE_ENV=production
```

#### Frontend (.env.production)

```bash
# API Configuration
VITE_API_URL=
# Empty = same domain for single-service deployment

# Supabase Configuration (for auth)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### Critical Authentication Notes

#### RLS Policies

```sql
-- Storage policy for user-scoped uploads
CREATE POLICY "User file access" ON storage.objects
FOR ALL USING (
  bucket_id = 'documents' AND (
    auth.role() = 'service_role' OR
    auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- embedding_jobs table policy
CREATE POLICY "User job access" ON embedding_jobs
FOR ALL USING (
  auth.role() = 'service_role' OR
  auth.uid() = user_id
);
```

#### TxAgent Authentication

- **CRITICAL**: TxAgent must use authenticated Supabase client for all database operations
- **JWT Required**: All TxAgent endpoints require valid JWT token
- **RLS Compliance**: Job creation and querying must respect user isolation

## 🚨 Common Issues & Solutions

### Upload Issues

- **RLS Violation**: Ensure file path starts with `userId/`
- **Job Not Found**: TxAgent using anonymous client instead of authenticated
- **File Size**: 50MB limit enforced by multer

### Authentication Issues

- **Invalid JWT**: Check `SUPABASE_JWT_SECRET` configuration
- **Anonymous User**: Verify JWT token in Authorization header
- **CORS**: Ensure frontend domain in CORS whitelist

### Container Issues

- **Unreachable**: Check `RUNPOD_EMBEDDING_URL` configuration
- **Timeout**: TxAgent endpoints have 60s timeout
- **Health Check**: Use `/api/agent/health-check` for diagnostics

## 🧪 Testing Endpoints

### Quick Health Check

```bash
# Test backend health
curl https://your-app.onrender.com/health

# Test TxAgent health (requires JWT)
curl -H "Authorization: Bearer YOUR_JWT" \
     https://your-app.onrender.com/api/agent/test-health
```

### Upload Test

```bash
# Test file upload
curl -X POST \
     -H "Authorization: Bearer YOUR_JWT" \
     -F "file=@test.pdf" \
     https://your-app.onrender.com/upload
```

## 🔄 Deployment

### Single Service Deployment (Recommended)

```yaml
# render.yaml
services:
  - type: web
    name: medical-rag-app
    env: node
    buildCommand: |
      cd frontend && npm install && npm run build &&
      cd ../backend && npm install
    startCommand: cd backend && npm start
```

### SPA Routing

- Backend serves frontend files from `/`
- SPA fallback serves `index.html` for client-side routes
- API routes (`/api/*`, `/health`, `/upload`) handled by Express

## 📊 Monitoring

### Agent Status Dashboard

- Real-time agent session monitoring
- Container health checks
- Endpoint testing utilities
- Processing job status tracking

### Logging

- Structured logging with winston
- Request/response logging
- Error tracking with stack traces
- Performance metrics
