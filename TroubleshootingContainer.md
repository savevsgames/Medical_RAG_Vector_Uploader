# TxAgent Container Troubleshooting Guide

## Current Status Summary

### ✅ What's Working
- **Container Health**: `/health` endpoint responds correctly with BioBERT model info
- **Authentication**: Supabase JWT tokens are being generated and sent properly
- **Network Connectivity**: Container is reachable from Node.js backend
- **CORS**: Recently fixed to allow WebContainer domains
- **OpenAI Fallback**: Working perfectly as backup system

### ❌ What's Failing
- **POST Endpoints**: All POST requests to TxAgent return `405 Method Not Allowed`
- **Chat Functionality**: `/chat` endpoint not responding to POST requests
- **Embedding Processing**: `/embed` endpoint not accepting document uploads
- **Agent Session Management**: Cannot create agent sessions due to RLS policy issues

## Critical Questions for TxAgent Container

### 1. Endpoint Verification
**Question**: What endpoints are actually available and what HTTP methods do they support?

**Expected Response**: 
```json
{
  "endpoints": {
    "/health": ["GET"],
    "/chat": ["POST"],
    "/embed": ["POST"],
    "/docs": ["GET"]
  }
}
```

**How to Test**:
```bash
# Inside container
curl -X OPTIONS http://localhost:8000/chat -v
curl -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"query":"test"}' -v
```

### 2. FastAPI Configuration
**Question**: Is FastAPI properly configured to handle POST requests?

**Expected Verification**:
- Uvicorn startup logs show all routes being registered
- No middleware blocking POST methods
- CORS configured to allow all origins and methods

**Debug Commands**:
```python
# Add to main.py for debugging
@app.middleware("http")
async def debug_requests(request: Request, call_next):
    print(f"Method: {request.method}, URL: {request.url}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response
```

### 3. Authentication Flow
**Question**: How is the Supabase JWT being validated and processed?

**What We're Sending**:
```javascript
headers: {
  'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...',
  'Content-Type': 'application/json'
}
```

**Expected Process**:
1. Extract JWT from Authorization header
2. Verify signature using `SUPABASE_JWT_SECRET`
3. Extract `user_id` from `sub` claim
4. Use for RLS enforcement in database queries

**Debug Questions**:
- Is `SUPABASE_JWT_SECRET` set correctly in container?
- Is JWT validation middleware working?
- Are authentication errors being logged?

### 4. Environment Variables
**Question**: Are all required environment variables properly set?

**Required Variables**:
```bash
SUPABASE_URL=https://bfjfjxzdjhraabputkqi.supabase.co
SUPABASE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...  # anon key
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...  # service role
SUPABASE_JWT_SECRET=your-jwt-secret-here
SUPABASE_STORAGE_BUCKET=documents
MODEL_NAME=dmis-lab/biobert-v1.1
DEVICE=cuda
```

**Verification Command**:
```bash
env | grep SUPABASE
```

### 5. Database Connectivity
**Question**: Can the container successfully connect to Supabase and perform operations?

**Test Queries**:
```python
# Test basic connection
supabase.table('documents').select('count').execute()

# Test RLS with user context
supabase.table('documents').select('*').eq('user_id', user_id).execute()
```

## What We're Expecting the Container to Do

### 1. Chat Endpoint (`POST /chat`)
**Input Payload**:
```json
{
  "query": "What are the key findings in my documents?",
  "history": [],
  "top_k": 5,
  "temperature": 0.7
}
```

**Expected Process**:
1. Authenticate user via JWT
2. Generate embedding for query using BioBERT
3. Perform vector similarity search in Supabase
4. Filter results by user_id (RLS)
5. Generate response using retrieved context
6. Return response with sources

**Expected Response**:
```json
{
  "response": "Based on your documents, the key findings are...",
  "sources": [
    {
      "filename": "medical_report.pdf",
      "similarity": 0.85,
      "content": "relevant excerpt..."
    }
  ],
  "processing_time": 1.23,
  "status": "success"
}
```

### 2. Embed Endpoint (`POST /embed`)
**Input Payload**:
```json
{
  "file_path": "upload_12345",
  "metadata": {
    "file_size": 75227,
    "mime_type": "application/pdf",
    "inline_text": "extracted document text...",
    "user_id": "496a7180-5e75-42b0-8a61-b8cf92ffe286"
  }
}
```

