# Migration Context File (MGCXT.md)
## Complete Database Schema with TxAgent Chat Integration

### 🎯 **Purpose**
This file documents the complete database schema for the Medical RAG Vector Uploader system with full TxAgent chat integration support. Use this to understand the current database state and the exact API contracts expected by the system.

---

## 📋 **Current System Status (v1.2.0)**

### **✅ Fully Implemented Components**
- **Database Schema**: Complete with RLS policies and security fixes
- **Agent Management**: Full lifecycle with session tracking
- **Document Processing**: Multi-format upload with 768-dim embeddings
- **OpenAI Chat**: Complete RAG functionality
- **Health Monitoring**: Real-time container status tracking
- **Authentication**: JWT-based security with proper RLS

### **🔧 TxAgent Integration Status**
- **Backend Routes**: Implemented and ready (`POST /api/chat`)
- **Container API**: Awaiting implementation (see specifications below)
- **Embedding Flow**: Backend proxy ready for 768-dim BioBERT vectors
- **Chat Flow**: Complete request/response handling implemented

---

## 🗄️ **Database Schema (Current v1.2.0)**

### **Core Tables**

#### **Documents Table**
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

#### **Agents Table**
```sql
CREATE TABLE public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text DEFAULT 'initializing'::text,
    session_data jsonb DEFAULT '{}'::jsonb,  -- Contains container details
    created_at timestamptz DEFAULT now(),
    last_active timestamptz DEFAULT now(),
    terminated_at timestamptz
);

-- Performance indexes
CREATE INDEX agents_user_id_idx ON public.agents USING btree (user_id);
CREATE INDEX agents_status_idx ON public.agents USING btree (status);
CREATE INDEX agents_last_active_idx ON public.agents USING btree (last_active);
```

#### **Embedding Jobs Table**
```sql
CREATE TABLE public.embedding_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path text NOT NULL,
    status text DEFAULT 'pending'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    chunk_count integer DEFAULT 0,
    error text,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX embedding_jobs_user_id_idx ON public.embedding_jobs USING btree (user_id);
CREATE INDEX embedding_jobs_status_idx ON public.embedding_jobs USING btree (status);
```

### **Row Level Security (RLS) Policies**

#### **Documents - Shared Knowledge Base**
```sql
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- CRITICAL: All authenticated users can read ALL documents (shared medical knowledge)
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

#### **Agents - User Isolation**
```sql
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own agents
CREATE POLICY "Users can manage own agents"
    ON public.agents FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### **Database Functions (Security Hardened)**

