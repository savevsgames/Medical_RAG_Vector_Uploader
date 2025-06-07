# Supabase Database Configuration

This document provides a comprehensive overview of the Supabase database schema, policies, and functions for the Medical RAG Vector Uploader system.

## Database Overview

The system uses PostgreSQL with the `pgvector` extension for vector similarity search. All tables implement Row Level Security (RLS) to ensure users can only access their own data.

## Extensions

```sql
-- Required extensions
CREATE EXTENSION IF NOT EXISTS vector;
```

## Tables Schema

### 1. `documents` Table

Stores document chunks with their vector embeddings for similarity search.

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  embedding VECTOR(768),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Columns:**
- `id`: Unique identifier for each document (manually assigned UUID)
- `filename`: Original filename of the uploaded document
- `content`: The actual text content of the document
- `embedding`: 768-dimensional vector embedding (BioBERT or OpenAI)
- `metadata`: JSON metadata (file_size, mime_type, page_count, etc.)
- `user_id`: Foreign key to Supabase auth.users table
- `created_at`: Timestamp when the document was created

**Indexes:**
```sql
CREATE INDEX documents_embedding_idx ON documents
USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');

CREATE INDEX documents_user_id_idx ON documents(user_id);
```

### 2. `embedding_jobs` Table

Tracks the status of document embedding jobs processed by the TxAgent container.

```sql
CREATE TABLE embedding_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::JSONB,
  chunk_count INTEGER DEFAULT 0,
  error TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Columns:**
- `id`: Unique identifier for the embedding job
- `file_path`: Path to the file being processed
- `status`: Job status (`pending`, `processing`, `completed`, `failed`)
- `metadata`: JSON metadata including document IDs created
- `chunk_count`: Number of document chunks created
- `error`: Error message if job failed
- `user_id`: Foreign key to Supabase auth.users table
- `created_at`: Timestamp when job was created
- `updated_at`: Timestamp when job was last updated

**Indexes:**
```sql
CREATE INDEX embedding_jobs_user_id_idx ON embedding_jobs(user_id);
CREATE INDEX embedding_jobs_status_idx ON embedding_jobs(status);
```

### 3. `agents` Table

Manages TxAgent container sessions and their status.

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'initializing' CHECK (status IN ('initializing', 'active', 'idle', 'terminated')),
  session_data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now(),
  terminated_at TIMESTAMPTZ
);
```

**Columns:**
- `id`: Unique identifier for the agent session
- `user_id`: Foreign key to Supabase auth.users table
- `status`: Agent status (`initializing`, `active`, `idle`, `terminated`)
- `session_data`: JSON data including container_id, endpoint_url, capabilities
- `created_at`: Timestamp when agent session was created
- `last_active`: Timestamp of last agent activity
- `terminated_at`: Timestamp when agent was terminated

**Indexes:**
```sql
CREATE INDEX agents_user_id_idx ON agents(user_id);
CREATE INDEX agents_status_idx ON agents(status);
CREATE INDEX agents_last_active_idx ON agents(last_active);
```

**Triggers:**
```sql
CREATE TRIGGER update_agents_last_active 
BEFORE UPDATE ON agents 
FOR EACH ROW 
EXECUTE FUNCTION update_agent_last_active();
```

## Row Level Security (RLS) Policies

All tables have RLS enabled with user-specific access policies.

### Documents Table Policies

```sql
-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Users can insert their own documents
CREATE POLICY "Users can insert their own documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own documents
CREATE POLICY "Users can read their own documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own documents
CREATE POLICY "Users can update their own documents"
  ON documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
  ON documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

### Embedding Jobs Table Policies

```sql
-- Enable RLS
ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own embedding jobs
CREATE POLICY "Users can insert their own embedding jobs"
  ON embedding_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own embedding jobs
CREATE POLICY "Users can read their own embedding jobs"
  ON embedding_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own embedding jobs
CREATE POLICY "Users can update their own embedding jobs"
  ON embedding_jobs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own embedding jobs
CREATE POLICY "Users can delete their own embedding jobs"
  ON embedding_jobs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

### Agents Table Policies