**Expected Process**:
1. Authenticate user via JWT
2. Extract/receive document text
3. Generate BioBERT embeddings
4. Store in Supabase documents table with user_id
5. Return document IDs and processing info

**Expected Response**:
```json
{
  "document_ids": ["uuid-1", "uuid-2"],
  "chunk_count": 15,
  "embedding": [0.1, 0.2, ...],  // 768 dimensions
  "dimensions": 768,
  "processing_time": 2.45,
  "status": "success"
}
```

## Debugging Steps for Container

### 1. Enable Verbose Logging
```python
import logging
logging.basicConfig(level=logging.DEBUG)

# Add request/response logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    print(f"🔍 {request.method} {request.url}")
    print(f"🔍 Headers: {dict(request.headers)}")
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    print(f"✅ Response: {response.status_code} ({process_time:.2f}s)")
    return response
```

### 2. Test Endpoints Directly
```bash
# Test health (should work)
curl http://localhost:8000/health

# Test chat with minimal payload
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'

# Test with authentication
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_HERE" \
  -d '{"query":"test"}'
```

### 3. Verify FastAPI Route Registration
```python
# Add to startup
@app.on_event("startup")
async def startup_event():
    print("🚀 TxAgent FastAPI starting up...")
    print("📋 Registered routes:")
    for route in app.routes:
        if hasattr(route, 'methods'):
            print(f"  {route.methods} {route.path}")
```

### 4. Check Supabase Connection
```python
# Add health check for database
@app.get("/health/db")
async def health_db():
    try:
        result = supabase.table('documents').select('count').limit(1).execute()
        return {"status": "connected", "result": result.data}
    except Exception as e:
        return {"status": "error", "error": str(e)}
```

## Expected Container Behavior

### On Startup
1. Load BioBERT model on CUDA
2. Initialize Supabase client with provided credentials
3. Register all FastAPI routes (GET /health, POST /chat, POST /embed)
4. Start Uvicorn server on port 8000
5. Log successful initialization

### On POST /chat Request
1. Receive and validate JSON payload
2. Extract and verify JWT token
3. Get user_id from JWT claims
4. Generate query embedding using BioBERT
5. Search user's documents in Supabase
6. Generate contextual response
7. Return JSON response with sources

### On POST /embed Request
1. Receive document data and metadata
2. Extract and verify JWT token
3. Process document text through BioBERT
4. Store embeddings in Supabase with user_id
5. Return processing results

## Common Issues to Check

### 1. RunPod Proxy Issues
- **Problem**: RunPod proxy might be blocking POST requests
- **Test**: Try accessing container directly if possible
- **Workaround**: Use GET requests with query parameters for testing

### 2. FastAPI/Uvicorn Configuration
- **Problem**: Server not configured to handle POST methods
- **Check**: Uvicorn startup parameters and middleware configuration
- **Fix**: Ensure no middleware is blocking POST requests

### 3. CORS Configuration
- **Problem**: Container rejecting requests due to CORS
- **Fix**: Ensure CORS allows all origins and methods:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4. Authentication Middleware
- **Problem**: JWT validation failing silently
- **Debug**: Add logging to authentication middleware
- **Test**: Try endpoints without authentication first

## Next Steps

1. **Container Logs**: Check RunPod container logs for FastAPI startup messages
2. **Direct Testing**: Test endpoints directly within container using curl
3. **Environment Verification**: Confirm all environment variables are set
4. **Route Debugging**: Add verbose logging to see which routes are registered
5. **Authentication Testing**: Test with and without JWT tokens
6. **Minimal Reproduction**: Create simple test endpoints that just return success

## Success Criteria

- [ ] POST /chat returns valid JSON response (not 405)
- [ ] POST /embed accepts document data successfully
- [ ] JWT authentication works correctly
- [ ] User-specific data filtering via RLS
- [ ] BioBERT embeddings generated and stored
- [ ] End-to-end document upload → embedding → chat query workflow

## Contact Information

If you need to test specific scenarios or have questions about the expected behavior, the Node.js backend is running at:
- **Health Check**: `https://medical-rag-vector-uploader-1.onrender.com/health`
- **Test User**: `gregcbarker@gmail.com`
- **Expected JWT Format**: Supabase JWT with `sub` claim containing user UUID

The frontend is expecting the container to behave as a standard FastAPI service with proper CORS, authentication, and JSON responses.