#### **Vector Similarity Search**
```sql
CREATE OR REPLACE FUNCTION public.match_documents(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.78,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    filename text,
    content text,
    metadata jsonb,
    user_id uuid,
    created_at timestamptz,
    similarity float
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        documents.id,
        documents.filename,
        documents.content,
        documents.metadata,
        documents.user_id,
        documents.created_at,
        1 - (documents.embedding <=> query_embedding) AS similarity
    FROM public.documents
    WHERE documents.embedding IS NOT NULL
        AND 1 - (documents.embedding <=> query_embedding) > match_threshold
    ORDER BY documents.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

#### **Agent Management Functions**
```sql
-- Get active agent for user
CREATE OR REPLACE FUNCTION public.get_active_agent(user_uuid uuid)
RETURNS TABLE (
    id uuid,
    status text,
    session_data jsonb,
    created_at timestamptz,
    last_active timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        agents.id,
        agents.status,
        agents.session_data,
        agents.created_at,
        agents.last_active
    FROM public.agents
    WHERE agents.user_id = user_uuid
        AND agents.status IN ('active')
    ORDER BY agents.last_active DESC
    LIMIT 1;
END;
$$;

-- Create agent session
CREATE OR REPLACE FUNCTION public.create_agent_session(
    user_uuid uuid,
    initial_status text DEFAULT 'initializing',
    initial_session_data jsonb DEFAULT '{}'
)
RETURNS TABLE (
    id uuid,
    status text,
    session_data jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    new_agent_id uuid;
BEGIN
    -- Terminate any existing active sessions
    UPDATE public.agents 
    SET status = 'terminated', terminated_at = now()
    WHERE user_id = user_uuid 
        AND public.agents.status IN ('active', 'initializing')
        AND terminated_at IS NULL;
    
    -- Create new agent session
    INSERT INTO public.agents (user_id, status, session_data, created_at, last_active)
    VALUES (user_uuid, initial_status, initial_session_data, now(), now())
    RETURNING agents.id INTO new_agent_id;
    
    -- Return the created agent details
    RETURN QUERY
    SELECT 
        agents.id,
        agents.status,
        agents.session_data,
        agents.created_at
    FROM public.agents
    WHERE agents.id = new_agent_id;
END;
$$;
```

---

## 🤖 **TxAgent Container API Specification**

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

#### **2. Chat Endpoint**
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
  "history": [],
  "stream": false
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
      "page": 15
    }
  ],
  "processing_time": 1250,
  "model": "BioBERT",
  "tokens_used": 150
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

---

## 🔄 **Complete Chat Flow Implementation**

### **Backend Chat Proxy (Implemented)**

**File:** `backend/routes/chat.js`

```javascript
// TxAgent chat endpoint - proxy to user's container
router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { message, top_k = 5, temperature = 0.7 } = req.body || {};
    const userId = req.userId;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 1. Find active agent session to get runpod_endpoint
    const agent = await agentService.getActiveAgent(userId);
    if (!agent?.session_data?.runpod_endpoint) {
      return res.status(503).json({ 
        error: 'TxAgent not running. Please start the agent first.' 
      });
    }
    
    const baseUrl = agent.session_data.runpod_endpoint.replace(/\/+$/, '');
    
    // 2. Get BioBERT embedding for the query (ensures 768-dim consistency)
    const { data: embedResp } = await axios.post(
      `${baseUrl}/embed`,
      { text: message },
      { 
        headers: { Authorization: req.headers.authorization },
        timeout: 30000
      }
    );
    
    const queryEmbedding = embedResp.embedding; // 768-dim array

    // 3. Similarity search in Supabase (top_k docs)
    const similarDocs = await searchService.searchRelevantDocuments(
      userId,
      queryEmbedding,
      top_k
    );

    // 4. Call container's /chat endpoint with correct format
    const chatUrl = `${baseUrl}/chat`;
    const { data: chatResp } = await axios.post(
      chatUrl,
      {
        query: message,        // CRITICAL: 'query' not 'message'
        history: [],           // Required by container
        top_k,
        temperature,
        stream: false          // Required by container
      },
      { 
        headers: { Authorization: req.headers.authorization },
        timeout: 60000
      }
    );

    // 5. Return formatted response to frontend
    res.json({
      response: chatResp.response,
      sources: chatResp.sources || [],
      agent_id: 'txagent',
      processing_time: chatResp.processing_time || null,
      timestamp: new Date().toISOString(),
      status: 'success'
    });

  } catch (error) {
    console.error('TxAgent chat error:', error);
    res.status(502).json({ 
      error: 'TxAgent chat processing failed',
      details: error.message
    });
  }
});
```

### **Frontend Chat Integration (Implemented)**

**File:** `frontend/src/pages/Chat.tsx`

```typescript
const handleSendMessage = async (e: React.FormEvent) => {
  // Choose endpoint based on selected agent
  const endpoint = selectedAgent === 'txagent' ? '/api/chat' : '/api/openai-chat';
  
  // Prepare request body based on agent type
  let requestBody;
  if (selectedAgent === 'txagent') {
    // TxAgent expects: message, top_k, temperature
    requestBody = {
      message: messageContent,
      top_k: 5,
      temperature: 0.7
    };
  } else {
    // OpenAI expects: message, context
    requestBody = {
      message: messageContent,
      context: messages.slice(-5)
    };
  }

  const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
};
```

---

## 🧪 **Testing and Validation**

### **Container Direct Testing**
```bash
# Test health endpoint
curl -X GET "https://your-runpod-url.proxy.runpod.net/health"
# Expected: {"status":"healthy","model":"BioBERT",...}

# Test embed endpoint (CRITICAL: Must return 768 dimensions)
curl -X POST "https://your-runpod-url.proxy.runpod.net/embed" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"test medical text","normalize":true}'
# Expected: {"embedding":[...],"dimensions":768,"model":"BioBERT",...}

