# Migration Context File (MGCXT.md)
## Complete Database Schema Recreation with Security Fixes and Cleanup

### 🎯 **Purpose**
This file documents the complete database schema needed to recreate the Medical RAG Vector Uploader system with all security fixes applied. Use this to create a single comprehensive migration that replaces all existing migrations and cleans up old functions.

---

## 📋 **Current Migration Files to Replace**
- `20250608112819_turquoise_island.sql`
- `20250608145125_autumn_math.sql` 
- `20250609095725_spring_violet.sql`

---

## 🧹 **CRITICAL: Cleanup Old Functions First**

### **Drop Old Policies (Clean Slate)**
```sql
-- Drop all existing RLS policies to start fresh
DROP POLICY IF EXISTS "Users can read own documents" ON public.documents;
DROP POLICY IF EXISTS "documents_user_isolation" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can read all documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only upload as themselves" ON public.documents;
DROP POLICY IF EXISTS "Users can only edit their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only upload documents as themselves" ON public.documents;
DROP POLICY IF EXISTS "Users can only insert as themselves" ON public.documents;

DROP POLICY IF EXISTS "Users can manage own agents" ON public.agents;
DROP POLICY IF EXISTS "agents_user_isolation" ON public.agents;

DROP POLICY IF EXISTS "Users can manage own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "embedding_jobs_user_isolation" ON public.embedding_jobs;
```

### **Drop Existing Triggers**
```sql
-- Drop any existing triggers
DROP TRIGGER IF EXISTS update_agent_last_active ON public.agents;
DROP TRIGGER IF EXISTS agent_last_active_trigger ON public.agents;
DROP TRIGGER IF EXISTS agents_update_trigger ON public.agents;
```

### **Drop All Existing Functions**
```sql
-- Drop all existing functions that may have search path issues
DROP FUNCTION IF EXISTS public.match_documents(vector, float, int);
DROP FUNCTION IF EXISTS public.get_active_agent(uuid);
DROP FUNCTION IF EXISTS public.create_agent_session(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.terminate_agent_session(uuid);
DROP FUNCTION IF EXISTS public.update_agent_last_active(uuid);
DROP FUNCTION IF EXISTS public.cleanup_stale_agents();
DROP FUNCTION IF EXISTS public.test_user_documents_count(uuid);
DROP FUNCTION IF EXISTS public.test_vector_similarity(vector, vector);
DROP FUNCTION IF EXISTS public.test_auth_uid();
DROP FUNCTION IF EXISTS public.create_test_medical_document(text, text, uuid);

-- Drop any legacy functions that might exist
DROP FUNCTION IF EXISTS match_documents(vector, float, int);
DROP FUNCTION IF EXISTS get_active_agent(uuid);
DROP FUNCTION IF EXISTS create_agent_session(uuid, text, jsonb);
DROP FUNCTION IF EXISTS terminate_agent_session(uuid);
DROP FUNCTION IF EXISTS update_agent_last_active(uuid);
DROP FUNCTION IF EXISTS cleanup_stale_agents();
DROP FUNCTION IF EXISTS test_user_documents_count(uuid);
DROP FUNCTION IF EXISTS test_vector_similarity(vector, vector);
DROP FUNCTION IF EXISTS test_auth_uid();
DROP FUNCTION IF EXISTS create_test_medical_document(text, text, uuid);

-- Drop any trigger functions
DROP FUNCTION IF EXISTS public.update_agent_last_active_trigger();
DROP FUNCTION IF EXISTS update_agent_last_active_trigger();

-- Drop any other potential legacy functions
DROP FUNCTION IF EXISTS public.search_documents(vector, float, int);
DROP FUNCTION IF EXISTS public.vector_search(vector, float, int);
DROP FUNCTION IF EXISTS public.similarity_search(vector, float, int);
DROP FUNCTION IF EXISTS search_documents(vector, float, int);
DROP FUNCTION IF EXISTS vector_search(vector, float, int);
DROP FUNCTION IF EXISTS similarity_search(vector, float, int);
```

---

## 🗄️ **Complete Database Schema**

### **1. Required Extensions**
```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";
```

### **2. Core Tables**

#### **Documents Table**
```sql
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text,
    content text NOT NULL,
    embedding vector(768),
    metadata jsonb DEFAULT '{}'::jsonb,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON public.documents 
USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents USING btree (user_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents USING btree (created_at);
CREATE INDEX IF NOT EXISTS documents_filename_idx ON public.documents USING btree (filename);
```

