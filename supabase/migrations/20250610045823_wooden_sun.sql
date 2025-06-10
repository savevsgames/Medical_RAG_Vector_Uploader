-- 🧹 CRITICAL CLEANUP FIRST - Remove ALL existing functions and policies

-- Drop all existing RLS policies to start fresh
DROP POLICY IF EXISTS "Users can read own documents" ON public.documents;
DROP POLICY IF EXISTS "documents_user_isolation" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can read all documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only upload as themselves" ON public.documents;
DROP POLICY IF EXISTS "Users can only edit their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only upload documents as themselves" ON public.documents;
DROP POLICY IF EXISTS "Users can only insert as themselves" ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can read all documents" ON public.documents;

DROP POLICY IF EXISTS "Users can manage own agents" ON public.agents;
DROP POLICY IF EXISTS "agents_user_isolation" ON public.agents;
DROP POLICY IF EXISTS "Allow agent inserts" ON public.agents;
DROP POLICY IF EXISTS "Service role can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Users can delete own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can select own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can update own agents" ON public.agents;

DROP POLICY IF EXISTS "Users can manage own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "embedding_jobs_user_isolation" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Allow embedding job inserts" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can delete own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can select own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can update own embedding jobs" ON public.embedding_jobs;

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_agent_last_active ON public.agents;
DROP TRIGGER IF EXISTS agent_last_active_trigger ON public.agents;
DROP TRIGGER IF EXISTS agents_update_trigger ON public.agents;

-- Drop ALL existing functions (including any legacy versions)
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
DROP FUNCTION IF EXISTS public.update_agent_last_active_trigger();

-- Drop any functions without public schema prefix
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
DROP FUNCTION IF EXISTS update_agent_last_active_trigger();

-- 🗄️ RECREATE CLEAN RLS POLICIES

-- Documents Table RLS - SHARED KNOWLEDGE BASE
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read all documents"
    ON public.documents
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can only upload as themselves"
    ON public.documents
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only edit their own documents"
    ON public.documents
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own documents"
    ON public.documents
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Agents Table RLS - CRITICAL: Allow service role to manage agents
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- FIXED: Use current_user instead of role() function
CREATE POLICY "Allow agent inserts"
    ON public.agents
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK ((current_user = 'service_role') OR (auth.uid() = user_id));

CREATE POLICY "Service role can manage agents"
    ON public.agents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can delete own agents"
    ON public.agents
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can select own agents"
    ON public.agents
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own agents"
    ON public.agents
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Embedding Jobs Table RLS
ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;

-- FIXED: Use current_user instead of role() function
CREATE POLICY "Allow embedding job inserts"
    ON public.embedding_jobs
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK ((current_user = 'service_role') OR (auth.uid() = user_id));

CREATE POLICY "Users can delete own embedding jobs"
    ON public.embedding_jobs
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can select own embedding jobs"
    ON public.embedding_jobs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own embedding jobs"
    ON public.embedding_jobs
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 🔧 RECREATE ALL FUNCTIONS WITH SECURITY DEFINER AND CORRECT NAMES

-- Document Search Function (STABLE - Read-only)
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

-- Get Active Agent (STABLE - Read-only)
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
        AND agents.status IN ('active', 'initializing')
        AND agents.terminated_at IS NULL
    ORDER BY agents.last_active DESC
    LIMIT 1;
END;
$$;

-- CRITICAL: Create Agent Session (VOLATILE - Modifies data)
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
        AND status IN ('active', 'initializing')
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

-- Terminate Agent Session (VOLATILE - Modifies data)
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

-- Update Agent Last Active (VOLATILE - Modifies data)
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

-- Cleanup Stale Agents (VOLATILE - Modifies data)
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

-- Test Functions
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