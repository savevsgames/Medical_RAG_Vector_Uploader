/*
  # Complete Schema Recreation with Security Fixes
  
  This migration recreates the entire database schema with all security fixes:
  1. Proper table structure with constraints
  2. Performance indexes
  3. Secure RLS policies with shared knowledge base
  4. Functions with SECURITY DEFINER, correct volatility, and fixed search paths
  5. Triggers for automation
  
  CRITICAL FIXES APPLIED:
  - All functions use SECURITY DEFINER to bypass RLS
  - Correct volatility classifications (STABLE/VOLATILE/IMMUTABLE)
  - Fixed search paths to prevent manipulation
  - Shared knowledge base (all users can read all documents)
  - Service role can manage agents for backend operations
*/

-- 🧹 CLEANUP: Drop any existing problematic functions first
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

-- Drop any legacy functions without schema prefix
DROP FUNCTION IF EXISTS match_documents(vector, float, int);
DROP FUNCTION IF EXISTS get_active_agent(uuid);
DROP FUNCTION IF EXISTS create_agent_session(uuid, text, jsonb);
DROP FUNCTION IF EXISTS terminate_agent_session(uuid);
DROP FUNCTION IF EXISTS update_agent_last_active(uuid);
DROP FUNCTION IF EXISTS cleanup_stale_agents();

-- 🔧 EXTENSIONS: Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";

-- 🗄️ TABLES: Create all tables with proper structure

-- Documents Table (Medical Knowledge Base)
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text,
    content text NOT NULL,
    embedding vector(768),
    metadata jsonb DEFAULT '{}'::jsonb,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- Agents Table (Session Management)
CREATE TABLE IF NOT EXISTS public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text DEFAULT 'initializing'::text,
    session_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    last_active timestamptz DEFAULT now(),
    terminated_at timestamptz
);

-- Embedding Jobs Table (Processing Tracking)
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

-- 📊 INDEXES: Create performance indexes

-- Documents indexes
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON public.documents 
USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents USING btree (user_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents USING btree (created_at);
CREATE INDEX IF NOT EXISTS documents_filename_idx ON public.documents USING btree (filename);

-- Agents indexes
CREATE INDEX IF NOT EXISTS agents_user_id_idx ON public.agents USING btree (user_id);
CREATE INDEX IF NOT EXISTS agents_status_idx ON public.agents USING btree (status);
CREATE INDEX IF NOT EXISTS agents_last_active_idx ON public.agents USING btree (last_active);

-- Embedding jobs indexes
CREATE INDEX IF NOT EXISTS embedding_jobs_user_id_idx ON public.embedding_jobs USING btree (user_id);
CREATE INDEX IF NOT EXISTS embedding_jobs_status_idx ON public.embedding_jobs USING btree (status);

-- 🔒 ROW LEVEL SECURITY: Enable RLS and create policies

-- Documents Table RLS - SHARED KNOWLEDGE BASE
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "All authenticated users can read all documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only upload as themselves" ON public.documents;
DROP POLICY IF EXISTS "Users can only edit their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only delete their own documents" ON public.documents;

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

-- Agents Table RLS - Allow service role for backend operations
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Allow agent inserts" ON public.agents;
DROP POLICY IF EXISTS "Service role can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Users can delete own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can select own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can update own agents" ON public.agents;

-- CRITICAL: Allow service role and authenticated users to insert agents
CREATE POLICY "Allow agent inserts"
    ON public.agents
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK ((current_user = 'service_role') OR (auth.uid() = user_id));

-- Service role can manage all agents (for backend operations)
CREATE POLICY "Service role can manage agents"
    ON public.agents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can delete their own agents
CREATE POLICY "Users can delete own agents"
    ON public.agents
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Users can select their own agents
CREATE POLICY "Users can select own agents"
    ON public.agents
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can update their own agents
CREATE POLICY "Users can update own agents"
    ON public.agents
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Embedding Jobs Table RLS
ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Allow embedding job inserts" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can delete own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can select own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can update own embedding jobs" ON public.embedding_jobs;

-- Allow service role and authenticated users to insert embedding jobs
CREATE POLICY "Allow embedding job inserts"
    ON public.embedding_jobs
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK ((current_user = 'service_role') OR (auth.uid() = user_id));

-- Users can delete their own embedding jobs
CREATE POLICY "Users can delete own embedding jobs"
    ON public.embedding_jobs
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Users can select their own embedding jobs
CREATE POLICY "Users can select own embedding jobs"
    ON public.embedding_jobs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can update their own embedding jobs
CREATE POLICY "Users can update own embedding jobs"
    ON public.embedding_jobs
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 🔧 FUNCTIONS: Create all functions with SECURITY DEFINER and correct volatility

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
    -- Terminate any existing active sessions for this user
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

-- Test User Documents Count (STABLE - Read-only)
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

-- Test Vector Similarity (IMMUTABLE - Pure computation)
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

-- Test Auth UID (STABLE - Read-only)
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

-- Create Test Medical Document (VOLATILE - Modifies data)
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

-- 🔄 TRIGGERS: Create triggers for automation

-- Drop existing trigger first
DROP TRIGGER IF EXISTS update_agent_last_active ON public.agents;

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

-- 🎯 GRANT PERMISSIONS: Ensure proper access

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Grant table permissions
GRANT ALL ON public.documents TO authenticated, service_role;
GRANT ALL ON public.agents TO authenticated, service_role;
GRANT ALL ON public.embedding_jobs TO authenticated, service_role;

-- Grant function permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Grant sequence permissions (for auto-generated IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;