#### **Agents Table**
```sql
CREATE TABLE IF NOT EXISTS public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text DEFAULT 'initializing'::text,
    session_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    last_active timestamptz DEFAULT now(),
    terminated_at timestamptz
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS agents_user_id_idx ON public.agents USING btree (user_id);
CREATE INDEX IF NOT EXISTS agents_status_idx ON public.agents USING btree (status);
CREATE INDEX IF NOT EXISTS agents_last_active_idx ON public.agents USING btree (last_active);
```

#### **Embedding Jobs Table**
```sql
CREATE TABLE IF NOT EXISTS public.embedding_jobs (
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS embedding_jobs_user_id_idx ON public.embedding_jobs USING btree (user_id);
CREATE INDEX IF NOT EXISTS embedding_jobs_status_idx ON public.embedding_jobs USING btree (status);
```

### **3. Row Level Security (RLS) Policies**

#### **Documents Table RLS - CRITICAL SHARED ACCESS**
```sql
-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- CRITICAL: Allow all authenticated users to read ALL documents (shared knowledge base)
CREATE POLICY "All authenticated users can read all documents"
    ON public.documents
    FOR SELECT
    TO authenticated
    USING (true);

-- Users can only upload documents as themselves
CREATE POLICY "Users can only upload as themselves"
    ON public.documents
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can only edit their own documents
CREATE POLICY "Users can only edit their own documents"
    ON public.documents
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own documents
CREATE POLICY "Users can only delete their own documents"
    ON public.documents
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
```

#### **Agents Table RLS**
```sql
-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Users can manage their own agents
CREATE POLICY "Users can manage own agents"
    ON public.agents
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
```

#### **Embedding Jobs Table RLS**
```sql
-- Enable RLS
ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Users can manage their own embedding jobs
CREATE POLICY "Users can manage own embedding jobs"
    ON public.embedding_jobs
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
```

### **4. Database Functions with FIXED Search Paths, SECURITY DEFINER, and Correct Volatilities**

#### **Document Search Function (STABLE - Read-only)**
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

##### **Get Active Agent (STABLE - Read-only)**
```sql
-- CORRECTED: Get active agent for user (FIXED VERSION)
CREATE OR REPLACE FUNCTION public.get_active_agent(
    user_uuid uuid
)
RETURNS TABLE (
    id uuid,
    status text,
    session_data jsonb,
    created_at timestamptz,
    last_active timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
```

