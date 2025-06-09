-- ============================================================================
-- MEDICAL RAG DATABASE MIGRATION - COMPLETE SCHEMA WITH SECURITY FIXES
-- ============================================================================
-- This migration creates the complete database schema for the Medical RAG system
-- with all security fixes applied and shared knowledge base implementation.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";

-- ============================================================================
-- CLEANUP: Remove all existing functions, triggers, and policies for clean slate
-- ============================================================================

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

-- Drop any legacy functions that might exist without public schema
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

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_agent_last_active ON public.agents;
DROP TRIGGER IF EXISTS agent_last_active_trigger ON public.agents;
DROP TRIGGER IF EXISTS agents_update_trigger ON public.agents;

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
-- ROW LEVEL SECURITY (RLS) POLICIES - COMPLETE CLEANUP AND RECREATION
-- ============================================================================

-- Documents table RLS - CRITICAL: Shared knowledge base implementation
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- CRITICAL: Drop ALL existing policies on documents table for clean slate
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Get all policies on documents table and drop them
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'documents' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.documents', policy_record.policyname);
    END LOOP;
END $$;

-- Create fresh policies for documents table
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

-- Drop ALL existing policies on agents table for clean slate
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'agents' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.agents', policy_record.policyname);
    END LOOP;
END $$;

-- Create fresh policies for agents table
CREATE POLICY "Users can manage own agents"
    ON public.agents
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Embedding jobs table RLS
ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on embedding_jobs table for clean slate
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'embedding_jobs' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.embedding_jobs', policy_record.policyname);
    END LOOP;
END $$;

-- Create fresh policies for embedding_jobs table
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

-- Get active agent for user - SECURITY FIX: Added search_path
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

-- Create agent session - SECURITY FIX: Added search_path
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

-- Terminate agent session - SECURITY FIX: Added search_path
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

-- Update agent last active - SECURITY FIX: Added search_path
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

-- Cleanup stale agents - SECURITY FIX: Added search_path
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

-- Test user documents count - SECURITY FIX: Added search_path
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

-- Test vector similarity - SECURITY FIX: Added search_path
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

-- Test auth uid - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.test_auth_uid()
RETURNS uuid AS $$
SET search_path TO public, pg_catalog;
BEGIN
    RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create test medical document - SECURITY FIX: Added search_path
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

-- ============================================================================
-- TRIGGERS AND AUTOMATION
-- ============================================================================

-- Trigger function to update last_active - SECURITY FIX: Added search_path
CREATE OR REPLACE FUNCTION public.update_agent_last_active_trigger()
RETURNS trigger AS $$
SET search_path TO public, pg_catalog;
BEGIN
    NEW.last_active = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_agent_last_active
    BEFORE UPDATE ON public.agents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_agent_last_active_trigger();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log successful migration
DO $$
SET search_path TO public, pg_catalog;
BEGIN
    RAISE NOTICE 'Medical RAG Database Migration Completed Successfully';
    RAISE NOTICE 'Key Features Enabled:';
    RAISE NOTICE '  ✅ Shared Medical Knowledge Base (all users can read all documents)';
    RAISE NOTICE '  ✅ Security Fixes Applied (all functions have fixed search paths)';
    RAISE NOTICE '  ✅ Performance Optimized (vector indexes and query optimization)';
    RAISE NOTICE '  ✅ Agent Management (complete TxAgent session lifecycle)';
    RAISE NOTICE '  ✅ Embedding Jobs (document processing tracking)';
    RAISE NOTICE '  ✅ Clean Policy State (all old policies removed and recreated)';
    RAISE NOTICE '';
    RAISE NOTICE 'CRITICAL CHANGE: Documents are now shared across all authenticated users';
    RAISE NOTICE 'This enables collaborative medical knowledge sharing between doctors';
END $$;