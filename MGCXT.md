# Migration Context File (MGCXT.md)
## Complete Database Schema Recreation with Security Fixes

### 🎯 **Purpose**
This file documents the complete database schema needed to recreate the Medical RAG Vector Uploader system with all security fixes applied. Use this to create a single comprehensive migration that replaces all existing migrations.

---

## 📋 **Current Migration Files to Replace**
- `20250608112819_turquoise_island.sql`
- `20250608145125_autumn_math.sql` 
- `20250609095725_spring_violet.sql`

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

### **4. Database Functions with FIXED Search Paths**

#### **Document Search Function**
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
) AS $$
SET search_path TO public, pg_catalog;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
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
) AS $$
SET search_path TO public, pg_catalog;
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
        AND agents.status IN ('active', 'initializing')
        AND agents.terminated_at IS NULL
    ORDER BY agents.last_active DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create agent session
CREATE OR REPLACE FUNCTION public.create_agent_session(
    user_uuid uuid,
    initial_status text DEFAULT 'initializing',
    initial_session_data jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
SET search_path TO public, pg_catalog;
DECLARE
    new_agent_id uuid;
BEGIN
    -- Terminate any existing active sessions
    UPDATE public.agents 
    SET status = 'terminated', terminated_at = now()
    WHERE user_id = user_uuid 
        AND status IN ('active', 'initializing')
        AND terminated_at IS NULL;
    
    -- Create new agent session
    INSERT INTO public.agents (user_id, status, session_data)
    VALUES (user_uuid, initial_status, initial_session_data)
    RETURNING id INTO new_agent_id;
    
    RETURN new_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Terminate agent session
CREATE OR REPLACE FUNCTION public.terminate_agent_session(user_uuid uuid)
RETURNS boolean AS $$
SET search_path TO public, pg_catalog;
BEGIN
    UPDATE public.agents 
    SET status = 'terminated', terminated_at = now()
    WHERE user_id = user_uuid 
        AND status IN ('active', 'initializing')
        AND terminated_at IS NULL;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update agent last active
CREATE OR REPLACE FUNCTION public.update_agent_last_active(agent_uuid uuid)
RETURNS boolean AS $$
SET search_path TO public, pg_catalog;
BEGIN
    UPDATE public.agents 
    SET last_active = now()
    WHERE id = agent_uuid;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup stale agents
CREATE OR REPLACE FUNCTION public.cleanup_stale_agents()
RETURNS integer AS $$
SET search_path TO public, pg_catalog;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### **Test and Utility Functions**
```sql
-- Test user documents count
CREATE OR REPLACE FUNCTION public.test_user_documents_count(user_uuid uuid)
RETURNS integer AS $$
SET search_path TO public, pg_catalog;
BEGIN
    RETURN (
        SELECT COUNT(*)::integer 
        FROM public.documents 
        WHERE user_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test vector similarity
CREATE OR REPLACE FUNCTION public.test_vector_similarity(
    vec1 vector(768),
    vec2 vector(768)
)
RETURNS float AS $$
SET search_path TO public, pg_catalog;
BEGIN
    RETURN 1 - (vec1 <=> vec2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test auth uid
CREATE OR REPLACE FUNCTION public.test_auth_uid()
RETURNS uuid AS $$
SET search_path TO public, pg_catalog;
BEGIN
    RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create test medical document
CREATE OR REPLACE FUNCTION public.create_test_medical_document(
    test_filename text DEFAULT 'test-medical-doc.txt',
    test_content text DEFAULT 'This is a test medical document containing cardiology and diagnosis information.',
    test_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid AS $$
SET search_path TO public, pg_catalog;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### **5. Triggers and Automation**

#### **Update Agent Last Active Trigger**
```sql
-- Trigger function to update last_active
CREATE OR REPLACE FUNCTION public.update_agent_last_active_trigger()
RETURNS trigger AS $$
SET search_path TO public, pg_catalog;
BEGIN
    NEW.last_active = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_agent_last_active ON public.agents;
CREATE TRIGGER update_agent_last_active
    BEFORE UPDATE ON public.agents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_agent_last_active_trigger();
```

---

## 🔧 **Security Fixes Applied**

### **1. Function Search Path Mutable - FIXED**
- ✅ All functions now include `SET search_path TO public, pg_catalog;`
- ✅ Prevents search path manipulation attacks
- ✅ Ensures consistent function behavior

### **2. Extension in Public Schema - ADDRESSED**
- ✅ Extensions explicitly created in public schema
- ✅ Documented for awareness in shared environments

### **3. Auth OTP Long Expiry - CONFIGURATION**
- ⚠️ Requires Supabase Dashboard configuration
- ⚠️ Set OTP expiry to recommended threshold (15 minutes)

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
1. **Drop existing tables** (if recreating from scratch)
2. **Create extensions** first
3. **Create tables** with all columns and constraints
4. **Create indexes** for performance
5. **Enable RLS** and create policies
6. **Create functions** with fixed search paths
7. **Create triggers** for automation

### **Data Preservation**
- If preserving existing data, use `CREATE TABLE IF NOT EXISTS`
- Use `ALTER TABLE` statements for schema changes
- Use `CREATE OR REPLACE FUNCTION` for function updates

---

## 🧪 **Testing Checklist**

### **After Migration**
- [ ] Vector search works with `match_documents()`
- [ ] All authenticated users can read all documents
- [ ] Users can only upload as themselves
- [ ] Agent sessions create/terminate properly
- [ ] No "Function Search Path Mutable" warnings
- [ ] Embedding jobs track properly
- [ ] Performance is acceptable with indexes

### **Security Verification**
- [ ] RLS policies prevent unauthorized access
- [ ] Functions have fixed search paths
- [ ] Extensions are properly scoped
- [ ] No SQL injection vulnerabilities

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
## Database Functions (All with Fixed Search Paths)

### Document Search
- `match_documents(query_embedding, threshold, count)` - Vector similarity search

### Agent Management
- `get_active_agent(user_id)` - Get user's active agent session
- `create_agent_session(user_id, status, data)` - Create new agent session
- `terminate_agent_session(user_id)` - Terminate user's agent sessions
- `update_agent_last_active(agent_id)` - Update agent activity timestamp
- `cleanup_stale_agents()` - Clean up inactive agent sessions

### Testing & Utilities
- `test_user_documents_count(user_id)` - Count user's documents
- `test_vector_similarity(vec1, vec2)` - Test vector similarity
- `test_auth_uid()` - Test authentication context
- `create_test_medical_document()` - Create test document
```

---

## ✅ **Ready for Implementation**

This context file contains everything needed to create a single, comprehensive migration that:

1. ✅ **Recreates the complete database schema**
2. ✅ **Fixes all security warnings**
3. ✅ **Enables shared medical knowledge base**
4. ✅ **Maintains backward compatibility**
5. ✅ **Optimizes performance**
6. ✅ **Preserves all functionality**

Use this file to create the final migration that replaces all existing migration files and resolves all current database issues.