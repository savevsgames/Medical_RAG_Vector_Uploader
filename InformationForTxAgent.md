# Medical RAG Vector Uploader - TxAgent Integration Summary

## Application Overview

### Medical RAG Vector Uploader (Node.js Backend + React Frontend)

This is a full-stack medical document analysis application designed to work with containerized AI agents for intelligent document processing and querying.

**Architecture:**
- **Backend**: Node.js/Express API server (deployed on Render)
- **Frontend**: React/Vite static site (deployed on Vercel/Netlify)
- **Database**: Supabase with pgvector extension for vector storage
- **AI Agent**: TxAgent container (Python/FastAPI) running on RunPod

**Core Components:**

1. **Document Processing Pipeline**:
   - Users upload medical documents (PDF, DOCX, TXT, MD) via React frontend
   - Backend extracts text using specialized libraries (pdf-parse, mammoth, marked)
   - Documents are processed for embedding generation
   - Embeddings stored in Supabase `documents` table with user-specific RLS

2. **Agent Management System**:
   - Tracks TxAgent container sessions in Supabase `agents` table
   - Manages agent lifecycle (start/stop/status monitoring)
   - Handles authentication forwarding to containerized agents

3. **Chat Interface**:
   - React-based chat UI for querying documents
   - Supports both TxAgent container and fallback OpenAI integration
   - Real-time status monitoring and error handling

## TxAgent Container Integration

### Expected TxAgent Container Endpoints

Based on the Python FastAPI code provided:

1. **`GET /health`**:
   - Returns service status, BioBERT model info, device type, version
   - Used for container health monitoring

2. **`POST /embed`**:
   - Processes documents from Supabase Storage
   - Extracts text, creates BioBERT embeddings, stores in database
   - Requires Supabase JWT authentication
   - Runs as background task, returns immediate response

3. **`POST /chat`**:
   - Performs vector similarity search against stored embeddings
   - Returns relevant document chunks with similarity scores
   - Requires Supabase JWT authentication
   - Expected payload: `{"query": "text", "history": [], "top_k": 5, "temperature": 0.7}`

### Authentication Flow

- Frontend authenticates users via Supabase Auth
- Backend receives Supabase JWT tokens
- Backend forwards JWT tokens to TxAgent container in `Authorization: Bearer <token>` header
- TxAgent container validates JWT using `SUPABASE_JWT_SECRET`
- User ID extracted from JWT `sub` claim for RLS enforcement

## Integration Status Report

### ✅ What Works

#### Document Upload & Storage
- **Status**: ✅ WORKING
- **Details**: 
  - PDF text extraction successful (75,227 characters from test document)
  - Supabase document storage working
  - User authentication and RLS policies functioning
  - File upload UI and backend processing complete

#### Agent Health Monitoring
- **Status**: ✅ WORKING
- **Details**:
  - `/health` endpoint accessible
  - Container status reporting functional
  - Health check integration in Monitor page working

#### Authentication System
- **Status**: ✅ WORKING
- **Details**:
  - Supabase JWT generation and validation working
  - User sessions maintained across frontend/backend
  - JWT forwarding to TxAgent container implemented

### ❌ What Doesn't Work

#### Chat Endpoint Communication
- **Status**: ❌ FAILING
- **Error**: `405 Method Not Allowed` for `POST /chat`
- **Details**:
  - Node.js backend correctly sends POST requests to `/chat`
  - TxAgent container returns 405 despite having `@app.post("/chat")` defined
  - All attempted endpoints fail: `/chat`, `/api/chat`, `/query`, `/ask`
  - JWT authentication headers being sent correctly

#### Agent Status Retrieval
- **Status**: ❌ FAILING  
- **Error**: `invalid input syntax for type uuid: "undefined"`
- **Details**:
  - Agent status endpoint receiving undefined user_id
  - JWT validation failing in agent status requests
  - Monitor page showing "Inactive" status consistently

#### Document Embedding via TxAgent
- **Status**: ❌ FAILING
- **Error**: Similar 405/404 errors when attempting to use TxAgent for embedding
- **Details**:
  - Backend falls back to local OpenAI embedding service
  - TxAgent `/embed` endpoint not responding correctly
  - Background processing not completing

### 🔍 What We Can Rule Out

#### Network Connectivity Issues
- **Ruled Out**: Container is reachable (health checks work)
- **Evidence**: GET requests to `/health` return 200 OK with proper JSON

