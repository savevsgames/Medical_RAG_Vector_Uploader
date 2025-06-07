/*
  # Fix Row Level Security Policies for Documents and Embedding Jobs

  1. Changes
    - Drop all existing conflicting policies for documents table
    - Drop all existing conflicting policies for embedding_jobs table
    - Create consistent, secure RLS policies for authenticated users
    - Ensure users can only access their own data

  2. Security
    - Enforce user_id = auth.uid() for all operations
    - Maintain data isolation between users
    - Allow authenticated users full CRUD on their own data

  3. Tables Affected
    - documents: SELECT, INSERT, UPDATE, DELETE policies
    - embedding_jobs: SELECT, INSERT, UPDATE, DELETE policies
*/

-- Drop existing policies for documents table
DROP POLICY IF EXISTS "Only logged in users can insert" ON documents;
DROP POLICY IF EXISTS "Public read access" ON documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON documents;
DROP POLICY IF EXISTS "Users can read their own documents" ON documents;
DROP POLICY IF EXISTS "Authenticated users can read documents" ON documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON documents;

-- Create comprehensive policies for documents table
CREATE POLICY "Users can read their own documents"
ON documents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
ON documents
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
ON documents
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Drop existing policies for embedding_jobs table
DROP POLICY IF EXISTS "Users can insert their own embedding jobs" ON embedding_jobs;
DROP POLICY IF EXISTS "Users can read their own embedding jobs" ON embedding_jobs;
DROP POLICY IF EXISTS "Users can update their own embedding jobs" ON embedding_jobs;

-- Create comprehensive policies for embedding_jobs table
CREATE POLICY "Users can read their own embedding jobs"
ON embedding_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own embedding jobs"
ON embedding_jobs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own embedding jobs"
ON embedding_jobs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own embedding jobs"
ON embedding_jobs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Ensure RLS is enabled on both tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Update the match_documents function to handle the correct vector dimensions
-- The current function expects 1536 dimensions but documents table uses 768
DROP FUNCTION IF EXISTS match_documents(vector, float, int, uuid);

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  user_id uuid
)
RETURNS TABLE(
  id uuid,
  filename text,
  content text,
  metadata jsonb,
  similarity float
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

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION match_documents(vector, float, int, uuid) TO authenticated;