/*
  # Complete Medical RAG Database Schema with Security Fixes
  
  1. Core Tables
    - `documents` - Medical documents with vector embeddings (768-dimensional)
    - `agents` - TxAgent session management and lifecycle tracking
    - `embedding_jobs` - Document processing job tracking
    
  2. Security Fixes
    - All functions include fixed search paths to prevent manipulation
    - Shared knowledge base: all authenticated users can read all documents
    - Proper RLS policies for data isolation where needed
    
  3. Performance Optimizations
    - Vector similarity search with IVFFlat indexes
    - Optimized indexes for frequently queried columns
    - Efficient RLS policies
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";

-- ============================================================================
-- COMPREHENSIVE CLEANUP - Remove all existing functions and policies
-- ============================================================================

-- Drop all existing functions that may have search path issues
DROP FUNCTION IF EXISTS public.match_documents(vector, float, int);
DROP FUNCTION IF EXISTS public.match_documents(vector, double precision, integer);
DROP FUNCTION IF EXISTS public.match_documents(vector(768), float, int);
DROP FUNCTION IF EXISTS public.match_documents(vector(768), double precision, integer);
DROP FUNCTION IF EXISTS match_documents(vector, float, int);
DROP FUNCTION IF EXISTS match_documents(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_documents(vector(768), float, int);
DROP FUNCTION IF EXISTS match_documents(vector(768), double precision, integer);

DROP FUNCTION IF EXISTS public.get_active_agent(uuid);
DROP FUNCTION IF EXISTS get_active_agent(uuid);
DROP FUNCTION IF EXISTS public.create_agent_session(uuid, text, jsonb);
DROP FUNCTION IF EXISTS create_agent_session(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.terminate_agent_session(uuid);
DROP FUNCTION IF EXISTS terminate_agent_session(uuid);
DROP FUNCTION IF EXISTS public.update_agent_last_active(uuid);
DROP FUNCTION IF EXISTS update_agent_last_active(uuid);
DROP FUNCTION IF EXISTS public.cleanup_stale_agents();
DROP FUNCTION IF EXISTS cleanup_stale_agents();

DROP FUNCTION IF EXISTS public.test_user_documents_count(uuid);
DROP FUNCTION IF EXISTS test_user_documents_count(uuid);
DROP FUNCTION IF EXISTS public.test_vector_similarity(vector, vector);
DROP FUNCTION IF EXISTS test_vector_similarity(vector, vector);
DROP FUNCTION IF EXISTS public.test_vector_similarity(vector(768), vector(768));
DROP FUNCTION IF EXISTS test_vector_similarity(vector(768), vector(768));
DROP FUNCTION IF EXISTS public.test_auth_uid();
DROP FUNCTION IF EXISTS test_auth_uid();
DROP FUNCTION IF EXISTS public.create_test_medical_document(text, text, uuid);
DROP FUNCTION IF EXISTS create_test_medical_document(text, text, uuid);

-- Drop trigger functions
DROP FUNCTION IF EXISTS public.update_agent_last_active_trigger();
DROP FUNCTION IF EXISTS update_agent_last_active_trigger();

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_agent_last_active ON public.agents;
DROP TRIGGER IF EXISTS agent_last_active_trigger ON public.agents;
DROP TRIGGER IF EXISTS agents_update_trigger ON public.agents;

-- Drop all existing RLS policies to start fresh
DROP POLICY IF EXISTS "Users can read own documents" ON public.documents;
DROP POLICY IF EXISTS "documents_user_isolation" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can read all documents" ON public.documents;
DROP POLICY IF EXISTS "All authenticated users can read all documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only upload as themselves" ON public.documents;
DROP POLICY IF EXISTS "Users can only edit their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can only upload documents as themselves" ON public.documents;
DROP POLICY IF EXISTS "Users can only insert as themselves" ON public.documents;

DROP POLICY IF EXISTS "Users can manage own agents" ON public.agents;
DROP POLICY IF EXISTS "agents_user_isolation" ON public.agents;

DROP POLICY IF EXISTS "Users can manage own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "embedding_jobs_user_isolation" ON public.embedding_jobs;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Documents table - stores medical documents with vector embeddings
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text,
    content text NOT NULL,
    embedding vector(768),
    metadata jsonb DEFAULT '{}'::jsonb,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- Agents table - manages TxAgent session lifecycle
CREATE TABLE IF NOT EXISTS public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text DEFAULT 'initializing'::text,
    session_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    last_active timestamptz DEFAULT now(),
    terminated_at timestamptz
);

-- Embedding jobs table - tracks document processing jobs
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

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Documents table indexes
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON public.documents 
USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents USING btree (user_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents USING btree (created_at);
CREATE INDEX IF NOT EXISTS documents_filename_idx ON public.documents USING btree (filename);

-- Agents table indexes
CREATE INDEX IF NOT EXISTS agents_user_id_idx ON public.agents USING btree (user_id);
CREATE INDEX IF NOT EXISTS agents_status_idx ON public.agents USING btree (status);
CREATE INDEX IF NOT EXISTS agents_last_active_idx ON public.agents USING btree (last_active);

-- Embedding jobs table indexes
CREATE INDEX IF NOT EXISTS embedding_jobs_user_id_idx ON public.embedding_jobs USING btree (user_id);
CREATE INDEX IF NOT EXISTS embedding_jobs_status_idx ON public.embedding_jobs USING btree (status);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Documents table RLS - CRITICAL: Shared knowledge base implementation
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

-- Agents table RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Users can manage their own agents
CREATE POLICY "Users can manage own agents"
    ON public.agents
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Embedding jobs table RLS
ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Users can manage their own embedding jobs
CREATE POLICY "Users can manage own embedding jobs"
    ON public.embedding_jobs
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- DATABASE FUNCTIONS WITH FIXED SEARCH PATHS
-- ============================================================================

-- Document search function - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.match_documents(
    query_embedding vector(768),
    match_threshold double precision DEFAULT 0.78,
    match_count integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    filename text,
    content text,
    metadata jsonb,
    user_id uuid,
    created_at timestamptz,
    similarity double precision
) 
LANGUAGE plpgsql 
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
        (1 - (documents.embedding <=> query_embedding))::double precision AS similarity
    FROM public.documents
    WHERE documents.embedding IS NOT NULL
        AND (1 - (documents.embedding <=> query_embedding)) > match_threshold
    ORDER BY documents.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Get active agent for user - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.get_active_agent(user_uuid uuid)
RETURNS TABLE (
    id uuid,
    status text,
    session_data jsonb,
    created_at timestamptz,
    last_active timestamptz
) 
LANGUAGE plpgsql 
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

-- Create agent session - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.create_agent_session(
    user_uuid uuid,
    initial_status text DEFAULT 'initializing',
    initial_session_data jsonb DEFAULT '{}'
)
RETURNS uuid 
LANGUAGE plpgsql 
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
    INSERT INTO public.agents (user_id, status, session_data)
    VALUES (user_uuid, initial_status, initial_session_data)
    RETURNING id INTO new_agent_id;
    
    RETURN new_agent_id;
END;
$$;

-- Terminate agent session - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.terminate_agent_session(user_uuid uuid)
RETURNS boolean 
LANGUAGE plpgsql 
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

-- Update agent last active - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.update_agent_last_active(agent_uuid uuid)
RETURNS boolean 
LANGUAGE plpgsql 
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

-- Cleanup stale agents - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.cleanup_stale_agents()
RETURNS integer 
LANGUAGE plpgsql 
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

-- Test user documents count - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.test_user_documents_count(user_uuid uuid)
RETURNS integer 
LANGUAGE plpgsql 
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

-- Test vector similarity - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.test_vector_similarity(
    vec1 vector(768),
    vec2 vector(768)
)
RETURNS double precision 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN (1 - (vec1 <=> vec2))::double precision;
END;
$$;

-- Test auth uid - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.test_auth_uid()
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN auth.uid();
END;
$$;

-- Create test medical document - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.create_test_medical_document(
    test_filename text DEFAULT 'test-medical-doc.txt',
    test_content text DEFAULT 'This is a test medical document containing cardiology and diagnosis information.',
    test_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid 
LANGUAGE plpgsql 
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

-- ============================================================================
-- TRIGGERS AND AUTOMATION
-- ============================================================================

-- Trigger function to update last_active - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.update_agent_last_active_trigger()
RETURNS trigger 
LANGUAGE plpgsql
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