```sql
-- Enable RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Users can insert their own agents
CREATE POLICY "Users can insert their own agents"
  ON agents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own agents
CREATE POLICY "Users can read their own agents"
  ON agents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own agents
CREATE POLICY "Users can update their own agents"
  ON agents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own agents
CREATE POLICY "Users can delete their own agents"
  ON agents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

## Database Functions

### 1. `match_documents` Function

Performs vector similarity search on document embeddings with user isolation.

```sql
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT,
  user_id UUID
)
RETURNS TABLE (
  id UUID,
  filename TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.filename,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.user_id = match_documents.user_id
    AND documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Parameters:**
- `query_embedding`: 768-dimensional vector to search for
- `match_threshold`: Minimum similarity threshold (0.0 to 1.0)
- `match_count`: Maximum number of results to return
- `user_id`: User ID for RLS filtering

**Returns:**
- `id`: Document ID
- `filename`: Original filename
- `content`: Document text content
- `metadata`: Document metadata
- `similarity`: Cosine similarity score (0.0 to 1.0)

**Usage Example:**
```sql
SELECT * FROM match_documents(
  '[0.1, 0.2, ...]'::vector(768),
  0.5,
  5,
  '496a7180-5e75-42b0-8a61-b8cf92ffe286'::uuid
);
```

### 2. `update_agent_last_active` Function

Trigger function to automatically update the `last_active` timestamp on agent updates.

```sql
CREATE OR REPLACE FUNCTION update_agent_last_active()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Authentication & JWT Configuration

The system uses Supabase Auth with JWT tokens. All API requests must include a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### JWT Claims

Required claims in JWT tokens:
- `sub`: User ID (UUID)
- `aud`: Must be "authenticated" (CRITICAL for TxAgent container)
- `role`: Must be "authenticated"
- `exp`: Token expiration timestamp
- `iat`: Token issued at timestamp
- `iss`: Must match Supabase project issuer URL

### TxAgent Container JWT Validation

The TxAgent container MUST validate JWT tokens with these specific settings:

```python
# In TxAgent container auth.py
decoded_token = jwt.decode(
    token,
    secret,
    algorithms=["HS256"],
    audience="authenticated",  # CRITICAL: Must match Supabase JWT audience
    issuer=os.getenv('SUPABASE_URL', '').rstrip('/') + '/auth/v1',
    options={
        "verify_aud": True,
        "verify_iss": True,
        "verify_exp": True,
        "verify_signature": True
    }
)
```

### User Context

The `auth.uid()` function returns the current user's ID from the JWT token, which is used in all RLS policies to ensure data isolation.

## Data Flow

### Document Upload Flow

1. User uploads file via frontend
2. Backend extracts text using document processors
3. Backend generates embeddings (TxAgent BioBERT or OpenAI fallback)
4. Document stored in `documents` table with user_id
5. Job status tracked in `embedding_jobs` table (if using TxAgent)

### Chat Query Flow

1. User submits query via frontend
2. Backend forwards to TxAgent container or processes locally
3. TxAgent/Backend generates query embedding
4. `match_documents` function finds similar document chunks
5. LLM generates response based on retrieved context
6. Response returned with source citations

### Agent Session Flow

1. User activates TxAgent from Monitor page
2. Backend creates entry in `agents` table
3. TxAgent container health check performed
4. Session data updated with container info
5. Agent terminated when user stops or times out

## Environment Variables

### Node.js Backend

```bash
# Supabase Configuration
SUPABASE_URL=https://bfjfjxzdjhraabputkqi.supabase.co
SUPABASE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# TxAgent Configuration
RUNPOD_EMBEDDING_URL=https://your-runpod-container.proxy.runpod.net
RUNPOD_EMBEDDING_KEY=your-runpod-api-key

# OpenAI Fallback
OPENAI_API_KEY=your-openai-api-key

# Debug Logging
BACKEND_DEBUG_LOGGING=true
```

### React Frontend

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://bfjfjxzdjhraabputkqi.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=https://your-backend.onrender.com

# Debug Logging
VITE_DEBUG_LOGGING=true
```

### TxAgent Container

```bash
# Supabase Configuration
SUPABASE_URL=https://bfjfjxzdjhraabputkqi.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# Storage
SUPABASE_STORAGE_BUCKET=documents

# Model Configuration
MODEL_NAME=dmis-lab/biobert-v1.1
DEVICE=cuda
```

## Current Issues & Fixes

### 1. Backend Token Forwarding ✅ VERIFIED

The backend correctly forwards user JWT tokens to TxAgent:

```javascript
// In runpodService.js - CORRECT IMPLEMENTATION
const response = await axios.post(
  `${process.env.RUNPOD_EMBEDDING_URL}/chat`,
  requestPayload,
  { 
    headers: { 
      'Authorization': userJWT, // User's Supabase JWT, not RunPod key
      'Content-Type': 'application/json'
    },
    timeout: this.chatTimeout
  }
);
```

### 2. Endpoint Routing ✅ VERIFIED

The backend correctly routes to specific endpoints:

```javascript
// Chat endpoint - CORRECT
const chatEndpoint = '/chat';
const response = await axios.post(
  `${process.env.RUNPOD_EMBEDDING_URL}${chatEndpoint}`,
  requestPayload,
  // ...
);

// Embed endpoint - CORRECT
const response = await axios.post(
  `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
  requestPayload,
  // ...
);
```

### 3. TxAgent JWT Audience Fix ❌ NEEDS CONTAINER UPDATE

The TxAgent container needs to accept `"authenticated"` as a valid JWT audience:

```python
# Required fix in TxAgent container auth.py
decoded_token = jwt.decode(
    token,
    secret,
    algorithms=["HS256"],
    audience="authenticated",  # CRITICAL FIX
    options={"verify_aud": True}
)
```

## Migration History

1. **20250605112549_navy_voice.sql**: Initial schema with vector support
2. **20250605120133_mellow_tooth.sql**: Added created_at to documents
3. **20250605120633_velvet_sea.sql**: Added user_id and RLS policies
4. **20250605121516_royal_glitter.sql**: Updated RLS policies
5. **20250606104547_cold_grass.sql**: Created agents table
6. **20250606114420_floral_mud.sql**: Added vector search function
7. **20250607071120_broad_cloud.sql**: Fixed RLS policies and function conflicts
8. **20250607075758_silver_band.sql**: Fixed agents table RLS policies
9. **20250607085110_light_dawn.sql**: Final RLS policy fixes

## Security Considerations

1. **Row Level Security**: All tables enforce user-based data isolation
2. **JWT Validation**: All requests require valid Supabase JWT tokens
3. **SECURITY DEFINER**: The `match_documents` function uses SECURITY DEFINER to bypass RLS for vector search while maintaining user filtering
4. **Foreign Key Constraints**: Ensure data integrity with CASCADE deletes
5. **Token Forwarding**: Backend forwards user JWT tokens, not service keys

## Performance Considerations

1. **Vector Indexing**: IVFFlat index on embeddings for fast similarity search
2. **User ID Indexing**: Indexes on user_id columns for efficient RLS filtering
3. **Status Indexing**: Index on job status for monitoring queries
4. **Connection Pooling**: Use connection pooling for high-traffic applications

## Troubleshooting

### Common RLS Issues

- **Error**: "new row violates row-level security policy"
  - **Solution**: Ensure JWT token is valid and `auth.uid()` matches `user_id`

### JWT Authentication Issues

- **Error**: "Invalid audience" in TxAgent container
  - **Solution**: Update TxAgent JWT validation to accept `audience="authenticated"`

### Vector Search Issues

- **Error**: "function match_documents does not exist"
  - **Solution**: Run the latest migration to create the function

### Performance Issues

- **Slow similarity search**: Ensure vector index is created and statistics are updated
- **Slow user queries**: Ensure user_id indexes are present

## API Integration Examples

### Creating a Document

```javascript
const { data, error } = await supabase
  .from('documents')
  .insert({
    id: uuidv4(), // Generate UUID manually
    filename: 'document.pdf',
    content: 'Document text content...',
    embedding: [0.1, 0.2, ...], // 768-dimensional array
    metadata: { 
      file_size: 12345,
      mime_type: 'application/pdf',
      page_count: 10
    },
    user_id: user.id
  });
```

### Similarity Search

```javascript
const { data, error } = await supabase
  .rpc('match_documents', {
    query_embedding: [0.1, 0.2, ...], // 768-dimensional array
    match_threshold: 0.5,
    match_count: 5,
    user_id: user.id
  });
```

### Creating an Agent Session

```javascript
const { data, error } = await supabase
  .from('agents')
  .upsert({
    user_id: user.id,
    status: 'active',
    session_data: {
      container_id: 'container-123',
      endpoint_url: 'https://container.runpod.net',
      capabilities: ['embedding', 'chat']
    }
  });
```

This configuration ensures secure, scalable, and efficient operation of the Medical RAG Vector Uploader system with proper data isolation and performance optimization.