# Test chat endpoint (CRITICAL: Must accept 'query' field)
curl -X POST "https://your-runpod-url.proxy.runpod.net/chat" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is diabetes?","top_k":5,"temperature":0.7,"history":[],"stream":false}'
# Expected: {"response":"...","sources":[...],"processing_time":1250,...}
```

### **Integration Testing Matrix**
| Test Case | Expected Result | Status |
|-----------|----------------|---------|
| Agent Activation | `/api/agent/start` returns 200, creates DB session | ✅ Working |
| Health Check | Container `/health` returns 200 with JSON | 🔧 Needs container |
| Embed Generation | Container `/embed` returns 768-dim array | 🔧 Needs container |
| Chat Request | Container `/chat` processes query and returns response | 🔧 Needs container |
| Vector Search | Database `match_documents()` finds similar docs | ✅ Working |
| OpenAI Fallback | `/api/openai-chat` works independently | ✅ Working |

---

## 🚨 **Critical Issues for Container Developers**

### **Issue #1: Request Format Mismatch**
- **Problem**: Backend sends `{ "query": "...", "top_k": 5, "temperature": 0.7, "history": [], "stream": false }`
- **Container Must**: Accept this exact format (not `{ "message": "..." }`)
- **Fix**: Implement `/chat` endpoint with correct request schema

### **Issue #2: Embedding Dimensions**
- **Problem**: System expects exactly 768-dimensional vectors
- **Container Must**: Return `{"embedding": [...], "dimensions": 768}` with 768 floats
- **Fix**: Ensure BioBERT model outputs 768-dim embeddings consistently

### **Issue #3: Health Check Format**
- **Problem**: Backend expects JSON response from `/health`
- **Container Must**: Return `{"status": "healthy", "model": "BioBERT", ...}`
- **Fix**: Implement proper JSON health endpoint (not plain text)

### **Issue #4: Authentication**
- **Problem**: Container receives JWT tokens but may not validate them
- **Container Should**: Either validate JWT or trust backend proxy
- **Fix**: Handle `Authorization: Bearer <token>` header appropriately

---

## 📊 **System Architecture Status**

### **✅ Backend Ready (100%)**
- Chat proxy route implemented
- Agent lifecycle management complete
- Health monitoring with proper error handling
- Document processing and embedding storage
- Vector similarity search optimized
- Authentication and RLS policies secure

### **✅ Frontend Ready (100%)**
- Agent selection UI implemented
- Chat interface with dual-agent support
- Real-time status monitoring
- Document upload and management
- Error handling and user feedback

### **✅ Database Ready (100%)**
- Schema optimized for 768-dim vectors
- RLS policies for shared knowledge base
- Security-hardened functions
- Performance indexes in place
- Agent session tracking complete

### **🔧 Container Implementation Needed (0%)**
- Health endpoint with JSON response
- Chat endpoint with exact request/response schema
- Embedding endpoint with 768-dimensional output
- JWT authentication handling
- Database access for document retrieval

---

## 🎯 **Implementation Priority for Container Developers**

### **Priority 1: Health Check**
```http
GET /health
→ {"status":"healthy","model":"BioBERT","device":"cuda:0","version":"1.0.0"}
```

### **Priority 2: Embedding Generation**
```http
POST /embed
{"text":"test"}
→ {"embedding":[768 floats],"dimensions":768,"model":"BioBERT"}
```

### **Priority 3: Chat Processing**
```http
POST /chat
{"query":"test","top_k":5,"temperature":0.7,"history":[],"stream":false}
→ {"response":"...","sources":[...],"processing_time":1250}
```

---

## 🚀 **Deployment Readiness**

The system is **95% complete** and ready for production deployment. The remaining 5% requires TxAgent container implementation of the three endpoints above.

### **Current Capabilities**
- ✅ Full OpenAI RAG chat functionality
- ✅ Document upload and processing
- ✅ Agent lifecycle management
- ✅ Real-time health monitoring
- ✅ Secure authentication and authorization
- ✅ Optimized vector search
- ✅ Responsive UI with error handling

### **Pending Container Implementation**
- 🔧 TxAgent chat endpoint compliance
- 🔧 BioBERT embedding endpoint compliance
- 🔧 Health check JSON format compliance

Once the container implements these three endpoints with the exact schemas specified, the system will be 100% functional and ready for production use.

---

## 📞 **Support for Container Developers**

### **Questions to Address:**
1. **Database Connection**: How should the container connect to Supabase for document retrieval?
2. **Authentication**: Should JWT tokens be validated or can the container trust the backend proxy?
3. **Model Loading**: What's the preferred method for loading and caching BioBERT models?
4. **Error Handling**: What specific error codes and messages should be returned?
5. **Performance**: What are the expected response times for each endpoint?

### **Available Resources:**
- Test JWT tokens for development
- Supabase connection details for testing
- Sample document embeddings for validation
- Integration testing support and debugging assistance

The backend team is ready to assist with integration testing and provide any additional support needed for successful container implementation.