#### Authentication Token Issues
- **Ruled Out**: JWT tokens are valid and properly formatted
- **Evidence**: 
  - Successful authentication for document uploads
  - Proper `Authorization: Bearer <token>` headers in logs
  - User ID extraction working in other endpoints

#### Request Format Issues
- **Ruled Out**: JSON payloads match expected TxAgent schemas
- **Evidence**:
  - Content-Type headers set correctly
  - Request bodies match Pydantic models in TxAgent
  - Multiple payload formats attempted

#### CORS Issues
- **Ruled Out**: CORS configured to allow all origins in TxAgent
- **Evidence**: No CORS-related errors in browser or server logs

### 🤔 Potential Root Causes

#### 1. Deployment Mismatch
- **Hypothesis**: TxAgent container may not be running the provided `main.py`
- **Evidence**: 405 errors despite clear POST endpoint definitions
- **Next Step**: Verify deployed code matches provided files

#### 2. Proxy/Load Balancer Interference
- **Hypothesis**: RunPod proxy may be blocking POST requests
- **Evidence**: GET requests work, POST requests consistently fail
- **Next Step**: Test direct container access if possible

#### 3. FastAPI/Uvicorn Configuration Issue
- **Hypothesis**: ASGI server configuration blocking certain methods
- **Evidence**: Selective method blocking (GET works, POST doesn't)
- **Next Step**: Check Uvicorn startup parameters and middleware

#### 4. Environment Variable Mismatch
- **Hypothesis**: Missing or incorrect environment variables in container
- **Evidence**: Authentication-related failures in agent status
- **Next Step**: Verify all required env vars are set in RunPod

## Technical Specifications

### Environment Variables Required

**Node.js Backend:**
```
SUPABASE_URL=<supabase_project_url>
SUPABASE_KEY=<supabase_service_role_key>
SUPABASE_JWT_SECRET=<supabase_jwt_secret>
RUNPOD_EMBEDDING_URL=<txagent_container_url>
RUNPOD_EMBEDDING_KEY=<optional_api_key>
OPENAI_API_KEY=<fallback_openai_key>
```

**TxAgent Container:**
```
SUPABASE_URL=<supabase_project_url>
SUPABASE_KEY=<supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<supabase_service_role_key>
SUPABASE_JWT_SECRET=<supabase_jwt_secret>
SUPABASE_STORAGE_BUCKET=documents
MODEL_NAME=dmis-lab/biobert-v1.1
DEVICE=cuda
```

### Database Schema

**Documents Table:**
- `id` (uuid, primary key)
- `filename` (text)
- `content` (text)
- `metadata` (jsonb)
- `embedding` (vector(768))
- `user_id` (uuid, foreign key)
- `created_at` (timestamptz)

**Agents Table:**
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key)
- `status` (text: initializing/active/idle/terminated)
- `session_data` (jsonb)
- `created_at` (timestamptz)
- `last_active` (timestamptz)
- `terminated_at` (timestamptz)

## Next Steps for Resolution

1. **Verify TxAgent Deployment**:
   - Confirm deployed code matches provided Python files
   - Check RunPod container logs for FastAPI startup messages
   - Verify all environment variables are properly set

2. **Direct Container Testing**:
   - Test TxAgent endpoints directly with curl/Postman
   - Bypass Node.js backend to isolate the issue
   - Verify JWT validation is working in container

3. **Simplify TxAgent Endpoints**:
   - Create minimal test endpoints that just return success
   - Gradually add complexity back to identify failure point
   - Test with and without authentication requirements

4. **Monitor Integration**:
   - Add more detailed logging to both applications
   - Implement request/response debugging
   - Track the complete request lifecycle

## Success Metrics

- [ ] TxAgent `/chat` endpoint responds to POST requests
- [ ] Document embedding via TxAgent completes successfully
- [ ] Agent status monitoring shows accurate container state
- [ ] End-to-end document upload → embedding → chat query workflow
- [ ] Real-time agent session management working
- [ ] Fallback to OpenAI when TxAgent unavailable

## Current Deployment Status

- **Frontend**: ✅ Deployed and functional
- **Backend**: ✅ Deployed with fallback capabilities
- **Database**: ✅ Configured with proper RLS and vector support
- **TxAgent Container**: ⚠️ Deployed but communication failing
- **Integration**: ❌ Partial functionality, core features blocked