##### **Create Agent Session (VOLATILE - Modifies data)**
```sql
-- CRITICAL FIX: Create agent session with SECURITY DEFINER
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
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

##### **Terminate Agent Session (VOLATILE - Modifies data)**
```sql
-- Terminate agent session with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.terminate_agent_session(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    UPDATE public.agents 
    SET status = 'terminated', terminated_at = now()
    WHERE user_id = user_uuid 
        AND status IN ('active', 'initializing')
        AND terminated_at IS NULL;
    
    RETURN FOUND;
END;
$$;
```

##### **Update Agent Last Active (VOLATILE - Modifies data)**
```sql
-- CORRECTED: Update agent last active with VOLATILE (not STABLE)
CREATE OR REPLACE FUNCTION public.update_agent_last_active(agent_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    UPDATE public.agents 
    SET last_active = now()
    WHERE id = agent_uuid;
    
    RETURN FOUND;
END;
$$;
```

##### **Cleanup Stale Agents (VOLATILE - Modifies data)**
```sql
-- Cleanup stale agents with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.cleanup_stale_agents()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    affected_count integer;
BEGIN
    UPDATE public.agents 
    SET status = 'terminated', terminated_at = now()
    WHERE status IN ('active', 'initializing')
        AND last_active < (now() - interval '1 hour')
        AND terminated_at IS NULL;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;
```

#### **Test and Utility Functions**

##### **Test User Documents Count (STABLE - Read-only)**
```sql
-- Test user documents count
CREATE OR REPLACE FUNCTION public.test_user_documents_count(user_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer 
        FROM public.documents 
        WHERE user_id = user_uuid
    );
END;
$$;
```

##### **Test Vector Similarity (IMMUTABLE - Pure computation)**
```sql
-- Test vector similarity
CREATE OR REPLACE FUNCTION public.test_vector_similarity(
    vec1 vector(768),
    vec2 vector(768)
)
RETURNS float
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN 1 - (vec1 <=> vec2);
END;
$$;
```

##### **Test Auth UID (STABLE - Read-only)**
```sql
-- Test auth uid
CREATE OR REPLACE FUNCTION public.test_auth_uid()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN auth.uid();
END;
$$;
```

##### **Create Test Medical Document (VOLATILE - Modifies data)**
```sql
-- Create test medical document with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_test_medical_document(
    test_filename text DEFAULT 'test-medical-doc.txt',
    test_content text DEFAULT 'This is a test medical document containing cardiology and diagnosis information.',
    test_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    new_doc_id uuid;
BEGIN
    INSERT INTO public.documents (filename, content, user_id, metadata)
    VALUES (
        test_filename,
        test_content,
        test_user_id,
        jsonb_build_object(
            'char_count', length(test_content),
            'test_document', true,
            'created_by_function', true
        )
    )
    RETURNING id INTO new_doc_id;
    
    RETURN new_doc_id;
END;
$$;
```

### **5. Triggers and Automation**

#### **Update Agent Last Active Trigger (VOLATILE - Modifies data)**
```sql
-- Trigger function to update last_active
CREATE OR REPLACE FUNCTION public.update_agent_last_active_trigger()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    NEW.last_active = now();
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER update_agent_last_active
    BEFORE UPDATE ON public.agents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_agent_last_active_trigger();
```

---

## 🔧 **Security Fixes Applied**

### **1. Function Search Path Mutable - FIXED**
- ✅ All functions now include `SET search_path = public, pg_catalog`
- ✅ Prevents search path manipulation attacks
- ✅ Ensures consistent function behavior
- ✅ **CRITICAL**: Old functions without search path fixes are completely removed

### **2. SECURITY DEFINER Added - NEW FIX**
- ✅ **CRITICAL**: All functions now include `SECURITY DEFINER`
- ✅ Functions execute with creator privileges, bypassing RLS
- ✅ Fixes `auth.uid()` being NULL when using service role
- ✅ Ensures agent session creation works properly

### **3. Function Volatility Classification - FIXED**
- ✅ **CRITICAL**: `STABLE` functions only for read-only operations (PostgREST compatibility)
- ✅ **CRITICAL**: `VOLATILE` functions for data modification operations
- ✅ **CRITICAL**: `IMMUTABLE` functions for pure computations
- ✅ Prevents "UPDATE is not allowed in a non-volatile function" errors

### **4. Extension in Public Schema - ADDRESSED**
- ✅ Extensions explicitly created in public schema
- ✅ Documented for awareness in shared environments

### **5. Auth OTP Long Expiry - CONFIGURATION**
- ⚠️ Requires Supabase Dashboard configuration
- ⚠️ Set OTP expiry to recommended threshold (15 minutes)

### **6. Function Cleanup - NEW**
- ✅ **CRITICAL**: All old functions are dropped before creating new ones
- ✅ Prevents function conflicts and ensures clean state
- ✅ Removes any legacy functions that may have search path issues
- ✅ Ensures no orphaned functions remain in the database

---

## 🚨 **CRITICAL: Shared Knowledge Base**

### **Key Change: Document Access Policy**
```sql
-- OLD (WRONG): Users can only read their own documents
CREATE POLICY "Users can read own documents"
    ON documents FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- NEW (CORRECT): All authenticated users can read ALL documents
CREATE POLICY "All authenticated users can read all documents"
    ON documents FOR SELECT TO authenticated
    USING (true);
```

### **Impact**
- ✅ **Before**: Each doctor could only search their own uploaded documents
- ✅ **After**: All doctors can search ALL uploaded medical documents
- ✅ **Result**: True shared medical knowledge base for collaborative care

---

## 📊 **Performance Optimizations**

### **Vector Search Optimization**
- ✅ IVFFlat index on embedding column with 100 lists
- ✅ Cosine similarity operator for medical document matching
- ✅ Configurable similarity threshold (default 0.78)

### **Query Performance**
- ✅ Indexes on frequently queried columns
- ✅ Proper foreign key constraints with CASCADE deletes
- ✅ Optimized RLS policies for minimal overhead

---

## 🔄 **Migration Strategy**

### **Single Migration Approach**
1. **🧹 CLEANUP FIRST**: Drop all existing policies, triggers, and functions
2. **Create extensions** first
3. **Create tables** with all columns and constraints (IF NOT EXISTS for safety)
4. **Create indexes** for performance
5. **Enable RLS** and create policies (fresh, clean policies)
6. **Create functions** with fixed search paths, SECURITY DEFINER, and correct volatilities
7. **Create triggers** for automation

### **Data Preservation**
- ✅ Uses `CREATE TABLE IF NOT EXISTS` to preserve existing data
- ✅ Uses `CREATE INDEX IF NOT EXISTS` to avoid conflicts
- ✅ Uses `CREATE OR REPLACE FUNCTION` for clean function replacement
- ✅ **CRITICAL**: Drops old functions first to prevent conflicts

---

## 🧪 **Testing Checklist**

### **After Migration**
- [ ] ✅ **No old functions remain** - Check `\df` in psql
- [ ] ✅ **All security warnings resolved** - Check Supabase Security Advisor
- [ ] ✅ **SECURITY DEFINER functions work** - Test agent session creation
- [ ] ✅ **STABLE functions work with PostgREST** - Test RPC calls
- [ ] ✅ **VOLATILE functions work correctly** - Test data modifications
- [ ] Vector search works with `match_documents()`
- [ ] All authenticated users can read all documents
- [ ] Users can only upload as themselves
- [ ] Agent sessions create/terminate properly
- [ ] No "Function Search Path Mutable" warnings
- [ ] No "UPDATE is not allowed in a non-volatile function" errors
- [ ] Embedding jobs track properly
- [ ] Performance is acceptable with indexes

### **Security Verification**
- [ ] RLS policies prevent unauthorized access
- [ ] Functions have fixed search paths and SECURITY DEFINER
- [ ] Functions have correct volatility classifications
- [ ] Extensions are properly scoped
- [ ] No SQL injection vulnerabilities
- [ ] **CRITICAL**: No orphaned functions with security issues
- [ ] **CRITICAL**: Agent session creation bypasses RLS correctly
- [ ] **CRITICAL**: PostgREST RPC calls work with STABLE functions

---

## 📝 **SUPABASE_CONFIG.md Updates Needed**

### **Policy Changes to Document**
```markdown
## Row Level Security Policies

### Documents Table
- **READ**: All authenticated users can read ALL documents (shared knowledge base)
- **INSERT**: Users can only upload documents as themselves
- **UPDATE/DELETE**: Users can only modify their own documents

### Agents Table  
- **ALL**: Users can only manage their own agent sessions

### Embedding Jobs Table
- **ALL**: Users can only manage their own embedding jobs
```

### **Function Updates to Document**
```markdown
## Database Functions (All with Fixed Search Paths, SECURITY DEFINER, and Correct Volatilities)

### Document Search
- `match_documents(query_embedding, threshold, count)` - Vector similarity search (STABLE)

### Agent Management
- `get_active_agent(user_id)` - Get user's active agent session (STABLE for RPC)
- `create_agent_session(user_id, status, data)` - Create new agent session (VOLATILE)
- `terminate_agent_session(user_id)` - Terminate user's agent sessions (VOLATILE)
- `update_agent_last_active(agent_id)` - Update agent activity timestamp (VOLATILE)
- `cleanup_stale_agents()` - Clean up inactive agent sessions (VOLATILE)

### Testing & Utilities
- `test_user_documents_count(user_id)` - Count user's documents (STABLE)
- `test_vector_similarity(vec1, vec2)` - Test vector similarity (IMMUTABLE)
- `test_auth_uid()` - Test authentication context (STABLE)
- `create_test_medical_document()` - Create test document (VOLATILE)

### Security Notes
- All functions include `SET search_path = public, pg_catalog`
- All functions include `SECURITY DEFINER` to bypass RLS
- Read-only functions include `STABLE` for PostgREST compatibility
- Data-modifying functions include `VOLATILE` for proper transaction handling
- Pure computation functions include `IMMUTABLE` for optimization
- All old functions are completely removed during migration
- No legacy functions remain that could have security issues
```

---

## ✅ **Ready for Implementation**

This context file contains everything needed to create a single, comprehensive migration that:

1. ✅ **🧹 CLEANS UP all old functions first** (CRITICAL for security)
2. ✅ **Recreates the complete database schema**
3. ✅ **Fixes all security warnings**
4. ✅ **Adds SECURITY DEFINER to all functions** (CRITICAL for RLS bypass)
5. ✅ **Adds correct volatility classifications** (CRITICAL for PostgreSQL compliance)
6. ✅ **Enables shared medical knowledge base**
7. ✅ **Maintains backward compatibility**
8. ✅ **Optimizes performance**
9. ✅ **Preserves all functionality**
10. ✅ **Ensures no orphaned functions remain**

**CRITICAL IMPROVEMENTS**: 
- All functions now include `SECURITY DEFINER` which allows them to execute with the privileges of their creator, bypassing RLS policies. This fixes the issue where `auth.uid()` returns NULL when using the service role key for operations like agent session creation.
- Functions now have correct volatility classifications: `STABLE` for read-only, `VOLATILE` for data-modifying, `IMMUTABLE` for pure computations.
- The `get_active_agent` function includes `STABLE` for PostgREST RPC compatibility.
- The `update_agent_last_active` function is correctly marked as `VOLATILE` to allow UPDATE operations.

Use this file to create the final migration that replaces all existing migration files and resolves all current database issues while maintaining a clean, secure function environment.